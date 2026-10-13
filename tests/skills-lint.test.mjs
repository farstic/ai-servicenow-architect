// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-02-S02 — the skill roster, checked against the rules in tests/lib/lint-rules.mjs.
// The rules live there so tests/lint-negatives.test.mjs can prove each one REJECTS a broken fixture.
// This file supplies the real tree and the fixtures, and asserts the failure list is empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { lintSkills, lintPaths, lintVocabulary, lintRootless, MAX_DESCRIPTION } from './lib/lint-rules.mjs';

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

// The ratchet ceiling. ARC-02-S03 emptied both lists, so it is 0 — and one constant, so lowering it
// again is one edit. An entry cannot be added without also raising this, which is the point.
const CEILING = { length: 0, version: 0 };

test('the allow-lists shrink or hold — they never grow (ARC-02-S03 emptied them)', () => {
  for (const k of ['length', 'version']) {
    assert.ok(allow[k].length <= CEILING[k], `${k} allow-list grew to ${allow[k].length} (ceiling ${CEILING[k]})`);
    for (const name of allow[k]) {
      assert.ok(existsSync(join(root, '.claude/skills', name)), `${k} allow-list names "${name}", which does not exist`);
    }
  }
  console.log(`    ratchet: length ${allow.length.length}/${CEILING.length}, version ${allow.version.length}/${CEILING.version} — both emptied by ARC-02-S03`);
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

test('SK-09 every exemption is load-bearing — without it the rule would fire', () => {
  // An allow-list entry that exempts nothing is dead weight pretending to be a decision.
  //
  // Scoped to `.claude/`, because the allow-list is shared with the wider vocabulary sweep in
  // `tests/no-legacy-surfaces.test.mjs` (CLAUDE.md, governance/, docs/). An entry for a file
  // outside `.claude/` is load-bearing THERE and invisible here, so asserting over all of them
  // would fail on a perfectly live exemption. Each check proves its own entries earn their place.
  const mine = vocabAllow.filter((a) => a.file.startsWith('.claude/'));
  const withOut = lintVocabulary({ root, files: CLAUDE_DIR });
  assert.ok(withOut.length > 0, 'the exemption suppresses nothing — delete it');
  assert.ok(mine.length > 0, 'no .claude/ exemption left — this test proves nothing');
  for (const a of mine) {
    assert.ok(withOut.some((f) => f.startsWith(`SK-09 ${a.file}:`)), `exemption for ${a.file} matches no hit`);
  }
  console.log(`    SK-09 exemption covers ${withOut.length} hit(s): ${mine[0].reason.split('.')[0]}.`);
});

test('SK-09 the governing documents are clean, and stay that way', () => {
  // This was a counter while ARC-02-S06 swept the retired vocabulary out of CLAUDE.md and
  // `governance/`, asserting the count was still non-zero so nobody would mistake "not yet done"
  // for "done". S06 took it to one hit and ARC-02-S10 took the last one — the Standing Rule
  // paragraph that named the field-notes file. It now enforces instead of counting: the surface it
  // was waiting for is the surface it guards.
  const f = lintVocabulary({ root, files: GOVERNING, allow: vocabAllow });
  assert.deepEqual(f, []);
  console.log(`    SK-09: ${GOVERNING.length} governing file(s) clean`);
});

const AREAS = new Set(readFileSync(join(root, 'vendor/docs-areas.txt'), 'utf8').split('\n').filter(Boolean));
const rootlessAllow = json('tests/fixtures/rootless-citation-allowlist.json').allow;

test('SK-12 no citation carries its area without the markdown/ root', () => {
  const f = lintRootless({ root, files: SURFACE, areas: AREAS, allow: rootlessAllow });
  assert.equal(f.length, 0, `${f.length} rootless citation(s):\n  ${f.join('\n  ')}`);
  assert.ok(rootlessAllow.length <= 1, `SK-12 allow-list grew to ${rootlessAllow.length} (ceiling 1)`);
  console.log(`    SK-12: ${SURFACE.length} file(s) clean, ${rootlessAllow.length} recorded exemption(s)`);
});

test('SK-12 the one exemption is load-bearing, and the agent prose does not match', () => {
  const withOut = lintRootless({ root, files: SURFACE, areas: AREAS });
  assert.equal(withOut.length, rootlessAllow.length, 'the exemption must suppress exactly one real hit');
  assert.match(withOut[0], /servicenow-platform\/security\//);
  // The four agent files end their URL at `.../markdown`, which is not area-prefixed and must not match.
  const agents = SURFACE.filter((f) => f.startsWith('.claude/agents/'));
  assert.deepEqual(lintRootless({ root, files: agents, areas: AREAS }), [],
    'the `.../markdown` prose in the agent files must not be flagged');
  console.log(`    SK-12: exemption covers ${withOut.length} hit — ${rootlessAllow[0].reason.split('.')[0]}.`);
});

const forthcoming = json('tests/fixtures/forthcoming-paths.json').allow;

test('SK-10 a forthcoming path is exempt only where its story is named, and the ceiling holds', () => {
  assert.ok(forthcoming.length <= 1, `SK-10 forthcoming list grew to ${forthcoming.length} (ceiling 1)`);
  for (const f of forthcoming) {
    assert.match(String(f.created_by), /^ARC-\d\d-S\d\d$/, `${f.path} names no creating story`);
    assert.ok(!existsSync(join(root, f.path)), `${f.path} exists now — remove the entry, ${f.created_by} has landed`);
    const hits = lintPaths({ root, files: [f.file] });
    assert.ok(hits.some((h) => h.includes(f.path)), `the entry for ${f.path} suppresses nothing`);
  }
  console.log(`    SK-10: ${forthcoming.length} forthcoming path(s), each with a creating story`);
});

test('SK-10 every .claude path quoted in a skill body, agent body or roster doc resolves', () => {
  const f = lintPaths({ root, files: [...SURFACE, 'README.md'], forthcoming });
  assert.equal(f.length, 0, `${f.length} dead path(s):\n  ${f.join('\n  ')}`);
  console.log(`    SK-10: checked ${SURFACE.length} markdown file(s)`);
});

function dirsOnDisk() {
  return readdirSync(join(root, '.claude/skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
}
function descriptionOf(d) {
  const m = readFileSync(join(root, '.claude/skills', d, 'SKILL.md'), 'utf8').match(/^description:\s*(.*)$/m);
  return m ? [...m[1].replace(/^"|"$/g, '')] : [];
}

test('SK-11 every skill carries a ## Triggers section as its first H2', () => {
  report('SK-11');
  console.log(`    SK-11: ${dirsOnDisk().length} skills carry ## Triggers with all three fields`);
});

test('criterion 1 — the lint passes with an EMPTY length allow-list, and reports the measured budget', () => {
  // ARC-02-S02 asserted the inverse (27 failures, each naming its measured length). S03 rewrote the
  // descriptions, so the assertion flips: no exemption is needed by any skill.
  const bare = lintSkills({ ...opts, lengthAllow: new Set() }).filter((f) => f.startsWith('SK-02'));
  assert.deepEqual(bare, [], `no skill may need a length exemption now:\n  ${bare.join('\n  ')}`);
  const lens = [...dirsOnDisk()].map((d) => descriptionOf(d).length);
  const total = lens.reduce((a, b) => a + b, 0);
  assert.ok(total <= 14000, `SK-02 total description budget ${total} > 14000 (story criterion 1)`);
  console.log(`    criterion 1: ${lens.length} skills, total ${total} chars (ceiling 14000), longest ${Math.max(...lens)}, mean ${Math.round(total / lens.length)}`);
});

// ARC-02-C5 — the owner's one-figure test came back with a hand-written SVG, and the Word test with an
// offer of pandoc: no file the Architect reads named the house scripts, since ARC-02-S08 cut them from
// CLAUDE.md. Each file below names its scripts again, and the diagramming pair says the export is never
// hand-authored. A file that loses one is where those two runs started.
const HOUSE_SCRIPTS = {
  'CLAUDE.md': ['scripts/render-drawio.sh', 'scripts/md-to-docx.py'],
  '.claude/skills/diagramming-specialist/SKILL.md': ['scripts/render-drawio.sh', 'never hand-authored', 'scripts/md-to-docx.py'],
  '.claude/agents/diagramming-specialist.md': ['scripts/render-drawio.sh', 'never hand-authored'],
  '.claude/skills/hld-lld-writer/SKILL.md': ['scripts/md-to-docx.py', 'scripts/render-drawio.sh'],
  '.claude/agents/hld-lld-writer.md': ['scripts/md-to-docx.py', 'scripts/render-drawio.sh'],
  '.claude/skills/operational-documentation/SKILL.md': ['scripts/md-to-docx.py', 'scripts/render-drawio.sh'],
  '.claude/skills/story-writer/SKILL.md': ['scripts/md-to-docx.py', 'scripts/render-drawio.sh'],
  '.claude/agents/story-writer.md': ['scripts/md-to-docx.py', 'scripts/render-drawio.sh'],
};

test('ARC-02-C5 the files that make figures and Word name the house scripts, and the export is never hand-authored', () => {
  const missing = Object.entries(HOUSE_SCRIPTS).flatMap(([f, names]) => {
    const text = readFileSync(join(root, f), 'utf8');
    return names.filter((n) => !text.includes(n)).map((n) => `${f}: ${n}`);
  });
  assert.deepEqual(missing, [], `${missing.length} name(s) missing:\n  ${missing.join('\n  ')}`);
  console.log(`    ARC-02-C5: ${Object.keys(HOUSE_SCRIPTS).length} files name their house scripts`);
});

// ARC-02-C9 — the halt reads as the verdict does. The gateways' verdict tables say Verdict C applies when a
// custom object "was NAMED in the request, or is the only viable path after the baseline evaluation", while
// thirteen skills' halt protocols, governance §1.1 and the taxonomy said only "genuinely the only viable path":
// read alone, they would not halt on a named object. Every line that says "only viable" now names the request too.
test('ARC-02-C9 every "only viable" line in the roster and the governing files also says "named in the request"', () => {
  const bad = [];
  let seen = 0;
  for (const f of SURFACE.filter((p) => existsSync(join(root, p)))) {
    readFileSync(join(root, f), 'utf8').split('\n').forEach((l, i) => {
      if (!/only viable/i.test(l)) return;
      seen++;
      if (/genuinely the only viable/i.test(l)) bad.push(`${f}:${i + 1} says "genuinely the only viable"`);
      else if (!/named in the request/i.test(l)) bad.push(`${f}:${i + 1} says "only viable" without "named in the request"`);
    });
  }
  assert.ok(seen > 0, 'no "only viable" line found — the sweep read nothing');
  assert.deepEqual(bad, [], `${bad.length} halt line(s) out of step with the verdict table:\n  ${bad.join('\n  ')}`);
  console.log(`    ARC-02-C9: ${seen} "only viable" line(s), each naming the request`);
});
