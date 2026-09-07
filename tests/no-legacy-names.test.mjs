// ARC-01-S10 — the ratchet. Old names, old paths and old licence strings may only ever DECREASE.
//
// Two directions, and the second is what makes it a ratchet rather than a grep:
//   forward   a file that is not allow-listed must contain no forbidden pattern
//   backward  an allow-listed file that no longer matches must be REMOVED from the list
// Without the backward direction the list would silently become a list of files nobody rewrote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const allowlist = JSON.parse(readFileSync(join(root, 'tests/legacy-names.allowlist.json'), 'utf8'));

// Case- and separator-tolerant where the record showed variants: ADR-0002 spells the licence term
// "source-available" and "Source-available", so a literal "Source Available" would match neither
// (ARC-01-S08b, caught in review).
export const FORBIDDEN = [
  'cvetomirgrigorov/servicenow-mcp', 'claude-servicenow-live', 'NowAIKit', 'nowaikit',
  'mcp__servicenow-mcp__', 'mcp__nowaikit__', '@farstic/snow-mcp', 'packages/snow-mcp',
  'reference/templates', 'servicenow-mcp-server', 'npx (-y )?servicenow-mcp\\b',
  'registry\\.npmjs\\.org/servicenow-mcp', '(?i)source.available License',
  'not licensed for redistribution', 'license: MIT', 'SEE LICENSE IN LICENSE',
];
const MD_ONLY = 'Tier [012] \\(';   // the engine's three-tier vocabulary; ARC-02 owns the sweep
const compile = (p) => p.startsWith('(?i)') ? new RegExp(p.slice(4), 'i') : new RegExp(p);

// Tracked paths that must not exist at all (the S03 leaf cut, made permanent).
const FORBIDDEN_PATHS = [
  /^packages\/snowarch\/(desktop|clients|\.github)\//,
  /^packages\/snowarch\/(Dockerfile|server\.json|smithery\.yaml|glama\.json|TERMS\.md)$/,
];

// Files allowed to name the past because naming it IS their purpose. Two groups, kept apart because
// they are exempt for different reasons.
//   history/decisions — a record of what was decided, quoting the superseded thing as evidence
//   detectors        — code whose job is to match the old string
const EXEMPT_PREFIXES = ['docs/plans/', 'docs/decisions/', 'docs/spikes/', 'scripts/legacy/'];
const EXEMPT_FILES = new Set([
  'docs/ARCHITECTURE.md', 'docs/RELICENSING.md', 'docs/MIGRATION.md', 'NOTICE',
  'tests/no-legacy-names.test.mjs', 'tests/legacy-names.allowlist.json',
  'tests/version-consistency.test.mjs',   // detects the stale imported changelog by its old repo URL
  'tests/fixtures/retired-vocabulary.json', // SK-09's token list — a detector's data, deliberately its
                                            // own file so this exemption stays one file wide
]);
const isExempt = (f) => EXEMPT_FILES.has(f) || EXEMPT_PREFIXES.some((p) => f.startsWith(p));

const SCANNED = /\.(md|json|ts|mjs|sh|yml|yaml|ps1|cmd)$/;
const tracked = () => git(['ls-files']).split('\n').filter(Boolean);

function scan() {
  const found = new Map();   // file -> [ "line:pattern" ]
  for (const f of tracked()) {
    if (isExempt(f)) continue;
    if (!SCANNED.test(f) && f !== 'LICENSE' && f !== 'NOTICE') continue;
    let lines;
    try { lines = readFileSync(join(root, f), 'utf8').split('\n'); } catch { continue; }
    const pats = f.endsWith('.md') ? [...FORBIDDEN, MD_ONLY] : FORBIDDEN;
    lines.forEach((line, i) => {
      for (const p of pats) if (compile(p).test(line)) {
        if (!found.has(f)) found.set(f, []);
        found.get(f).push(`${f}:${i + 1}: "${p}"`);
      }
    });
  }
  return found;
}

test('no forbidden pattern outside the allow-list', () => {
  const found = scan();
  const offenders = [...found.keys()].filter((f) => !(f in allowlist.files));
  const detail = offenders.flatMap((f) => found.get(f).slice(0, 2)
    .map((d) => `no-legacy-names: ${d} (owner: none — fix or allow-list)`));
  assert.deepEqual(offenders, [], detail.join('\n'));
});

test('every allow-list entry still matches — the ratchet direction', () => {
  const found = scan();
  const stale = Object.keys(allowlist.files).filter((f) => !found.has(f));
  assert.deepEqual(stale, [],
    stale.map((f) => `no-legacy-names: allow-list entry "${f}" has no match — remove it`).join('\n'));
});

test('every allow-list entry names an owning ARC', () => {
  for (const [f, owner] of Object.entries(allowlist.files)) {
    assert.match(String(owner), /^ARC-\d\d$/, `allow-list entry "${f}" has no owning ARC`);
  }
});

test('the S03 leaf-cut paths stay deleted', () => {
  const back = tracked().filter((f) => FORBIDDEN_PATHS.some((re) => re.test(f)));
  assert.deepEqual(back, [], `no-legacy-names: leaf-cut path is tracked again: ${back[0]}`);
});

// ---------- mutations, in a throwaway repository ----------
const withScratchRepo = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'no-legacy-'));
  try { git(['init', '-q', '.'], dir); fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test('mutation: a new file with an old URL is caught, with owner: none', () => {
  withScratchRepo((dir) => {
    mkdirSync(join(dir, 'templates'), { recursive: true });
    writeFileSync(join(dir, 'templates/hld-template.md'),
      'see https://github.com/cvetomirgrigorov/servicenow-mcp\n');
    git(['add', '-A'], dir);
    const files = git(['ls-files'], dir).split('\n').filter(Boolean);
    const hits = files.flatMap((f) => {
      const lines = readFileSync(join(dir, f), 'utf8').split('\n');
      return lines.flatMap((l, i) => FORBIDDEN.filter((p) => compile(p).test(l))
        .map((p) => `no-legacy-names: ${f}:${i + 1}: "${p}" (owner: none — fix or allow-list)`));
    });
    assert.ok(hits.some((h) => h.startsWith('no-legacy-names: templates/hld-template.md:1:')), hits.join('\n'));
  });
});

test('mutation: an allow-listed file that no longer matches is reported for removal', () => {
  const fakeFound = new Map();          // nothing matches any more
  const stale = Object.keys({ 'docs/IMPORT-NOTES.md': 'ARC-02' }).filter((f) => !fakeFound.has(f));
  assert.deepEqual(stale.map((f) => `no-legacy-names: allow-list entry "${f}" has no match — remove it`),
    ['no-legacy-names: allow-list entry "docs/IMPORT-NOTES.md" has no match — remove it']);
});
