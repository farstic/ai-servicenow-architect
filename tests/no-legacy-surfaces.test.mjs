// ARC-02-S05 — permanent. The engine must not describe a surface a user cannot install, or a tool the
// product does not ship. Four tokens name what was cut (D-03 items 8 and 9, P-02, P-07, P-14).
//
// Three kinds of appearance are legitimate and are handled separately, never by widening the token list:
//
//  1. THE DOCUMENTARY RECORD — docs/plans/, docs/decisions/, docs/spikes/, scripts/legacy/. These quote
//     the past deliberately: the story that says "remove context-mode" has to name it. Purging them
//     would destroy the plan that motivated the removal. Same exemption the legacy-name ratchet uses.
//  2. THE HISTORY GLOSSARY in docs/ARCHITECTURE.md — the single permitted place a retired name may be
//     explained. Only lines carrying the `<!-- retired-name: historical -->` marker qualify; a line in
//     that file WITHOUT the marker still fails, so the exemption cannot spread through the file.
//  3. FILES ANOTHER ARC OWNS — attributed in tests/legacy-names.allowlist.json, the same owner map the
//     sibling ratchet uses. One list, one place. The entry disappears when that ARC rewrites the file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const owners = JSON.parse(readFileSync(join(root, 'tests/legacy-names.allowlist.json'), 'utf8')).files;

export const SURFACES = [
  ['context-mode', 'the author\'s personal hook tooling (D-03 item 9)'],
  ['ctx_', 'a context-mode tool prefix'],
  ['claude_desktop_config', 'the Claude Desktop registration path of the retired install narrative'],
  ['claude-ai-projects', 'the claude.ai project-instruction templates that never shipped (P-07)'],
];

const EXEMPT_PREFIXES = ['docs/plans/', 'docs/decisions/', 'docs/spikes/', 'scripts/legacy/'];
const HISTORY_FILE = 'docs/ARCHITECTURE.md';
const HISTORY_MARKER = '<!-- retired-name: historical -->';
const SCANNED = /\.(md|json|sh)$/;

// The rule, as a function over a file list, so the negative below runs THIS code and not a copy of it.
export function findLegacySurfaces({ base, files, allow = {} }) {
  const out = [];
  for (const rel of files) {
    if (!SCANNED.test(rel)) continue;
    if (EXEMPT_PREFIXES.some((p) => rel.startsWith(p))) continue;
    if (rel in allow) continue;
    const p = join(base, rel);
    if (!existsSync(p)) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (rel === HISTORY_FILE && line.includes(HISTORY_MARKER)) return;
      for (const [token, why] of SURFACES) {
        if (line.includes(token)) out.push(`no-legacy-surfaces: ${rel}:${i + 1}: "${token}" — ${why}`);
      }
    });
  }
  return out;
}

const tracked = () => execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter(Boolean);

test('no retired surface is described outside the history glossary', () => {
  const hits = findLegacySurfaces({ base: root, files: tracked(), allow: owners });
  assert.deepEqual(hits, [], `${hits.length} hit(s):\n  ${hits.join('\n  ')}`);
});

test('the history glossary is exempt only line by line, and only where the marker says so', () => {
  // A line in docs/ARCHITECTURE.md without the marker must still fail — otherwise naming the file once
  // would exempt every future line in it, which is how an exemption quietly becomes a hole.
  const text = readFileSync(join(root, HISTORY_FILE), 'utf8');
  const marked = text.split('\n').filter((l) => l.includes(HISTORY_MARKER)).length;
  assert.ok(marked > 0, 'the glossary must carry the marker on its retired-name rows');
  const unmarked = findLegacySurfaces({ base: root, files: [HISTORY_FILE] });
  assert.deepEqual(unmarked, [], 'every retired name in ARCHITECTURE.md must be on a marked line');
  console.log(`    ${marked} marked glossary line(s); ${SURFACES.length} tokens enforced everywhere else`);
});

test('a planted ctx_ token fails — and each exemption suppresses only what it names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-surfaces-'));
  try {
    mkdirSync(join(dir, 'docs/plans'), { recursive: true });
    mkdirSync(join(dir, 'packages/x'), { recursive: true });
    writeFileSync(join(dir, 'docs/GUIDE.md'), 'run `ctx_batch_execute` first\n');
    writeFileSync(join(dir, 'docs/plans/PLAN.md'), 'the plan says remove ctx_batch_execute\n');
    writeFileSync(join(dir, 'packages/x/README.md'), 'writes claude_desktop_config.json\n');
    writeFileSync(join(dir, 'notes.txt'), 'ctx_ in an unscanned extension\n');
    const files = ['docs/GUIDE.md', 'docs/plans/PLAN.md', 'packages/x/README.md', 'notes.txt'];

    const hits = findLegacySurfaces({ base: dir, files });
    assert.equal(hits.length, 2, `expected the guide and the package README to fail, got ${JSON.stringify(hits)}`);
    assert.match(hits[0], /docs\/GUIDE\.md:1: "ctx_"/);
    assert.match(hits[1], /packages\/x\/README\.md:1: "claude_desktop_config"/);

    const withOwner = findLegacySurfaces({ base: dir, files, allow: { 'packages/x/README.md': 'ARC-04' } });
    assert.equal(withOwner.length, 1, 'an owner entry suppresses its own file only');
    assert.match(withOwner[0], /docs\/GUIDE\.md/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every owner exemption names an ARC and still matches — a stale one is removed, not kept', () => {
  const used = Object.keys(owners).filter((f) => findLegacySurfaces({ base: root, files: [f] }).length > 0);
  for (const f of used) assert.match(String(owners[f]), /^ARC-\d\d$/, `${f} has no owning ARC`);
  console.log(`    ${used.length} owner-attributed file(s) still carry a retired surface: ${used.join(', ') || 'none'}`);
});
