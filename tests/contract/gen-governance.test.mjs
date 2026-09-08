import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `scripts/gen-governance.mjs`, driven through the CLI.
 *
 * The point of this generator is that the rule a session obeys names what the server actually has.
 * So almost every case here renders against a FIXTURE contract that differs from the real one — a
 * different protocol, a seventh flag, three mutating tools, another server key — and asserts the
 * output followed. A test that only rendered the real contract would pass just as well against a
 * renderer with the answers typed into it, which is the defect this story exists to remove.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(root, 'scripts', 'gen-governance.mjs');
const RULE = '.claude/rules/00-mode-and-mcp-gate.md';
const PAGE = 'docs/MODES-AND-PRESETS.md';

const realContract = () => JSON.parse(readFileSync(join(root, 'packages/snowarch/dist/contract.json'), 'utf8'));

function tree(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-gov-'));
  const write = (rel, body) => {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  const contract = realContract();
  const config = { mcp: { serverKey: 'servicenow' } };
  const state = { contract, config, write, dir };
  mutate(state);
  write('packages/snowarch/dist/contract.json', `${JSON.stringify(state.contract, null, 2)}\n`);
  write('engine.config.json', `${JSON.stringify(state.config, null, 2)}\n`);
  // The page is a block target, so it must exist with its markers before the generator runs.
  write(PAGE, readFileSync(join(root, PAGE), 'utf8'));
  return dir;
}

function run(dir, args = []) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, '--root', dir, ...args], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { code: e.status ?? -1, out: e.stdout ?? '', err: e.stderr ?? '' };
  }
}

const ruleOf = (dir) => readFileSync(join(dir, RULE), 'utf8');
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('criterion 1 — the rule file is written, is short, and has no frontmatter', () => {
  const dir = tree();
  try {
    assert.equal(run(dir).code, 0);
    const text = ruleOf(dir);
    // `.claude/rules/*.md` without `paths:` frontmatter loads at launch (`00` §9). A file that
    // opened with `---` would load conditionally, which for this file means not at all.
    assert.ok(!text.startsWith('---'), 'frontmatter would make it conditional');
    assert.ok(!/^paths:/m.test(text));
    const lines = text.trimEnd().split('\n').length;
    assert.ok(lines <= 45, `${lines} lines, budget 45`);
    console.log(`    rule file: ${lines} lines`);
  } finally { cleanup(dir); }
});

test('criterion 2 — the prefix appears exactly once and comes from engine.config.json', () => {
  const dir = tree();
  try {
    run(dir);
    assert.equal(ruleOf(dir).match(/mcp__servicenow__/g).length, 1);

    // The same tree with a different server key. If the prefix were a literal this passes anyway,
    // so the assertion that matters is the OLD one being gone.
    const other = tree((s) => { s.config.mcp.serverKey = 'snow'; });
    try {
      run(other);
      const text = ruleOf(other);
      assert.equal(text.match(/mcp__snow__/g).length, 1);
      assert.ok(!text.includes('mcp__servicenow__'), 'the old prefix survived a key change');
    } finally { cleanup(other); }
  } finally { cleanup(dir); }
});

test('criterion 3 — the capture steps come from the contract, not from the prose', () => {
  // The fourth step is whatever the protocol's last entry says, even when that is absurd.
  const dir = tree((s) => {
    s.contract.protocols.updateSetCapture = [
      'snow_us_active_update_set_ensure', 'snow_us_capture_target_set', '<write>', 'snow_core_records_query',
    ];
  });
  try {
    run(dir);
    const text = ruleOf(dir);
    assert.match(text, /4\. Verify: `snow_core_records_query`/);
    assert.ok(!text.includes('snow_us_update_set_preview'), 'the real name was typed in somewhere');
  } finally { cleanup(dir); }

  const real = tree();
  try {
    run(real);
    const text = ruleOf(real);
    assert.match(text, /1\. `snow_us_active_update_set_ensure`/);
    assert.match(text, /2\. `snow_us_capture_target_set`/);
    assert.match(text, /4\. Verify: `snow_us_update_set_preview`/);
    // The retired vocabulary of the four-places-two-generations era (P-33).
    for (const dead of ['create_update_set', 'switch_update_set', 'query_records', 'updateSetSysId']) {
      assert.ok(!text.includes(dead), `${dead} is in the rule file`);
    }
  } finally { cleanup(real); }
});

test('criterion 4 — a seventh flag adds a row, with no renderer change', () => {
  const dir = tree((s) => {
    s.contract.flags.push({ name: 'TIME_TRAVEL_ENABLED', exactString: 'true', absentMeans: false, requires: ['WRITE_ENABLED'] });
  });
  try {
    run(dir);
    const text = ruleOf(dir);
    assert.match(text, /\| `TIME_TRAVEL_ENABLED` \| `TIME_TRAVEL_NOT_ENABLED` \| `WRITE_ENABLED` \|/);
    const rows = text.split('\n').filter((l) => /^\| `[A-Z_]+` \| `[A-Z_]+_NOT_ENABLED`/.test(l));
    assert.equal(rows.length, 7);
  } finally { cleanup(dir); }
});

test('criterion 5 — the ask count is the union of mutates and sessionMutates', () => {
  // Two mutating tools and one session-mutating one is THREE, not two: switching instance changes
  // no record and decides where every later write lands (ARC-04-S10's ruling).
  const dir = tree((s) => {
    s.contract.tools = [
      { name: 'snow_a_add', gate: 'write', mutates: true },
      { name: 'snow_b_modify', gate: 'write', mutates: true },
      { name: 'snow_c_switch', gate: 'none', mutates: false, sessionMutates: true },
      { name: 'snow_d_read', gate: 'none', mutates: false },
    ];
  });
  try {
    run(dir);
    assert.match(ruleOf(dir), /— 3 tools;/);
  } finally { cleanup(dir); }

  const real = tree();
  try {
    run(real);
    const c = realContract();
    const expected = c.tools.filter((t) => t.mutates === true || t.sessionMutates === true).length;
    assert.match(ruleOf(real), new RegExp(`— ${expected} tools;`));
    console.log(`    ask list: ${expected} tools (mutates ∪ sessionMutates)`);
  } finally { cleanup(real); }
});

test('criterion 4a — the block replaces only itself, and missing markers cannot run', () => {
  const dir = tree();
  try {
    const before = readFileSync(join(dir, PAGE), 'utf8');
    assert.equal(run(dir, ['--only', 'presets']).code, 0);
    const after = readFileSync(join(dir, PAGE), 'utf8');

    // Everything outside the markers is byte-identical — the page's prose is hand-written and the
    // generator has no business in it.
    const split = (t) => {
      const lines = t.split('\n');
      const b = lines.findIndex((l) => l.startsWith('<!-- PRESETS:BEGIN'));
      const e = lines.findIndex((l) => l === '<!-- PRESETS:END -->');
      return { head: lines.slice(0, b + 1).join('\n'), tail: lines.slice(e).join('\n'), body: lines.slice(b + 1, e) };
    };
    assert.equal(split(after).head, split(before).head);
    assert.equal(split(after).tail, split(before).tail);
    // And on the first run it changed nothing at all: ARC-02-S09 hand-copied this table from
    // `01` §6.3, so a rendered table that differed would mean one of the two is wrong about the
    // server rather than that the generator has taken over.
    assert.equal(after, before);

    const body = split(after).body;
    assert.equal(body.length, 6, body.join('\n'));
    assert.match(body[0], /^\| Preset \| WRITE \| CMDB_WRITE \| SCRIPTING \| ATF \| NOW_ASSIST \| FLUENT \| Use it when… \|$/);
    assert.match(body[2], /^\| `read-only` \| false \| false \| false \| false \| false \| false \|/);
    assert.match(body[3], /^\| `pdi-developer` \| true \| true \| true \| true \| false \| false \|/);
    assert.match(body[4], /^\| `full` \| true \| true \| true \| true \| true \| true \|/);
    assert.match(body[5], /^\| `custom` \| six explicit toggles \|/);
  } finally { cleanup(dir); }

  const noMarkers = tree();
  try {
    writeFileSync(join(noMarkers, PAGE), '# Page\n\nNo markers here.\n');
    const r = run(noMarkers, ['--only', 'presets']);
    // Exit 2, not 1: the target could not be located, which is not the same as being out of date.
    assert.equal(r.code, 2);
    assert.match(r.err, /presets: markers not found in docs\/MODES-AND-PRESETS\.md — see ARC-02 S09/);
  } finally { cleanup(noMarkers); }
});

test('criterion 6 — --check is green after a run and names the line after an edit', () => {
  const dir = tree();
  try {
    run(dir);
    const clean = run(dir, ['--check']);
    assert.equal(clean.code, 0);
    assert.match(clean.out, /2 target\(s\) current \(contract [0-9a-f]{12}\)/);

    const p = join(dir, RULE);
    writeFileSync(p, readFileSync(p, 'utf8').replace('never infer mode', 'sometimes infer mode'));
    const dirty = run(dir, ['--check']);
    assert.equal(dirty.code, 1);
    assert.match(dirty.out, /^-.*sometimes infer mode/m);
    assert.match(dirty.out, /^\+.*never infer mode/m);
    assert.match(dirty.out, /run npm run gen and commit the result/);
  } finally { cleanup(dir); }
});

test('the header carries the contract sha, so any contract change is a diff', () => {
  const a = tree();
  const b = tree((s) => { s.contract.maxRecordsDefault = 99; });
  try {
    run(a); run(b);
    const shaOf = (dir) => ruleOf(dir).match(/sha256 ([0-9a-f]{12})/)[1];
    assert.notEqual(shaOf(a), shaOf(b), 'the header did not follow the contract');
    // And the header names the module to edit, because the first instinct is to edit the output.
    assert.match(ruleOf(a), /edit packages\/contract\/gen\/rule-file\.mjs and run npm run gen/);
  } finally { cleanup(a); cleanup(b); }
});

test('rendering is deterministic', () => {
  const dir = tree();
  try {
    run(dir);
    const first = ruleOf(dir);
    run(dir);
    assert.equal(ruleOf(dir), first);
    assert.match(run(dir).out, /already current/);
  } finally { cleanup(dir); }
});

test('the runtime remedies are the registry\'s, not a second copy', () => {
  const dir = tree((s) => {
    const e = s.contract.errorCodes.find((x) => x.code === 'NO_INSTANCE_CONFIGURED');
    e.remedy = 'run the wizard, obviously';
  });
  try {
    run(dir);
    assert.match(ruleOf(dir), /`NO_INSTANCE_CONFIGURED` → run the wizard, obviously\./);
  } finally { cleanup(dir); }
});

test('a code the rule file names but the registry does not have is a hard failure', () => {
  // Silently omitting the line would leave a session with no remedy for an error it will meet.
  const dir = tree((s) => {
    s.contract.errorCodes = s.contract.errorCodes.filter((e) => e.code !== 'UNKNOWN_TOOL');
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /UNKNOWN_TOOL is not in contract\.errorCodes/);
  } finally { cleanup(dir); }
});

test('the two "not a substitute" tools are real tools in the contract', () => {
  // The claim about them (they refuse with UNSUPPORTED_ON_THIS_INSTANCE) is not in the contract —
  // no field marks a stub — so the names are a literal in the renderer. What can be enforced is
  // that they are names the server still answers: a rule file telling a reader not to use a tool
  // that no longer exists is noise, and one naming a tool that was renamed is wrong.
  const names = new Set(realContract().tools.map((t) => t.name));
  for (const n of ['snow_deploy_background_script_exec', 'snow_fluent_script_exec', 'snow_us_update_set_switch']) {
    assert.ok(names.has(n), `${n} is not in the contract`);
  }
});

test('the generated files are in the repository and current', () => {
  // The committed state, not a fixture: `npm run lint` runs `--check`, and this says the same thing
  // at the point a reader is looking at the suite.
  assert.ok(existsSync(join(root, RULE)));
  const r = run(root, ['--check']);
  assert.equal(r.code, 0, r.out);
});
