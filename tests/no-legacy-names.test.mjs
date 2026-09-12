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
//   fixtures         — trees that MUST contain the defect the lint detects (ARC-05-S03)
// `scripts/legacy/` left this list at ARC-10-S03 with the directory itself.
const EXEMPT_PREFIXES = ['docs/plans/', 'docs/decisions/', 'docs/spikes/',
  'packages/contract/lint/tests/fixtures/',
  // ARC-10-S07, and the same reason as the row above it: a fixture MUST contain the defect its
  // lint detects. `tests/validation-records.test.mjs` refuses a retired name in a validation
  // record, and the fixture proving that refusal fires has to carry one. The name is taken from
  // `retired-names.json` when the fixture is written, never typed — so the detector's data stays
  // the one source, here as everywhere else.
  'tests/fixtures/validation-records/'];
const EXEMPT_FILES = new Set([
  'docs/ARCHITECTURE.md', 'docs/RELICENSING.md', 'docs/MIGRATION.md', 'NOTICE',
  'tests/no-legacy-names.test.mjs', 'tests/legacy-names.allowlist.json',
  'tests/version-consistency.test.mjs',   // detects the stale imported changelog by its old repo URL
  // ARC-08-S03's E-23 data: the registration names the old installers wrote, for the doctor to
  // find in `~/.claude.json`. A detector's data, exactly like the row below it.
  'tools/snowarch/lib/doctor/checks/stale-registrations.json',
  'tests/fixtures/retired-vocabulary.json', // SK-09's token list — a detector's data, deliberately its
                                            // own file so this exemption stays one file wide
  // ── ARC-10-S03: ten files moved here from the allow-list ────────────────────────────────────
  //
  // The allow-list is for a rewrite somebody still owes; these are permanent carriers, and leaving
  // them there made the list read as thirteen outstanding debts when three were. Each is exempt
  // because naming the dead thing is what the file is FOR — the same criterion as the two rows
  // above, applied to files that had been queued for a rewrite that is never coming.
  //
  // The catalogue, and the two tests that assert what is in it. A detector cannot detect a name it
  // may not spell.
  'packages/contract/retired-identifiers.json',
  'packages/contract/retired-names.json',
  'tests/contract/retired-names.test.mjs',
  'tests/contract/engine-lint.test.mjs',   // asserts the FINDINGS, which quote the retired names
  // D-01's publish guard and its proof. `@farstic/snow-mcp@1.0.0` is a published npm record that
  // must never be republished, and a guard that refuses a name has to spell the name it refuses.
  '.github/workflows/publish-npm.yml',
  'scripts/ci/assert-publish-target.mjs',
  'tests/publish-target.test.mjs',
  'tests/workflows.test.mjs',
  // History. The imported changelog below `## Before 2.0.0` records what things were called at the
  // time, and the fixture exists to BE that file — rewriting either would falsify the record.
  'docs/CHANGELOG.md',
  'tests/fixtures/changelog-before-2.0.0.md',
]);
const isExempt = (f) => EXEMPT_FILES.has(f) || EXEMPT_PREFIXES.some((p) => f.startsWith(p));

const SCANNED = /\.(md|json|ts|mjs|sh|yml|yaml|ps1|cmd)$/;

/**
 * Every file the commit will contain: tracked, PLUS untracked-and-not-ignored.
 *
 * ARC-10-C1. This used to be `git ls-files` alone, which reads the INDEX — so a brand-new file was
 * invisible to the ratchet until somebody staged it, and a local run before `git add` reported a
 * pass on a tree the same test fails after. That is precisely what happened to the ARC-10-S10 issue
 * forms: `npm test` ran green at 15:39 on the final content, `git add -A` ran at 15:47, and CI —
 * which checks out a commit where everything is tracked — failed on the first cell to finish.
 *
 * `--others --exclude-standard` closes it: a file is scanned the moment it exists in the working
 * tree, and `.gitignore` still decides what is not a source file. In CI the checkout is clean, so
 * this adds nothing there; the whole benefit is that the author's run and CI's run now ask the same
 * question. The control below plants an unstaged file and asserts it is reported.
 */
const inScope = () => git(['ls-files', '--cached', '--others', '--exclude-standard'])
  .split('\n').filter(Boolean);
/** Tracked only — for the questions that are genuinely about the index (`scripts/legacy` below). */
const tracked = () => git(['ls-files']).split('\n').filter(Boolean);

function scan() {
  const found = new Map();   // file -> [ "line:pattern" ]
  for (const f of inScope()) {
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

test('ARC-10-C1 — an UNSTAGED file is scanned, so a local run answers what CI will', () => {
  // The defect this replaces was quiet in exactly one direction: everything already committed was
  // checked, so the ratchet looked healthy, while the files a commit was ABOUT to add were not.
  // The plant is therefore a new file that has never been staged.
  const dir = join(root, '.github', 'ARC-10-C1-control');
  const rel = '.github/ARC-10-C1-control/probe.yml';
  mkdirSync(dir, { recursive: true });
  try {
    // Assembled from the detector's own data rather than typed, so this file does not itself become
    // a carrier of the name — the same rule the validation-record fixtures follow.
    const name = FORBIDDEN.find((f) => f === 'claude-servicenow-live');
    assert.ok(name, 'the pattern this control plants is no longer forbidden');
    writeFileSync(join(dir, 'probe.yml'), `about: see ${name} for the old thing\n`);

    // The precondition, asserted rather than assumed: the file really is unstaged.
    assert.equal(tracked().includes(rel), false, 'the control file is tracked — the plant is void');
    assert.ok(inScope().includes(rel), 'an unstaged file is still invisible to the scan');

    const found = scan();
    assert.ok(found.has(rel), 'the planted unstaged file was not reported');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // And the other direction: with the directory gone, nothing lingers in the scan.
  assert.equal(scan().has(rel), false, 'the control file outlived its own cleanup');
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

test('ARC-10-S03 — the legacy scripts are gone, and only history still names them', () => {
  // AC 1. The directory is deleted; what may still SAY `scripts/legacy` is a record of what used to
  // be there. L05 already refuses a dead path outside a History section, so this asserts the half
  // L05 cannot: that nothing tracked still carries the directory itself.
  assert.deepEqual(tracked().filter((f) => f.startsWith('scripts/legacy')), [],
    'scripts/legacy is tracked again');

  // ...and the mentions that remain are history or provenance, never an instruction to run one.
  // `docs/ARCHITECTURE.md` is the ledger; the rest name the import tag in the same breath, which is
  // where the originals are readable now.
  const TAG = 'import/engine-v2.8.0-worktree';
  const ledger = readFileSync(join(root, 'docs/ARCHITECTURE.md'), 'utf8');
  assert.match(ledger, /legacy scripts retired/);
  assert.ok(ledger.includes(`git show ${TAG}:scripts/legacy/doctor.sh`),
    'the ledger does not say where the originals are read from');
});

test('ARC-10-S03 — the allow-list is what is still owed, not what is permanent', () => {
  // AC 3. Five entries, all ARC-10. Three from S03: the migration pointer (in the install page and
  // the README it is composed into) and CONTRIBUTING, whose history paragraph keeps old names until
  // S10 trims it. Everything else moved to EXEMPT_FILES, because a permanent carrier on a list of
  // outstanding rewrites reads as a debt nobody owes — thirteen entries where three were real.
  //
  // Two more at S10, for the same reason `docs/MIGRATION.md` is exempt: a form that asks which
  // product you are migrating FROM has to name it. `install-problem.yml` is NOT among them — it
  // carries no forbidden pattern, and listing it would fail this test's backward direction, which
  // is the check that keeps the list honest. The archive (S10's run half) retires all of these.
  assert.deepEqual(Object.keys(allowlist.files).sort(),
    ['.github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/migration-problem.yml',
      'README.md', 'docs/CONTRIBUTING.md', 'docs/INSTALL.md']);
  for (const owner of Object.values(allowlist.files)) assert.equal(owner, 'ARC-10');

  // The ten that moved must still MATCH — they are exempt because they carry the names on purpose,
  // and an exemption for a file that stopped carrying them is an exemption nobody can justify.
  for (const f of ['packages/contract/retired-names.json', 'scripts/ci/assert-publish-target.mjs',
    'tests/fixtures/changelog-before-2.0.0.md', 'docs/CHANGELOG.md']) {
    const text = readFileSync(join(root, f), 'utf8');
    assert.ok(FORBIDDEN.some((p) => compile(p).test(text)),
      `${f} is exempt and carries no retired name — the exemption is stale`);
  }
});

test('the S03 leaf-cut paths stay deleted', () => {
  const back = tracked().filter((f) => FORBIDDEN_PATHS.some((re) => re.test(f)));
  assert.deepEqual(back, [], `no-legacy-names: leaf-cut path is tracked again: ${back[0]}`);
});

// ---------- mutations, in a throwaway repository ----------
const withScratchRepo = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'no-legacy-'));
  try { git(['init', '-q', '-b', 'main', '.'], dir); fn(dir); }
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
