// ARC-02-S02 — the skill roster, checked against the rules in tests/lib/lint-rules.mjs.
// The rules live there so tests/lint-negatives.test.mjs can prove each one REJECTS a broken fixture.
// This file supplies the real tree and the fixtures, and asserts the failure list is empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { lintSkills, lintPaths, lintVocabulary, MAX_DESCRIPTION } from './lib/lint-rules.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const cfg = json('engine.config.json');
const allow = json('tests/fixtures/skills-lint-allowlist.json');
const builtins = json('tests/fixtures/claude-builtin-commands.json');

// engine.config.json.roster.utility is where a non-persona skill (the `snowarch` skill ARC-02-S11
// adds) is exempted from the EXAMPLES.md and roster-count rules. It does not exist yet: all 28
// directories today are roster skills and all 28 ship an EXAMPLES.md, measured 2026-09-08.
const UTILITY = new Set(json('engine.config.json').roster.utility ?? []);

const opts = {
  root,
  lengthAllow: new Set(allow.length),
  versionAllow: new Set(allow.version),
  builtins: new Set(builtins.commands),
  roster: cfg.roster.skills,
  utility: UTILITY,
};

const only = (id) => lintSkills(opts).filter((f) => f.startsWith(id));
const report = (id) => { const f = only(id); assert.equal(f.length, 0, `${f.length} failure(s):\n  ${f.join('\n  ')}`); };

test('SK-01 every skill name is a slug equal to its directory', () => report('SK-01'));
test('SK-02 every skill has a description within the length budget or an allow-list entry', () => report('SK-02'));
test('SK-03 no unquoted ": " in name or description — the registration hazard', () => report('SK-03'));
test('SK-04 version lives under metadata, as semver', () => report('SK-04'));
test('SK-05 no unknown frontmatter keys', () => report('SK-05'));
test('SK-06 every skill ships an EXAMPLES.md', () => report('SK-06'));
test('SK-07 the roster count matches engine.config.json', () => report('SK-07'));
test('SK-08 no skill name collides with a Claude Code built-in command', () => report('SK-08'));

test('the allow-lists shrink or hold — they never grow (ARC-02-S03 empties them)', () => {
  // A ratchet, not a cap: S03 removes entries. If someone adds one, this fails and asks why.
  const CEILING = { length: 27, version: 27 };
  for (const k of ['length', 'version']) {
    assert.ok(allow[k].length <= CEILING[k], `${k} allow-list grew to ${allow[k].length} (ceiling ${CEILING[k]})`);
    for (const name of allow[k]) {
      assert.ok(existsSync(join(root, '.claude/skills', name)), `${k} allow-list names "${name}", which does not exist`);
    }
  }
  console.log(`    ratchet: length ${allow.length.length}/${CEILING.length}, version ${allow.version.length}/${CEILING.version} — lower the ceiling as S03 empties them`);
});

// Criterion 6 names a skill BODY, so the surface is every markdown file under .claude/ plus the
// governing documents — not just the four top-level docs.
function markdownUnder(rel) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${d}/${e.name}`);
      else if (e.name.endsWith('.md')) out.push(`${d}/${e.name}`);
    }
  };
  if (existsSync(join(root, rel))) walk(rel);
  return out;
}

const CLAUDE_DIR = [...markdownUnder('.claude/skills'), ...markdownUnder('.claude/agents')];
const GOVERNING = ['CLAUDE.md', 'README.md', 'governance/governance-rules.md', 'governance/taxonomy.md']
  .filter((f) => existsSync(join(root, f)));
const SURFACE = [...CLAUDE_DIR, ...GOVERNING];
const vocabAllow = json('tests/fixtures/vocabulary-allowlist.json').allow;

// The story scopes this rule to `.claude/`, and `.claude/` is clean today — so it is ENABLED, not
// deferred. It guards against reintroduction while ARC-02-S06 sweeps the governing documents.
test('SK-09 no retired vocabulary under .claude/', () => {
  const f = lintVocabulary({ root, files: CLAUDE_DIR, allow: vocabAllow });
  assert.equal(f.length, 0, `${f.length} hit(s):\n  ${f.join('\n  ')}`);
  console.log(`    SK-09: ${CLAUDE_DIR.length} file(s) clean, ${vocabAllow.length} anchored exemption(s)`);
});

test('SK-09 the one exemption is load-bearing — without it the rule would fire', () => {
  // An allow-list entry that exempts nothing is dead weight pretending to be a decision.
  const withOut = lintVocabulary({ root, files: CLAUDE_DIR });
  assert.ok(withOut.length > 0, 'the exemption suppresses nothing — delete it');
  for (const a of vocabAllow) {
    assert.ok(withOut.some((f) => f.startsWith(`SK-09 ${a.file}:`)), `exemption for ${a.file} matches no hit`);
  }
  console.log(`    SK-09 exemption covers ${withOut.length} hit(s): ${vocabAllow[0].reason.split('.')[0]}.`);
});

test('SK-09 the governing documents are still dirty — that surface belongs to ARC-02-S06', () => {
  // Recorded, not enforced. S06 sweeps these; until then the count is visible rather than unknown.
  const f = lintVocabulary({ root, files: GOVERNING, allow: vocabAllow });
  const byFile = {};
  for (const x of f) { const k = x.slice(6).split(':')[0]; byFile[k] = (byFile[k] ?? 0) + 1; }
  console.log(`    SK-09 outstanding for S06: ${f.length} hit(s) — ${Object.entries(byFile).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  assert.ok(f.length > 0, 'the governing docs are already clean — enable SK-09 over GOVERNING too and delete this test');
});

test('SK-10 every .claude path quoted in a skill body, agent body or roster doc resolves', () => {
  const f = lintPaths({ root, files: SURFACE });
  assert.equal(f.length, 0, `${f.length} dead path(s):\n  ${f.join('\n  ')}`);
  console.log(`    SK-10: checked ${SURFACE.length} markdown file(s)`);
});

test('the measurement this story reports is reproducible', () => {
  const dirs = readdirSync(join(root, '.claude/skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  const lens = dirs.map((d) => {
    const m = readFileSync(join(root, '.claude/skills', d, 'SKILL.md'), 'utf8').match(/^description:\s*(.*)$/m);
    return [d, m ? [...m[1].replace(/^"|"$/g, '')].length : 0];
  });
  const over = lens.filter(([, n]) => n > MAX_DESCRIPTION);
  console.log(`    ${dirs.length} skills | ${over.length} description(s) over ${MAX_DESCRIPTION} chars | longest ${Math.max(...lens.map(([, n]) => n))}`);
  assert.equal(over.length, allow.length.length, 'the length allow-list must name exactly the over-budget skills');
});

test('criterion 1 — emptying the length allow-list fails, naming every over-long skill and its length', () => {
  const bare = lintSkills({ ...opts, lengthAllow: new Set() }).filter((f) => f.startsWith('SK-02'));
  assert.equal(bare.length, allow.length.length,
    `emptied, SK-02 must name exactly the ${allow.length.length} allow-listed skills; got ${bare.length}`);
  for (const line of bare) {
    assert.match(line, /^SK-02 \.claude\/skills\/[a-z0-9-]+\/SKILL\.md: description \d+ chars > 500$/,
      `the message must carry the measured length: ${line}`);
  }
  const named = new Set(bare.map((l) => l.split('/')[2]));
  assert.deepEqual([...named].sort(), [...allow.length].sort(), 'the allow-list and the failures must be the same set');
  console.log(`    criterion 1: ${bare.length} would fail once S03 empties the list, e.g. ${bare.sort()[0]}`);
});
