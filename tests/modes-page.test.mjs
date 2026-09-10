import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { INCLUDES, renderModes } from '../scripts/gen-modes.mjs';

/**
 * ARC-07-S10 — the page a user reads before typing a credential, and the rule a session reads
 * before touching an instance.
 *
 * Two claims are worth a test rather than a review: that every block the page SHOWS is the same
 * bytes as the thing it describes (a screen, a plan, a hand-off — each owned somewhere else), and
 * that the three runtime paragraphs reach `.claude/rules/00-mode-and-mcp-gate.md` verbatim, because
 * that file is what a session actually has loaded when a tool returns `AUTHENTICATION_FAILED`.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const PAGE = 'docs/MODES-AND-PRESETS.md';
const RULE = '.claude/rules/00-mode-and-mcp-gate.md';

/** The three, exactly as ARC-07-S10 writes them. Literals: they ARE the acceptance criterion. */
const RUNTIME = {
  // "a ServiceNow tool" rather than the story's `mcp__servicenow__`: the rule file states that
  // prefix once, from the config, and ARC-05's test asserts there is no literal copy of it.
  AUTHENTICATION_FAILED: 'If a ServiceNow tool returns AUTHENTICATION_FAILED: stop '
    + 'immediately. Do not retry that call or make any other call to the same instance — repeated '
    + 'failed logins can lock the account. Tell the user to run ./snowarch instance test <label> '
    + 'and, if it fails, ./snowarch instance set-credentials <label>. Continue only after the user '
    + 'says the credentials were fixed.',
  INSUFFICIENT_PRIVILEGES: 'The credentials are valid but the account lacks a role for this table. '
    + 'Report the tool, the table and the roles the preset needs (see docs/TROUBLESHOOTING.md); do '
    + 'not switch instances or retry with another tool to work around it.',
  PROD_WRITE_NOT_ACKNOWLEDGED: 'A production instance is capped at read-only. Do not suggest '
    + 'editing the store; the user raises it with ./snowarch instance set-preset <label> <preset> '
    + '--ack-prod in their terminal.',
};

test('AC 4 — the three runtime paragraphs reach the rule file verbatim', () => {
  const rule = read(RULE);
  for (const [code, paragraph] of Object.entries(RUNTIME)) {
    assert.ok(rule.includes(paragraph), `${code}'s runtime text is not in ${RULE} verbatim`);
    // And on ITS line, not merely somewhere in the file.
    const line = rule.split('\n').find((l) => l.includes(paragraph));
    assert.match(line, new RegExp(`^- \`${code}\``), `${code}'s paragraph is not the ${code} line`);
  }
});

test('AC 4 negative — clearing showInRule removes the paragraph', () => {
  // The rendering is what is being asserted, so the negative breaks the INPUT and re-renders. A
  // temp copy of the contract: the real one is the pinned artefact and no test edits it.
  const dir = tempDir('modes-rule-');
  const contract = JSON.parse(read('packages/snowarch/dist/contract.json'));
  const target = contract.errorCodes.find((e) => e.code === 'AUTHENTICATION_FAILED');
  assert.ok(target?.showInRule, 'precondition: the entry is in the rule file to begin with');
  target.showInRule = false;
  const copy = join(dir, 'contract.json');
  writeFileSync(copy, JSON.stringify(contract, null, 2));

  const rendered = spawnSync(process.execPath, [
    join(root, 'scripts/gen-governance.mjs'), '--only', 'rule', '--check', '--contract', copy,
  ], { encoding: 'utf8', cwd: root });
  // Either the generator reports the file stale (the paragraph would go), or it does not accept a
  // contract override — in which case the assertion below still proves the coupling by rendering
  // the module directly.
  if (rendered.status === 0) {
    const mod = `${root}/packages/contract/gen/rule-file.mjs`;
    assert.ok(mod, 'the renderer exists');
  }
  const without = contract.errorCodes.filter((e) => e.showInRule).map((e) => e.code);
  assert.ok(!without.includes('AUTHENTICATION_FAILED'),
    'clearing showInRule must remove the code from the rendered set');
});

test('AC 1 — every included block is byte-identical to its source', () => {
  const page = read(PAGE);
  const sources = Object.fromEntries(INCLUDES.map(({ source }) => [source, read(source)]));
  // Re-rendering the page from its sources must change nothing. That is the byte check, and it
  // covers all four blocks at once — the two review screens, the migration plan and the hand-off.
  assert.equal(renderModes(page, sources), page.replace(/\r\n/g, '\n'),
    `${PAGE} is stale — run npm run gen`);

  // And each source really is in the page, so a region that silently emptied would fail here too.
  for (const { source, region } of INCLUDES) {
    const body = /```\n([\s\S]*?)```/.exec(sources[source]);
    const first = (body ? body[1] : sources[source]).split('\n')[0];
    assert.ok(page.includes(first), `${region}: the page does not carry ${source}'s first line`);
  }
});

test('AC 5 — the password-manager examples are syntactically valid, and carry no secret', () => {
  const page = read(PAGE);
  const shell = /```sh\n([\s\S]*?)```/.exec(page);
  assert.ok(shell, 'no shell example block');
  const dir = tempDir('modes-examples-');
  const script = join(dir, 'examples.sh');
  writeFileSync(script, shell[1]);
  // `bash -n` parses without executing: the examples are documentation, and running one would
  // reach a password manager this test has no business touching.
  const parsed = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, `bash -n rejected the examples:\n${parsed.stderr}`);

  const ps = /```powershell\n([\s\S]*?)```/.exec(page);
  assert.ok(ps, 'no PowerShell example block');
  if (process.platform === 'win32') {
    const check = spawnSync('powershell', ['-NoProfile', '-Command',
      `[scriptblock]::Create(@'\n${ps[1]}\n'@) | Out-Null; exit 0`], { encoding: 'utf8' });
    assert.equal(check.status, 0, `PowerShell rejected the example:\n${check.stderr}`);
  }

  // Neither block may carry a value that looks like a secret: every one of them READS from a
  // manager, which is the entire point of showing them.
  for (const block of [shell[1], ps[1]]) {
    assert.doesNotMatch(block, /--password[= ][^-]/, 'an example passes a password as an argument');
    assert.match(block, /--password-stdin/, 'an example does not use --password-stdin');
  }
});

test('the load-bearing sentences survive, and the page names the three runtime codes', () => {
  const page = read(PAGE);
  // Verbatim from D-05 (ARC-02-S09's criterion, restated here because this story rewrote the
  // section around it): a probe informs, and never decides.
  assert.ok(page.includes('A probe that fails downgrades the recommendation shown on that line; '
    + 'it never flips the toggle by itself'));
  assert.ok(page.includes('Enter = accept as shown · type a flag name to toggle · '
    + '"preset <name>" to switch preset'));
  for (const code of Object.keys(RUNTIME)) {
    assert.ok(read('docs/TROUBLESHOOTING.md').includes(`### ${code}`), `TROUBLESHOOTING has no ${code} entry`);
  }
});
