// ARC-08-S02 — E-17…E-22. The green case is THIS checkout; the negatives are small trees.
//
// The roster and the contract are the two things a fixture cannot fake cheaply: twenty-eight skill
// directories and a 397-tool contract. So the pass is asserted against the real tree — which is
// also the strongest form of it, because a checkout that fails here has really broken — and each
// negative is the smallest tree that can hold the mutation: the four contract inputs plus whatever
// file the finding is supposed to name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { engineContractChecks, PREFIX_FILES,
  SELF_ROOT } from '../../tools/snowarch/lib/doctor/checks/engine-contract.mjs';
import { engineRosterChecks } from '../../tools/snowarch/lib/doctor/checks/engine-roster.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { contextFor, REAL_ROOT, runById, writeJson } from './helpers/tree.mjs';

const roster = engineRosterChecks();
const contract = engineContractChecks();
const all = [...roster, ...contract];

const real = () => contextFor(REAL_ROOT);

/** The four files every contract check reads, plus anything the case adds. */
function lintTree(t, extra = {}) {
  const root = tempDir('snowarch-doctor-lint-', t);
  for (const rel of ['engine.config.json', '.mcp.json',
    'packages/snowarch/dist/contract.json',
    'packages/contract/required-tools.json',
    'packages/contract/retired-names.json']) {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    cpSync(join(REAL_ROOT, rel), join(root, rel));
  }
  for (const [rel, text] of Object.entries(extra)) {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

/** A copy of `.claude/` and the config — enough for the roster checks, and small. */
function rosterTree(t) {
  const root = tempDir('snowarch-doctor-roster-', t);
  cpSync(join(REAL_ROOT, '.claude'), join(root, '.claude'), { recursive: true });
  cpSync(join(REAL_ROOT, 'engine.config.json'), join(root, 'engine.config.json'));
  mkdirSync(join(root, 'tests', 'fixtures'), { recursive: true });
  for (const rel of ['tests/fixtures/skills-lint-allowlist.json',
    'tests/fixtures/claude-builtin-commands.json']) {
    cpSync(join(REAL_ROOT, rel), join(root, rel));
  }
  return root;
}

test('this checkout passes every roster and contract check', async () => {
  const ctx = real();
  for (const check of all) {
    const r = await check.run(ctx);
    assert.equal(r.status, 'ok', `${check.id}: ${r.detail}`);
  }
});

test('E-17 counts from the same listing gen-roster renders', async () => {
  const r = await runById(roster, 'E-17', real());
  const config = real().config;
  assert.equal(r.data.skills, config.roster.skills);
  assert.equal(r.data.agents, config.roster.agents);
  assert.match(r.detail, new RegExp(`${config.roster.skills} skills`));
});

// AC 7, first half. The story says "renaming one skill directory so that 27 remain"; a rename and
// a removal are two different findings, and BOTH are asserted — by the two checks that can see
// them. E-17 counts directories, so it sees the removal; a rename leaves the count at 28 and the
// frontmatter `name` unchanged, which is SK-01's subject and therefore E-18's (below).
test('E-17 fails when a skill directory is gone, and names the skill', async (t) => {
  const root = rosterTree(t);
  rmSync(join(root, '.claude/skills/developer'), { recursive: true });
  const r = await runById(roster, 'E-17', contextFor(root));
  assert.equal(r.status, 'fail');
  // Two findings, and the second is the one that NAMES it: the count alone could not, because the
  // expected names exist nowhere but the directory itself.
  assert.match(r.detail, /roster\.skills \d+ ≠ \d+ found/);
  assert.match(r.detail, /preloads "developer", which is not a skill/);
});

test('E-18 catches the rename E-17 cannot see, and names the directory', async (t) => {
  const root = rosterTree(t);
  renameSync(join(root, '.claude/skills/developer'), join(root, '.claude/skills/develpoer'));
  const r = await runById(roster, 'E-18', contextFor(root));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /SK-01 \.claude\/skills\/develpoer\/SKILL\.md: name "developer" != directory "develpoer"/);
});

test('E-17 reports an unreadable skill as one sentence rather than a stack', async (t) => {
  const root = rosterTree(t);
  writeFileSync(join(root, '.claude/skills/developer/SKILL.md'), '# no frontmatter at all\n');
  const r = await runById(roster, 'E-17', contextFor(root));
  assert.equal(r.status, 'fail');
  assert.equal(r.detail.includes('\n'), false, 'the report grew a second line');
});

test('E-17 names a utility skill that engine.config.json declares but .claude/skills does not have', async (t) => {
  const root = rosterTree(t);
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  config.roster.utility = [...config.roster.utility, 'ghost'];
  writeJson(root, 'engine.config.json', config);
  const r = await runById(roster, 'E-17', contextFor(root, { config }));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /utility skill "ghost" is not in \.claude\/skills/);
});

// AC 7, second half.
test('E-18 quotes the lint\'s own rule id and message', async (t) => {
  const root = rosterTree(t);
  const rel = '.claude/skills/developer/SKILL.md';
  const text = readFileSync(join(root, rel), 'utf8');
  writeFileSync(join(root, rel), text.replace(/^---\n/, '---\nversion: 9.9.9\n'));
  const r = await runById(roster, 'E-18', contextFor(root));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /SK-04 \.claude\/skills\/developer\/SKILL\.md: move version under metadata\.version/);
});

// AC 2 (c).
test('E-19 fails on a retired name in a scanned file, with file:line and the replacement', async (t) => {
  const retired = JSON.parse(readFileSync(join(REAL_ROOT, 'packages/contract/retired-names.json'), 'utf8'));
  const [name, replacement] = Object.entries(retired)[0];
  const root = lintTree(t, { 'governance/example.md': `# heading\n\nuse ${name} here\n` });
  const r = await runById(contract, 'E-19', contextFor(root));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /governance\/example\.md:3/);
  assert.match(r.detail, new RegExp(String(replacement).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('E-19 passes the tree that has no retired name, and says how many it knows', async () => {
  const r = await runById(contract, 'E-19', real());
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /\d+ retired name\(s\), none in use/);
});

// AC 3, the E-20 half.
test('E-20 fails a changed registration key and names .mcp.json', async (t) => {
  const root = lintTree(t);
  const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'));
  const [key] = Object.keys(mcp.mcpServers);
  mcp.mcpServers = { 'servicenow-mcp': mcp.mcpServers[key] };
  writeJson(root, '.mcp.json', mcp);
  const r = await runById(contract, 'E-20', contextFor(root));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /mcpServers key servicenow-mcp/);
  assert.deepEqual(r.data.divergent, ['.mcp.json']);
  assert.ok(PREFIX_FILES.includes('.claude/rules/00-mode-and-mcp-gate.md'));
});

test('E-20 reports the configured prefix, never a literal', async () => {
  const r = await runById(contract, 'E-20', real());
  assert.equal(r.detail, `mcp__${real().config.mcp.serverKey}__`);
});

test('E-21 declares the cost it avoids: it spawns, so --quick never runs it', () => {
  const e21 = contract.find((c) => c.id === 'E-21');
  assert.equal(e21.spawns, true);
  assert.equal(e21.quick, false);
});

test('E-21 does not claim a fixture tree is its own checkout', async (t) => {
  const root = lintTree(t);
  const ctx = contextFor(root);
  const r = await runById(contract, 'E-21', ctx);
  // The fixture has no generated files, so the generators that CAN take a --root report it. What
  // must not happen is the other four answering about THIS repository from inside a fixture run:
  // they are skipped, out loud, and their pass never reaches the fixture's report.
  assert.equal(r.status, 'fail');
  assert.notEqual(SELF_ROOT, root);
  const notes = ctx._lint.ctx.skipNotes.join(' ');
  for (const id of ['gen-modes', 'gen-doctor-docs', 'gen-retired-names', 'gen-readme-tables']) {
    assert.match(notes, new RegExp(`${id} takes no --root`));
  }
});

test('E-22 reports the pinned sha and the two counts', async () => {
  const r = await runById(contract, 'E-22', real());
  assert.match(r.detail, /^[0-9a-f]{12}… · \d+ required of \d+ declared$/);
});

test('E-22 fails a contract whose sha no longer matches the pin', async (t) => {
  const root = lintTree(t);
  const pin = JSON.parse(readFileSync(join(root, 'packages/contract/required-tools.json'), 'utf8'));
  pin.contractSha256 = 'f'.repeat(64);
  writeJson(root, 'packages/contract/required-tools.json', pin);
  const r = await runById(contract, 'E-22', contextFor(root));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /contract mismatch/);
  assert.match(r.remedy, /pin\.mjs/);
});

test('a contract check whose inputs are absent says so, and does not take the report down', async (t) => {
  const root = tempDir('snowarch-doctor-bare-', t);
  writeJson(root, 'engine.config.json', JSON.parse(readFileSync(join(REAL_ROOT, 'engine.config.json'), 'utf8')));
  const ctx = contextFor(root);
  for (const id of ['E-19', 'E-20', 'E-21', 'E-22']) {
    const r = await runById(contract, id, ctx);
    assert.equal(r.status, 'fail');
    assert.match(r.detail, /could not be read/);
    assert.equal(r.data.ran, false);
  }
});
