// ARC-02-S02 — every rule is proved to FAIL on a broken fixture, not merely to pass on a clean tree.
// A lint that has never rejected anything is indistinguishable from a lint that cannot reject anything.
// These build a throwaway skill/agent tree under os.tmpdir() and call the SAME functions the real-tree
// tests call, so a rule cannot pass here and be absent there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintSkills, lintAgents, lintPaths, lintVocabulary } from './lib/lint-rules.mjs';

const SKILL_OK = { name: 'thing', description: 'Does a thing.' };
const AGENT_OK = { name: 'doer', description: 'Does it.', tools: 'Read, Write, Edit' };

function tree(skills = {}, agents = {}, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'snowarch-lint-'));
  for (const [dir, spec] of Object.entries(skills)) {
    const d = join(root, '.claude/skills', dir);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'SKILL.md'), `---\n${spec.frontmatter}\n---\n\n# ${dir}\n`);
    if (spec.examples !== false) writeFileSync(join(d, 'EXAMPLES.md'), '# Examples\n');
  }
  for (const [name, fm] of Object.entries(agents)) {
    mkdirSync(join(root, '.claude/agents'), { recursive: true });
    writeFileSync(join(root, '.claude/agents', `${name}.md`), `---\n${fm}\n---\n\n# ${name}\n`);
  }
  for (const [rel, body] of Object.entries(extra)) {
    mkdirSync(join(root, rel.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

const fm = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n');
const skillFails = (skills, opts) => { const r = tree(skills); try { return lintSkills({ root: r, ...opts }); } finally { rmSync(r, { recursive: true, force: true }); } };
const agentFails = (agents, opts) => { const r = tree({}, agents); try { return lintAgents({ root: r, ...opts }).fail; } finally { rmSync(r, { recursive: true, force: true }); } };
const has = (fails, id) => fails.some((f) => f.startsWith(id));

test('SK-01 rejects a name that does not match its directory', () => {
  assert.ok(has(skillFails({ alpha: { frontmatter: fm({ ...SKILL_OK, name: 'beta' }) } }), 'SK-01'));
  assert.ok(!has(skillFails({ alpha: { frontmatter: fm({ ...SKILL_OK, name: 'alpha' }) } }), 'SK-01'));
});

test('SK-02 rejects a missing description and an over-length one, and the allow-list suppresses length only', () => {
  assert.ok(has(skillFails({ a: { frontmatter: 'name: a' } }), 'SK-02'));
  const long = { a: { frontmatter: fm({ name: 'a', description: 'x'.repeat(501) }) } };
  assert.ok(has(skillFails(long), 'SK-02'), 'over-length must fail');
  assert.ok(!has(skillFails(long, { lengthAllow: new Set(['a']) }), 'SK-02'), 'allow-listed length must pass');
  assert.ok(has(skillFails({ a: { frontmatter: 'name: a' } }, { lengthAllow: new Set(['a']) }), 'SK-02'),
    'the length allow-list must NOT excuse a missing description');
});

test('SK-03 rejects an unquoted ": " and accepts the quoted form — the registration hazard', () => {
  const bad = { a: { frontmatter: 'name: a\ndescription: Author tests: suites and steps.' } };
  const good = { a: { frontmatter: 'name: a\ndescription: "Author tests: suites and steps."' } };
  assert.ok(has(skillFails(bad), 'SK-03'), 'unquoted ": " must fail');
  assert.ok(!has(skillFails(good), 'SK-03'), 'quoting is the fix — it must clear the rule');
});

test('SK-04 rejects top-level version and non-semver metadata.version', () => {
  assert.ok(has(skillFails({ a: { frontmatter: fm({ ...SKILL_OK, name: 'a', version: '1.0.0' }) } }), 'SK-04'));
  assert.ok(!has(skillFails({ a: { frontmatter: `${fm({ ...SKILL_OK, name: 'a' })}\nmetadata:\n  version: 1.0.0` } }), 'SK-04'));
  assert.ok(has(skillFails({ a: { frontmatter: `${fm({ ...SKILL_OK, name: 'a' })}\nmetadata:\n  version: v1` } }), 'SK-04'));
});

test('SK-05 rejects an unknown frontmatter key', () => {
  assert.ok(has(skillFails({ a: { frontmatter: fm({ ...SKILL_OK, name: 'a', tier: '2' }) } }), 'SK-05'));
});

test('SK-06 rejects a missing EXAMPLES.md, and the utility set exempts it', () => {
  const bare = { a: { frontmatter: fm({ ...SKILL_OK, name: 'a' }), examples: false } };
  assert.ok(has(skillFails(bare), 'SK-06'));
  assert.ok(!has(skillFails(bare, { utility: new Set(['a']) }), 'SK-06'));
});

test('SK-07 rejects a roster count that disagrees with engine.config.json', () => {
  const one = { a: { frontmatter: fm({ ...SKILL_OK, name: 'a' }) } };
  assert.ok(has(skillFails(one, { roster: 28 }), 'SK-07'));
  assert.ok(!has(skillFails(one, { roster: 1 }), 'SK-07'));
});

test('SK-08 rejects a skill named after a built-in command — criterion 3, with the real fixture list', () => {
  // Criterion 3 names `status` specifically (R-17): it is the collision actually proven on the CLI.
  const builtins = new Set(JSON.parse(readFileSync(new URL('./fixtures/claude-builtin-commands.json', import.meta.url), 'utf8')).commands);
  assert.ok(builtins.has('status'), 'the fixture must contain the one collision R-17 proved');
  const f = skillFails({ status: { frontmatter: fm({ ...SKILL_OK, name: 'status' }) } }, { builtins });
  assert.ok(has(f, 'SK-08'), `expected SK-08, got ${JSON.stringify(f)}`);
  assert.match(f.find((x) => x.startsWith('SK-08')), /name "status" collides with a Claude Code built-in command/);
  assert.ok(!has(skillFails({ escalation: { frontmatter: fm({ ...SKILL_OK, name: 'escalation' }) } }, { builtins }), 'SK-08'),
    'a name that is not a built-in must pass');
});

test('SK-09 rejects retired vocabulary, and an exemption must be anchored to both file and line text', () => {
  const root = tree({ a: { frontmatter: fm({ ...SKILL_OK, name: 'a' }) } }, {},
    { 'x.md': 'this is Tier 2 work\nand this mentions nowaikit\n' });
  try {
    assert.equal(lintVocabulary({ root, files: ['x.md'] }).length, 2, 'both tokens must be caught');
    assert.equal(lintVocabulary({ root, files: ['x.md'], allow: [{ file: 'x.md', context: 'Tier 2 work' }] }).length, 1,
      'the exemption must suppress its own line only');
    assert.equal(lintVocabulary({ root, files: ['x.md'], allow: [{ file: 'other.md', context: 'Tier 2 work' }] }).length, 2,
      'an exemption for a different file must suppress nothing');
    assert.equal(lintVocabulary({ root, files: ['x.md'], allow: [{ file: 'x.md', context: 'not present' }] }).length, 2,
      'an exemption whose context is absent must suppress nothing');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('SK-10 rejects a dead .claude path — criterion 6 puts the dangling token in a SKILL BODY', () => {
  const root = mkdtempSync(join(tmpdir(), 'snowarch-lint-'));
  try {
    mkdirSync(join(root, '.claude/skills/alpha'), { recursive: true });
    writeFileSync(join(root, '.claude/skills/alpha/SKILL.md'),
      '---\nname: alpha\ndescription: d\n---\n\nsee `.claude/skills/alpha/SKILL.md` and `.claude/skills/does-not-exist/SKILL.md`\n');
    const f = lintPaths({ root, files: ['.claude/skills/alpha/SKILL.md'] });
    assert.equal(f.length, 1, `expected exactly the dangling token to fail, got ${JSON.stringify(f)}`);
    assert.match(f[0], /^SK-10 \.claude\/skills\/alpha\/SKILL\.md:6: dead path \.claude\/skills\/does-not-exist\/SKILL\.md$/,
      'the message names the file, the line and the token');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('AG-01 rejects a name that does not match the file stem', () => {
  assert.ok(has(agentFails({ doer: fm({ ...AGENT_OK, name: 'other' }) }), 'AG-01'));
});

test('AG-02 rejects an unquoted ": " in an agent description', () => {
  assert.ok(has(agentFails({ doer: 'name: doer\ndescription: Builds things: flows and actions.\ntools: Read' }), 'AG-02'));
  assert.ok(!has(agentFails({ doer: 'name: doer\ndescription: "Builds things: flows and actions."\ntools: Read' }), 'AG-02'));
});

test('AG-03 rejects a missing tools key, an MCP tool, and a nested dispatcher', () => {
  assert.ok(has(agentFails({ doer: fm({ name: 'doer', description: 'd' }) }), 'AG-03'), 'no tools key must fail');
  assert.ok(has(agentFails({ doer: fm({ ...AGENT_OK, tools: 'Read, mcp__servicenow-mcp__snow_inc_incident_add' }) }), 'AG-03'),
    'an MCP tool on a sub-agent must fail (principle 8)');
  assert.ok(has(agentFails({ doer: fm({ ...AGENT_OK, tools: 'Read, Task' }) }), 'AG-03'));
  assert.ok(!has(agentFails({ doer: fm(AGENT_OK) }), 'AG-03'));
});

test('AG-04/AG-05 fail on a bad tree only when ENFORCE_S04 is on — proving the switch is a switch', () => {
  const bad = { doer: fm({ ...AGENT_OK, model: 'claude-opus-4-8' }) };
  assert.ok(!has(agentFails(bad, { enforceS04: false }), 'AG-04'), 'off: silent');
  assert.ok(has(agentFails(bad, { enforceS04: true }), 'AG-04'), 'on: rejects the pinned id');
  assert.ok(has(agentFails(bad, { enforceS04: true }), 'AG-05'), 'on: rejects the missing skills preload');
  assert.ok(!has(agentFails({ doer: `${fm({ ...AGENT_OK, model: 'inherit' })}\nskills:\n  - nope` }, { enforceS04: true }), 'AG-04'));
  assert.ok(has(agentFails({ doer: `${fm({ ...AGENT_OK, model: 'inherit' })}\nskills:\n  - nope` }, { enforceS04: true }), 'AG-05'),
    'a skills entry that names no existing directory must fail');
});

test('AG-06 rejects a description budget over the sub-agent warning threshold', () => {
  const fat = Object.fromEntries(Array.from({ length: 10 }, (_, i) =>
    [`a${i}`, fm({ name: `a${i}`, description: 'x'.repeat(6000), tools: 'Read' })]));
  assert.ok(has(agentFails(fat), 'AG-06'), '60000 chars ≈ 15000 tokens must fail');
  assert.ok(!has(agentFails({ doer: fm(AGENT_OK) }), 'AG-06'));
});
