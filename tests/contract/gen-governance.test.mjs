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
  const config = { mcp: { serverKey: 'servicenow', permissions: { allowStyle: 'explicit', askStyle: 'ask' } } };
  const state = { contract, config, write, dir };
  mutate(state);
  write('packages/snowarch/dist/contract.json', `${JSON.stringify(state.contract, null, 2)}\n`);
  write('engine.config.json', `${JSON.stringify(state.config, null, 2)}\n`);
  // The page is a block target, so it must exist with its markers before the generator runs.
  write(PAGE, readFileSync(join(root, PAGE), 'utf8'));
  // The pin is an input too since ARC-05-S06: `protocols.mjs` joins it with the contract, and the
  // CLI reads it before dispatching, so a tree without it cannot run at all.
  write('packages/contract/required-tools.json', readFileSync(join(root, 'packages/contract/required-tools.json'), 'utf8'));
  // And the retired names: `permissions.mjs` recognises an entry for a tool the server used to
  // have as one of its own, so a rename does not strand a dead rule.
  write('packages/contract/retired-names.json', readFileSync(join(root, 'packages/contract/retired-names.json'), 'utf8'));
  // A settings file is optional: `permissions.mjs` builds one from `{ permissions: {} }` when
  // there is none, which is how it was created in the first place.
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
    // 45 until ARC-08-S10, which finished the runtime section: the network family (DNS, TLS, both
    // proxy codes, the timeout) and `INSTANCE_NOT_LOADED` became rule-visible, because a session
    // that meets one of them mid-task must hand over exactly as it does for a wrong password, and
    // the instruction paragraph and the placeholder sentence came with them. Six code lines and
    // four of prose is +9, and there is no version of this section that is both complete and
    // shorter than the file was. The cap moved to where the finished section sits plus a little,
    // NOT to wherever the file happens to be: 52 today, so prose creep still fails here.
    const lines = text.trimEnd().split('\n').length;
    assert.ok(lines <= 55, `${lines} lines, budget 55`);
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
      // Every real contract has at least one, and the rule file refuses to render without one —
      // its "not a substitute" sentence would otherwise name nothing.
      { name: 'snow_e_exec', gate: 'scripting', mutates: true, unsupported: true },
    ];
  });
  try {
    run(dir);
    assert.match(ruleOf(dir), /— 4 tools;/);   // three mutating plus the unsupported stub, which also mutates
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
    assert.match(clean.out, /5 target\(s\) current \(contract [0-9a-f]{12}\)/);

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
    assert.match(ruleOf(dir), /`NO_INSTANCE_CONFIGURED` → run the wizard, obviously —/);
  } finally { cleanup(dir); }
});

test('the wildcard line\'s code is required, and its absence cannot pass silently', () => {
  // Which codes the rule file lists is now the registry's `showInRule`, so a code that leaves the
  // registry simply leaves the file — self-consistent, and nothing to assert. One code is still
  // named directly: `WRITE_NOT_ENABLED` supplies the `*_NOT_ENABLED` wildcard line's remedy. Losing
  // it would drop the remedy for the six most common refusals, and silently rendering a shorter
  // file is the failure worth catching.
  const dir = tree((s) => {
    s.contract.errorCodes = s.contract.errorCodes.filter((e) => e.code !== 'WRITE_NOT_ENABLED');
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /WRITE_NOT_ENABLED is not in contract\.errorCodes/);
  } finally { cleanup(dir); }
});

test('every tool the rule file names in prose is a real tool in the contract', () => {
  // The claim about them (they refuse with UNSUPPORTED_ON_THIS_INSTANCE) is not in the contract —
  // no field marks a stub — so the names are a literal in the renderer. What can be enforced is
  // that they are names the server still answers: a rule file telling a reader not to use a tool
  // that no longer exists is noise, and one naming a tool that was renamed is wrong.
  const names = new Set(realContract().tools.map((t) => t.name));
  // ARC-08-S10 added the fourth: the runtime section tells a session to call it before continuing
  // from an interrupted step, which is an instruction to make a call — the worst kind of name to
  // let rot.
  for (const n of ['snow_deploy_background_script_exec', 'snow_fluent_script_exec',
    'snow_us_update_set_switch', 'snow_core_capabilities_read']) {
    assert.ok(names.has(n), `${n} is not in the contract`);
    assert.ok(readFileSync(join(root, RULE), 'utf8').includes(n), `${n} is not named in the rule file`);
  }
});

test("ARC-05-S06 criterion 3 — one remedy string, three documents", () => {
  // The whole reason the registry exists. Asserted on the exact bytes, not on "both mention the
  // command": a paraphrase in one of the three is how a user ends up following the older advice.
  const contract = realContract();
  const auth = contract.errorCodes.find((e) => e.code === 'AUTHENTICATION_FAILED');
  assert.ok(auth?.remedy, 'AUTHENTICATION_FAILED left the registry');
  for (const f of [RULE, 'docs/TROUBLESHOOTING.md', 'governance/mcp-protocols.md']) {
    assert.ok(readFileSync(join(root, f), 'utf8').includes(auth.remedy), `${f} paraphrases the remedy`);
  }
  console.log(`    one remedy string in three documents: ${JSON.stringify(auth.remedy).slice(0, 56)}…`);
});

test('ARC-05-S06 criterion 2 — one section per code, each with a remedy', () => {
  const doc = readFileSync(join(root, 'docs/TROUBLESHOOTING.md'), 'utf8');
  const codes = realContract().errorCodes;
  const headings = doc.split('\n').filter((l) => l.startsWith('### '));
  assert.equal(headings.length, codes.length);
  for (const e of codes) {
    assert.ok(doc.includes(`### ${e.code}\n`), `${e.code} has no section`);
    assert.ok(e.remedy.trim().length > 0, `${e.code} has an empty remedy`);
  }
});

test('ARC-05-S06 criteria 4 and 5 — the tool table, and no retired vocabulary', () => {
  const doc = readFileSync(join(root, 'governance/mcp-protocols.md'), 'utf8');
  const pin = JSON.parse(readFileSync(join(root, 'packages/contract/required-tools.json'), 'utf8'));
  const rows = doc.split('\n').filter((l) => /^\| `snow_[a-z0-9_]+` \|/.test(l));
  assert.equal(rows.length, pin.tools.length);
  const live = new Set(realContract().tools.map((t) => t.name));
  for (const t of pin.tools) {
    assert.ok(doc.includes(`| \`${t.name}\` |`), `${t.name} has no row`);
    assert.ok(live.has(t.name), `${t.name} is pinned but not in the contract`);
  }
  // The retired capture vocabulary, from the fixture rather than spelled here.
  const vocab = JSON.parse(readFileSync(join(root, 'tests/fixtures/retired-vocabulary.json'), 'utf8'))
    .tokens.map((t) => t.pattern);
  const banned = [...vocab, ...vocab.map((v) => v.replace(/^mcp__/, '').replace(/__$/, ''))];
  assert.deepEqual(banned.filter((v) => new RegExp(v).test(doc)), []);
});

test('the two unsupported stubs come from the contract, not from a literal', () => {
  // ARC-05-S06 added `unsupported` to the tool entry precisely so this sentence stops being a
  // claim about the server made from outside the contract. A fixture that marks a THIRD tool
  // proves the renderer reads the flag rather than remembering the two names.
  const dir = tree((s) => {
    s.contract.tools.find((t) => t.name === 'snow_core_records_query').unsupported = true;
  });
  try {
    run(dir);
    assert.match(ruleOf(dir), /`snow_core_records_query`/);
  } finally { cleanup(dir); }

  const none = tree((s) => { for (const t of s.contract.tools) delete t.unsupported; });
  try {
    const r = run(none);
    assert.equal(r.code, 2);
    assert.match(r.err, /no tool is marked unsupported in the contract/);
  } finally { cleanup(none); }
});

const SETTINGS = '.claude/settings.json';
const settingsOf = (dir) => JSON.parse(readFileSync(join(dir, SETTINGS), 'utf8'));

test('ARC-05-S07 criterion 1 — every read tool allowed, every mutating tool asked, no overlap', () => {
  const dir = tree();
  try {
    run(dir, ['--only', 'permissions']);
    const { allow, ask } = settingsOf(dir).permissions;
    const c = realContract();
    const reads = c.tools.filter((t) => !t.mutates && !t.sessionMutates);
    const writes = c.tools.filter((t) => t.mutates || t.sessionMutates);
    assert.equal(allow.length, reads.length);
    assert.equal(ask.length, writes.length);
    assert.deepEqual(allow.filter((e) => ask.includes(e)), [], 'a tool is both allowed and asked');
    assert.deepEqual(allow, [...allow].sort());
    assert.deepEqual(ask, [...ask].sort());

    // `sessionMutates` is why this is not `mutates` alone. Switching instance changes no record and
    // redirects where every later write lands; unprompted, it silently moves the target of the
    // prompts that follow.
    assert.ok(ask.includes('mcp__servicenow__snow_core_instance_switch'));
    // And the five tools an unconfigured server advertises must never prompt, or the wizard's own
    // resume path would ask permission to look at itself.
    for (const n of ['snow_core_instances_index', 'snow_core_instances_reload',
      'snow_core_current_instance_read', 'snow_core_capabilities_read', 'snow_core_status_read']) {
      assert.ok(allow.includes(`mcp__servicenow__${n}`), `${n} is not pre-approved`);
    }
    console.log(`    permissions: allow ${allow.length} · ask ${ask.length} · overlap 0`);
  } finally { cleanup(dir); }
});

test('ARC-05-S07 criterion 2 — everything that is not ours survives byte for byte', () => {
  // The file belongs to ARC-06 as much as to this renderer: `env`, `hooks`, the Bash allows, and a
  // rule for somebody else's MCP server. A renderer that rebuilt the whole file would delete them,
  // and the deletion would look like a generated diff.
  const dir = tree(({ write }) => {
    write(SETTINGS, `${JSON.stringify({
      env: { SNOW_STORE: '' },
      permissions: {
        allow: ['Bash(./snowarch doctor*)', 'mcp__other__thing',
          // A tool this server used to have (it is in `retired-names.json`) — ours, and removed.
          'mcp__servicenow__snow_rpt_report_generate',
          // A name under our prefix that is neither current nor retired. NOT ours: nothing
          // distinguishes it from another server's tool, and guessing would delete a stranger's
          // rule. It survives, and that boundary is the reason ownership is by name.
          'mcp__servicenow__not_a_tool_of_ours'],
        ask: ['Bash(rm *)', 'mcp__servicenow__add_comment'],
        deny: ['Bash(curl *)'],
      },
      hooks: { SessionStart: [{ matcher: '*', hooks: [] }] },
    }, null, 2)}\n`);
  });
  try {
    run(dir, ['--only', 'permissions']);
    const after = settingsOf(dir);
    assert.deepEqual(after.env, { SNOW_STORE: '' });
    assert.deepEqual(after.hooks, { SessionStart: [{ matcher: '*', hooks: [] }] });
    assert.deepEqual(after.permissions.deny, ['Bash(curl *)']);
    // Non-MCP rules and another server's rules keep their place at the head of each list.
    assert.equal(after.permissions.allow[0], 'Bash(./snowarch doctor*)');
    assert.equal(after.permissions.allow[1], 'mcp__other__thing');
    assert.equal(after.permissions.ask[0], 'Bash(rm *)');
    // A retired tool's rule is ours and goes; an unrecognised name under our prefix stays.
    assert.ok(!after.permissions.allow.includes('mcp__servicenow__snow_rpt_report_generate'));
    assert.ok(!after.permissions.ask.includes('mcp__servicenow__add_comment'));
    assert.ok(after.permissions.allow.includes('mcp__servicenow__not_a_tool_of_ours'));
  } finally { cleanup(dir); }
});

test('ARC-05-S07 criterion 3 — a flipped `mutates` names the entry that moved', () => {
  const dir = tree();
  try {
    run(dir, ['--only', 'permissions']);
    // The contract now says a read tool mutates. The committed file still has it in `allow`.
    const contractPath = join(dir, 'packages/snowarch/dist/contract.json');
    const c = JSON.parse(readFileSync(contractPath, 'utf8'));
    c.tools.find((t) => t.name === 'snow_core_records_query').mutates = true;
    writeFileSync(contractPath, `${JSON.stringify(c, null, 2)}\n`);

    const r = run(dir, ['--check', '--only', 'permissions']);
    assert.equal(r.code, 1);
    assert.match(r.out, /^-\s+"mcp__servicenow__snow_core_records_query",$/m);
    assert.match(r.out, /^\+\s+"mcp__servicenow__snow_core_records_query",$/m);
    assert.match(r.out, /run npm run gen and commit the result/);
  } finally { cleanup(dir); }
});

test('ARC-05-S07 criterion 4 — a server-key change leaves nothing behind', () => {
  // Starting from the COMMITTED file, not an empty template. That is the difference that hid a
  // bug: ownership used to be decided by prefix, so after a key change the renderer treated all 397
  // old entries as another server's rules and left them, then added 397 new ones beside them. A
  // fixture that starts empty has no old entries and cannot see it.
  const dir = tree(({ write }) => {
    const committed = JSON.parse(readFileSync(join(root, SETTINGS), 'utf8'));
    committed.permissions.allow.unshift('Bash(./snowarch doctor*)', 'mcp__other__thing');
    write(SETTINGS, `${JSON.stringify(committed, null, 2)}\n`);
  });
  try {
    const before = settingsOf(dir).permissions;
    assert.ok(before.allow.some((e) => e.startsWith('mcp__servicenow__')), 'fixture has no old entries');

    const configPath = join(dir, 'engine.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcp.serverKey = 'snow';
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    run(dir, ['--only', 'permissions']);

    const { allow, ask } = settingsOf(dir).permissions;
    const mcp = [...allow, ...ask].filter((e) => e.startsWith('mcp__'));
    assert.equal(mcp.filter((e) => e.startsWith('mcp__snow__')).length, realContract().tools.length);
    assert.deepEqual(mcp.filter((e) => e.startsWith('mcp__servicenow__')), [], 'stale entries survived the rename');
    assert.equal(mcp.length, realContract().tools.length + 1, 'something other than ours was rewritten');

    // Ours is decided by the TOOL name, not the prefix — so a third-party rule is still safe, and
    // that is the property the prefix rule was trying to protect in the first place.
    assert.ok(allow.includes('mcp__other__thing'));
    assert.equal(allow[0], 'Bash(./snowarch doctor*)');
  } finally { cleanup(dir); }
});

test('ARC-05-S07 criterion 7 — the glob path renders, and is not what is selected', () => {
  // Implemented and exercised against the full catalogue, per the story; the config chooses
  // `explicit` because one entry per tool is deterministic and diffable, and a glob saves lines in
  // a generated file at the cost of a matching bug nobody sees until a tool runs unprompted.
  const dir = tree((s) => { s.config.mcp.permissions.allowStyle = 'glob'; });
  try {
    run(dir, ['--only', 'permissions']);
    const { allow } = settingsOf(dir).permissions;
    assert.ok(allow.every((e) => e.endsWith('_*')), 'a glob run emitted an explicit entry');
    assert.ok(allow.length < 60, `${allow.length} globs is not a reduction`);
    // Every read tool is still matched by one of them — the property a glob has to keep.
    const reads = realContract().tools.filter((t) => !t.mutates && !t.sessionMutates);
    for (const t of reads) {
      const name = `mcp__servicenow__${t.name}`;
      assert.ok(allow.some((g) => new RegExp(`^${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`).test(name)),
        `${t.name} is matched by no glob`);
    }
    console.log(`    glob style: ${allow.length} rules cover ${reads.length} read tools`);
  } finally { cleanup(dir); }

  const fallback = tree((s) => { s.config.mcp.permissions.askStyle = 'deny-with-hook'; });
  try {
    const r = run(fallback, ['--only', 'permissions']);
    assert.equal(r.code, 2);
    assert.match(r.err, /S-18 CONFIRMED that "ask" prompts in auto mode, so it was never needed/);
  } finally { cleanup(fallback); }
});

test('the generated files are in the repository and current', () => {
  // The committed state, not a fixture: `npm run lint` runs `--check`, and this says the same thing
  // at the point a reader is looking at the suite.
  assert.ok(existsSync(join(root, RULE)));
  const r = run(root, ['--check']);
  assert.equal(r.code, 0, r.out);
});
