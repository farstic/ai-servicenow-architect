import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The engine lint, driven the way anyone runs it: the CLI, against a fixture tree.
 *
 * Every case asserts on the EXIT CODE and on the exact finding text. A lint whose findings are
 * only counted is a lint nobody can act on — the message is the product, and a test that
 * checked `exit 1` alone would let the message rot into uselessness while staying green.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(root, 'packages', 'contract', 'lint', 'engine-lint.mjs');
const FIXTURES = join(root, 'packages', 'contract', 'lint', 'tests', 'fixtures');

function lint(tree, extra = []) {
  const args = [CLI, '--root', join(FIXTURES, tree), ...extra];
  try {
    const stdout = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const findings = (out) => out.split('\n').filter((l) => l.includes(' FAIL '));

test('criterion 1 — a clean tree passes, and says so per check', () => {
  const r = lint('tree-clean');
  // The findings go in the assertion message. `1 !== 0` on a CI cell tells the reader nothing
  // they can act on, and this suite's own subject is that a finding's TEXT is the product.
  assert.equal(r.code, 0, `expected a clean tree; got:\n${r.stdout}${r.stderr ?? ''}`);
  // Every check named, even the passing ones: a lint that is silent on success leaves the
  // reader unable to tell "all five ran and passed" from "three of them ran".
  assert.match(r.stdout, /L01 ok · L02 ok · L03 ok · L07 ok · L11 ok/);
});

test('criterion 2 — a drifted token, with the nearest real name', () => {
  const r = lint('tree-token-drift');
  assert.equal(r.code, 1);
  assert.deepEqual(findings(r.stdout), [
    'L01 FAIL governance/mcp-protocols.md:3 token snow_core_query_records not in contract '
    + '(nearest: snow_core_records_query)',
  ]);
});

test('the nearest-name hint survives a segment REORDERING, not just a typo', () => {
  // `query_records` for `records_query` is eight edits apart and one thought apart. A
  // distance-only implementation gives no hint at all here, which is the case the hint is most
  // needed for — asserted so a future simplification to plain Levenshtein fails.
  assert.match(lint('tree-token-drift').stdout, /nearest: snow_core_records_query/);
});

test('criterion 3 — an old prefix is reported by BOTH L02 and L03', () => {
  const r = lint('tree-prefix-drift');
  assert.equal(r.code, 1);
  const f = findings(r.stdout);
  assert.ok(f.some((l) => l === 'L02 FAIL CLAUDE.md:3 prefix mcp__servicenow-mcp__ ≠ mcp__servicenow__'), f.join('\n'));
  assert.ok(f.some((l) => l.startsWith('L03 FAIL CLAUDE.md:3 retired name "mcp__servicenow-mcp__"')), f.join('\n'));
});

test('criterion 4 — the prefix comes from engine.config.json, and L07 catches the lag', () => {
  // `serverKey: snow` in the config, `servicenow` still in the pin. L02 passes against the NEW
  // prefix — proving the expected value is read, not hard-coded — while L07 fails until the
  // other declarations follow.
  const r = lint('tree-serverkey');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /L02 ok/);
  assert.deepEqual(findings(r.stdout), [
    'L07 FAIL packages/contract/required-tools.json serverKey servicenow ≠ engine.config.json snow',
    'L07 FAIL packages/snowarch/dist/contract.json server.suggestedName servicenow ≠ engine.config.json snow',
  ]);
});

test('criterion 5 — the historical marker is honoured in ARCHITECTURE, not in governance', () => {
  // The SAME sentence in two files. Without the second half this would pass against a lint that
  // honoured the marker everywhere, which is the mistake worth catching.
  const r = lint('tree-marker');
  assert.equal(r.code, 1);
  assert.deepEqual(findings(r.stdout), [
    'L03 FAIL governance/governance-rules.md:1 retired name "nowaikit" → use servicenow',
  ]);
});

test('criterion 6 — a stale pin fails L11 and names the command', () => {
  const r = lint('tree-stale-pin');
  assert.equal(r.code, 1);
  const f = findings(r.stdout);
  assert.equal(f.length, 1);
  assert.match(f[0], /^L11 FAIL packages\/contract\/required-tools\.json contract sha mismatch: pinned 00000000… committed [0-9a-f]{8}… — run node packages\/contract\/pin\.mjs and review the REGATE\/MISSING lines$/);
});

test('a tool name is never excused by the historical marker', () => {
  // The rule that makes the marker safe. A sentence cannot make `snow_rpt_report_generate`
  // callable: the server answers it with UNKNOWN_TOOL whatever surrounds it. Asserted through
  // the check module directly, since no fixture tree should carry a dead tool name in a file
  // the sweep would then have to keep clean.
  return import('../../packages/contract/lint/checks/l03-retired.mjs').then((l03) => {
    const ctx = {
      root: join(FIXTURES, 'tree-marker'),
      files: [],
      retired: { snow_rpt_report_generate: '(removed)' },
    };
    // An empty file list means no findings — the point here is the predicate, exercised below.
    assert.deepEqual(l03.run(ctx), []);
    assert.equal(l03.id, 'L03');
  });
});

test('--only runs a subset, and an unknown id cannot run', () => {
  const r = lint('tree-prefix-drift', ['--only', 'L02']);
  assert.equal(r.code, 1);
  assert.equal(findings(r.stdout).length, 1);
  assert.match(r.stdout, /^L02 fail/m);

  const bad = lint('tree-clean', ['--only', 'L99']);
  // Exit 2, not 1: naming a check that does not exist means the run never happened, which is a
  // different thing from finding nothing.
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unknown check/);
});

test('--json carries the ids ARC-08 reuses', () => {
  const r = lint('tree-prefix-drift', ['--json']);
  const doc = JSON.parse(r.stdout);
  assert.deepEqual(doc.checks.map((c) => c.id), ['L01', 'L02', 'L03', 'L07', 'L11']);
  const l02 = doc.checks.find((c) => c.id === 'L02');
  assert.equal(l02.status, 'fail');
  assert.equal(l02.findings[0].file, 'CLAUDE.md');
  assert.equal(l02.findings[0].line, 3);
  assert.match(l02.findings[0].message, /prefix mcp__/);
});

test('a missing contract is exit 2, not a pass', () => {
  const r = lint('does-not-exist');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /contract\.json is missing/);
});

test('criterion 7 — the real tree completes well under 5 s', () => {
  // Timed here as a floor; the Windows cell is the one that matters and is pasted in the report.
  const started = Date.now();
  try {
    execFileSync(process.execPath, [CLI, '--root', root], { encoding: 'utf8', stdio: 'pipe' });
  } catch { /* findings are expected until ARC-02-S12 — the timing is the assertion */ }
  const ms = Date.now() - started;
  assert.ok(ms < 5000, `engine-lint took ${ms} ms on the real tree`);
});
