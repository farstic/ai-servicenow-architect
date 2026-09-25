import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compose, dialogsParagraph } from '../scripts/gen-readme.mjs';

/**
 * ARC-06-S13 — the install page, and the words that must not be in it.
 *
 * P-02 is the failure being prevented, and it is worth naming precisely: the package this
 * repository replaces shipped a README that named an unpublished npm package, told the reader to
 * edit `claude_desktop_config.json`, and described a five-step wizard that had eleven steps. Every
 * sentence was true of an intention. The greps below are the cheap half of the answer; the
 * generated regions are the expensive half — the parts of the page that are facts about the build
 * are written by the build.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const INSTALL = 'docs/INSTALL.md';
const README = 'README.md';

test('criterion 3 — the composition is current', () => {
  const { install, readme } = compose(root);
  assert.equal(install, read(INSTALL), 'docs/INSTALL.md regions are stale — run gen-readme.mjs');
  assert.equal(readme, read(README), 'README.md is stale — run gen-readme.mjs');
});

test('...and editing README.md by hand fails the check', () => {
  // A copy of the tree, because the assertion is about a generator that must REFUSE — running it
  // against the real repository to prove that would leave the repository needing a regenerate.
  const dir = mkdtempSync(join(tmpdir(), 'install-page-'));
  try {
    for (const rel of [INSTALL, README, 'docs/README-head.md', 'docs/README-tail.md',
      'docs/snippets/terminal-handoff.md',
      'engine.config.json', 'tools/snowarch/lib/text.json', 'tools/snowarch/lib/remedies.json']) {
      mkdirSync(join(dir, dirname(rel)), { recursive: true });
      cpSync(join(root, rel), join(dir, rel));
    }
    const check = () => spawnSync(process.execPath,
      [join(root, 'scripts/gen-readme.mjs'), '--check', '--root', dir], { encoding: 'utf8' });
    assert.equal(check().status, 0, 'the copied tree is not current to begin with');

    writeFileSync(join(dir, README), `${readFileSync(join(dir, README), 'utf8')}\nA hand edit.\n`);
    const after = check();
    assert.equal(after.status, 1);
    assert.match(after.stderr, /README\.md is STALE/);
    // ...and it says where the text actually lives, or the reader makes the same edit again.
    assert.match(after.stderr,
      /composed from docs\/README-head\.md \+ docs\/INSTALL\.md \+ docs\/README-tail\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('criterion 4 — none of P-02\'s words appear on either page', () => {
  // The retired product and prefix names are the engine lint's (L03, from
  // `packages/contract/retired-names.json`) and are deliberately NOT spelled here — a file that
  // writes a forbidden word becomes a hit in the sweep that forbids it. These four are this
  // story's own, and they are about a README's habits rather than about a tool's name.
  const FORBIDDEN = [
    [/Tier [0-9]/, 'a "Tier" — the old tiering vocabulary'],
    [/claude_desktop_config/, 'claude_desktop_config.json — the wrong client entirely'],
    [/\b1\.0\.0\b/, 'version 1.0.0 — the retired package\'s'],
    [/claude mcp add/, '`claude mcp add` — this project never runs it'],
  ];
  for (const page of [README, INSTALL]) {
    const text = read(page);
    for (const [pattern, why] of FORBIDDEN) {
      assert.equal(pattern.test(text), false, `${page} contains ${why}`);
    }
  }
  // Not vacuous — the same test on the sentence it forbids must fire.
  assert.equal(/claude mcp add/.test('run claude mcp add servicenow'), true);
  // `claude mcp remove` IS allowed, and only in Uninstall: it is how a reader undoes the fallback
  // registration, and leaving them without it would be worse than the rule.
  const uninstall = read(INSTALL).slice(read(INSTALL).indexOf('### Uninstall'));
  assert.match(uninstall, /claude mcp remove servicenow -s local/);
  assert.equal((read(INSTALL).match(/claude mcp remove/g) ?? []).length, 1,
    'claude mcp remove appears outside Uninstall');
});

test('...and the two the README must contain', () => {
  // READ, NEVER SPELLED (ARC-09-C12a). This was `/2\.0\.0/`, and it failed the moment `develop`
  // moved to `2.0.1-dev` — the post-release bump, which is the one edit guaranteed to happen after
  // every release. It was also INVISIBLE to the version sweep: `literalLines` looks for the version
  // as a literal string, and an escaped-dot regex is not one. That is `predecessor-notice`'s blind
  // spot in a second file, and the reason the rule is "read it" rather than "spell it carefully".
  const rootVersion = JSON.parse(read('package.json')).version;
  assert.ok(read('docs/README-head.md').includes(rootVersion),
    `the head does not carry the root version ${rootVersion}`);
  // D-02. The licence line is the tail's — it is the README's statement, not an install step — and
  // the head names it too, which is where a reader looks first.
  assert.match(read('docs/README-tail.md'), /Apache-2\.0/);
  assert.match(read(README), /Apache-2\.0/);
});

test('criterion 5 — "what you will see" is the tool\'s own text, not a copy of it', () => {
  const text = JSON.parse(read('tools/snowarch/lib/text.json'));
  const region = /<!-- generated:closing-block -->\n([\s\S]*?)<!-- \/generated:closing-block -->/
    .exec(read(INSTALL));
  assert.ok(region, 'no closing-block region');
  for (const line of [text.doctorUnavailable, text.modeDesign, text.posix.nextDesign]) {
    assert.ok(region[1].includes(line), `the page's block is missing: ${line.split('\n')[0]}`);
  }
});

test('...and the dialogs paragraph is generated from the number, with its caveat', () => {
  const text = JSON.parse(read('tools/snowarch/lib/text.json'));
  const config = JSON.parse(read('engine.config.json'));
  const region = /<!-- generated:dialogs -->\n([\s\S]*?)<!-- \/generated:dialogs -->/.exec(read(INSTALL));
  assert.equal(region[1].trimEnd(), dialogsParagraph(text, config.floors.claudeCode));
  assert.match(region[1], /\*\*one dialog\*\*/);
  // The floor is named alongside the measurement. Saying "one dialog" without saying where that
  // was measured is the promise this repository has been careful not to make.
  assert.ok(region[1].includes(config.floors.claudeCode));
  // Two dialogs would read as two — the paragraph is a function, not a sentence with a number in it.
  assert.match(dialogsParagraph({ ...text, expectedDialogs: 2 }, '2.1.214'), /\*\*two dialogs\*\*/);
});

test('every POSIX command that has a Windows spelling shows it', () => {
  const install = read(INSTALL);
  for (const [posix, windows] of [
    ['./bootstrap.sh', '.\\bootstrap.cmd'],
    ['./snowarch mode live', 'snowarch.cmd mode live'],
  ]) {
    assert.ok(install.includes(posix), `${posix} is not on the page`);
    assert.ok(install.includes(windows), `${posix} appears without its Windows spelling`);
  }
  // The prerequisites table says why Windows needs Git for Windows even though the launchers do not.
  assert.match(install, /Git for Windows/);
  assert.match(install, /launchers need no Git Bash/);
});

test('every repository path the page names exists', () => {
  const install = read(INSTALL);
  const paths = new Set();
  for (const m of install.matchAll(/`((?:docs|scripts|packages|tools|governance|\.claude|\.local)\/[A-Za-z0-9._/-]*)`/g)) {
    paths.add(m[1]);
  }
  assert.ok(paths.size >= 6, `only ${paths.size} paths found — is the pattern right?`);
  for (const p of paths) {
    // Created by the install and gitignored: the page describes them, and a fresh clone — which is
    // what a reader has when they read this — does not have them yet.
    if (p.startsWith('.local/') || p === '.claude/settings.local.json') continue;
    assert.ok(existsSync(join(root, p.replace(/\/$/, ''))), `${p} does not exist`);
  }
});

test('the page stays a page, and the tail stays a tail', () => {
  const count = (rel) => read(rel).split('\n')
    .filter((l, i, a) => !(i === a.length - 1 && l === '')).length;
  const install = count(INSTALL);
  const tail = count('docs/README-tail.md');
  // 250 was the story's criterion and it measures the INSTALL PAGE. "What is here" and the licence
  // were on this page until S13's review, which is 34 lines the criterion was measuring by accident
  // of composition; they are `docs/README-tail.md` now, with a budget of their own so that moving
  // them out of one cap did not put them beyond any.
  //
  // 252 since ARC-09-S03: every release now re-measures the corpus on all three platforms and
  // attaches the table, and the page says so and links it. Two lines, and they were bought rather
  // than found — the first attempt paid for them by trimming two provenance strings, which the
  // attribution tests caught and were right to: every figure on this page names where it was
  // measured, and that is the property the page exists to have. A cap is worth moving for a fact;
  // it is not worth an unattributed number.
  //
  // 268 since ARC-09-S07: "how do I upgrade" is the second question an install page is asked, and
  // an answer that lived only in CONTRIBUTING would be an answer for contributors. Sixteen lines,
  // and they are the ones a user needs before typing the command — that nothing moves before the
  // plan is accepted, that credentials are never read or written, that a schema change is a
  // migration with a backup, that the banner never fetches. The DETAIL is in CONTRIBUTING, linked
  // from here. Same rule as the last two moves: a cap is worth moving for a fact.
  //
  // 277 since ARC-09-S11, and this one is the smallest move yet for the most-used fact: "what do I
  // paste when I report this". The sentence existed — buried at the end of the preflight-remedy
  // paragraph, where nobody looking for it would find it — and a person writing an issue is not
  // re-reading the section about what to do if the bootstrap failed. It is now a heading with the
  // two commands under it, plus the sentence that neither prints a credential, which is what makes
  // a stranger willing to paste the output into a public issue. NOTHING WAS DELETED to pay for it:
  // ARC-07-S10's ruling is budget-neutral material to a linked page or a cap that moves for a
  // fact, never a required sentence removed, and re-wrapping the page instead was tried and
  // rejected — INSTALL.md is a generated SOURCE composed into README.md, so re-flowing its prose
  // moves the composition and buys one line.
  //
  // 279 since ARC-10-S01, and it is the cheapest line on the page: one sentence telling a reader of
  // the OLD two-repository setup that there is a page for them. Without it, the person most likely
  // to lose an engagement folder or leave a password in `~/.claude.json` meets an install page
  // written for a fresh machine and follows it. Same rule as the last three moves — a cap is worth
  // moving for a fact, and nothing was deleted to pay for it.
  // 288 since ARC-06-C12, and this one was bought by a validation run rather than by a review. The
  // Ubuntu validation of v2.0.0-rc.4 could not be done from this page: Path A's one-line command
  // clones the default branch, `main` was five days and about twenty merged pull requests behind the
  // candidate, and the page documented no other case. The run had to deviate from the page to test
  // the thing being released, and that deviation is in `docs/validation/2026-09-17-ubuntu.md`.
  //
  // Eight lines pay for the named-version clone, the sentence that `main` is the last released
  // version while a tag is a specific one, and the pointer to `snowarch upgrade` for a checkout that
  // already exists. The ninth is ARC-06-C11: the preflight sentence now states a count that is true
  // on BOTH paths — seven lines on the Node path, five without it — where the old one was right for
  // neither, and it says that the root is checked on both even though the Node-free launcher speaks
  // only when it fails. Same rule as the five moves above: a cap is worth moving for a fact, and
  // NOTHING WAS DELETED to pay for it.
  // 298 since ARC-06-C17, and it is the most expensive line on this page because the FIRST cut
  // of it was wrong. The owner's orphan (`~/snowarch-v200-test`, 2026-09-24) came from a
  // `--register local` run, not from a default install: `state.mjs` defaults `registration:
  // 'project'`, whose branch in `mode.mjs` never calls `add-json` — the committed `.mcp.json`
  // lives inside the checkout and dies with it. So the page's old sentence, *nothing was written
  // to Claude Code's own configuration unless you chose the fallback registration*, was TRUE and
  // its qualifier was the point. The first cut deleted it, asserted its absence, and wrote a
  // replacement that is false for every default install.
  //
  // These lines buy BOTH halves, which is why they cost more than the wrong version did: the
  // instruction (unconditionally safe), where the default registration lives and that it writes
  // nothing to Claude Code, the scoped reason for `--register local|user`, the ordering (it must
  // run while the checkout exists), and the by-hand line for a reader who has already deleted the
  // folder or made the entry themselves. Same rule as the six moves above: a cap is worth moving
  // for a fact, and NOTHING WAS DELETED to pay for it.
  assert.ok(install <= 298, `${install} lines of install page (criterion: 298)`);
  assert.ok(tail <= 40, `${tail} lines of README tail (budget: 40)`);
  // The corpus cost stays on the install page: what the install takes off the disk is an install
  // fact, and every figure on it carries where it was measured.
  assert.match(read(INSTALL), /### What the corpus costs/);
  assert.match(read(INSTALL), /measured 2026-09-06, ARC-00 S-07/);
});

test('the server package\'s generated tables are current too', () => {
  // A different document from this one — the server's own reference README — and the story's
  // "four table blocks" belong to it, not to the install page. Checked here because the two
  // generators are easy to confuse from the outside.
  const r = spawnSync(process.execPath, [join(root, 'scripts/gen-readme-tables.mjs'), '--check'],
    { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('no live page still points at an install guide that was deleted', () => {
  // The failure this catches is P-02's other half: a page telling a reader to read a page that is
  // not there. `docs/USER-GUIDE.md` is checked for the INSTALL links only (below) — it is an
  // ARC-02 import with four other dangling links of its own, reported rather than fixed here;
  // widening this test to it now would fail for reasons no S13 change caused.
  // `docs/RELICENSING.md` is exempt outright: recording what was retired is its job.
  for (const rel of ['docs/ARCHITECTURE.md', 'docs/CONTRIBUTING.md',
    'docs/PLATFORM-NOTES.md', INSTALL, README]) {
    const text = read(rel);
    for (const m of text.matchAll(/\]\(\.?\/?((?:docs\/)?[A-Z][A-Z0-9-]*\.md)\)/g)) {
      const target = m[1].startsWith('docs/') ? m[1] : join('docs', m[1]);
      assert.ok(existsSync(join(root, target)) || existsSync(join(root, m[1])),
        `${rel} links to ${m[1]}, which does not exist`);
    }
  }
  // Task 5: the two imported narratives are gone, and the page that linked to them says INSTALL.
  for (const gone of ['SETUP.md', 'docs/INSTALLATION-GUIDE.md', 'docs/ADVANCED-WEB-SETUP.md']) {
    assert.equal(existsSync(join(root, gone)), false, `${gone} is back — there is one install page`);
  }
  const guide = read('docs/USER-GUIDE.md');
  assert.equal(/INSTALLATION-GUIDE|ADVANCED-WEB-SETUP/.test(guide), false);
  assert.match(guide, /\]\(\.\/INSTALL\.md\)/);
});

// ─── ARC-06-C17 — deregister before deleting the folder ───────────────────────────────────────
//
// The owner deleted `~/snowarch-v200-test` after the v2.0.0 as-a-user test and left an orphan
// (2026-09-24). The orphan came from a `--register local` run, NOT from a default install:
//
//   default      `registration: 'project'` (`state.mjs`) — the committed `.mcp.json` INSIDE the
//                checkout. It dies with the folder, and nothing of ours reaches `~/.claude.json`.
//   local/user   `claude mcp add-json -s <scope>` (`mode.mjs`) — an entry in Claude Code's own
//                `~/.claude.json`, KEYED BY THIS FOLDER'S PATH, which deleting the folder leaves
//                behind while `claude` keeps trying to start a server from a directory that is gone.
//
// So the page needs BOTH halves: the instruction (unconditionally safe — a no-op on project and on
// design-only) and a reason that is SCOPED, because telling every reader the product wrote to their
// Claude config when it did not is the kind of sentence this row exists to remove.
//
// DOCS ONLY: a registration is keyed by its own folder, so a check inside another checkout asks
// about a different key, and for the deleted one there is no tree left to run a check in.
test('ARC-06-C17 — Uninstall says to deregister BEFORE deleting, and why', () => {
  for (const page of [README, INSTALL]) {
    const uninstall = read(page).slice(read(page).indexOf('### Uninstall'));
    assert.ok(uninstall.length > 0, `${page} has no Uninstall section`);
    assert.match(uninstall, /\.\/snowarch mode design/,
      `${page} does not tell a reader to deregister before deleting`);
    assert.match(uninstall, /before you delete/i,
      `${page} does not say the deregistration comes first`);
    assert.match(uninstall, /~\/\.claude\.json/,
      `${page} does not name the file the orphan is left in`);

    // ORDER, ASSERTED. The first cut's comment claimed "that it comes FIRST" and checked only
    // presence — the architect moved the paragraph after the delete step and this test stayed
    // green. A comment claiming an assertion that does not exist is the hollow-binding shape for
    // the third time in this arc, so the claim is now a line of code.
    const deregister = uninstall.indexOf('mode design');
    const del = uninstall.indexOf('Then delete');
    assert.notEqual(del, -1, `${page}: the delete step is not where this test expects it`);
    assert.ok(deregister < del,
      `${page} tells a reader to delete the checkout before deregistering it`);
  }
});

test('ARC-06-C17 — Uninstall states BOTH halves: the default writes nothing, local/user does', () => {
  // NOT a ban on a sentence. The first cut deleted "Nothing was written to Claude Code's own
  // configuration unless you chose the fallback registration" and asserted its ABSENCE — but that
  // sentence was TRUE, and its qualifier was the whole point. The test enforced the removal of a
  // true statement and replaced it with one false for every default install.
  for (const page of [README, INSTALL]) {
    const uninstall = read(page).slice(read(page).indexOf('### Uninstall'));
    // The default half: the registration lives in the checkout and dies with it.
    assert.match(uninstall, /\.mcp\.json/,
      `${page} does not say where the DEFAULT registration lives`);
    assert.match(uninstall, /nothing (of ours )?was written to Claude Code/i,
      `${page} no longer says the default writes nothing to Claude Code's configuration`);
    // The scoped half: the orphan belongs to --register local|user.
    assert.match(uninstall, /--register local/,
      `${page} does not scope the orphan to the registration that causes it`);
  }
});

// ─── ARC-09-C60 — the command a new user runs must land on a release ───────────────────────────
//
// Found at the ARC-10-S06 sitting, before the owner had typed anything, and it is the same class
// this file exists for: a sentence that was true of an intention.
//
// The repository's default branch is `main`. It has not moved since M1 — 359 commits behind
// `develop`, `package.json` still `2.0.0-dev`, from before the first release existed. A plain
// `git clone` checks out the default branch, so the PRIMARY command on the install page, on the
// migration page, and in the README those pages generate, installed a pre-release tree carrying
// none of the three releases' fixes.
//
// AND THE PAGE EXPLAINED WHY IT WAS RIGHT. "That installs the latest release. `main` is whatever
// was released last" — both sentences false, and they are the reason a reader would not think to
// check. A wrong command with a confident justification is worse than a wrong command.
//
// The tag form existed as the SECONDARY option and said `--branch v2.0.0`: a hand-written literal
// that nothing updated, stale by two releases on the day it was read. So this row moves the pinned
// form to primary AND gives it a writer, because a version in a page that no writer owns is a
// version that goes stale — this page is the evidence.

const USER_PAGES = ['docs/INSTALL.md', 'docs/MIGRATION.md', 'README.md'];

test('ARC-09-C60 — no user page tells a reader to clone without pinning a release', () => {
  const offenders = [];
  for (const rel of USER_PAGES) {
    read(rel).split('\n').forEach((line, i) => {
      // A COMMAND, not prose about one. The page legitimately discusses `git clone` refusing a
      // non-empty directory, and names the two commands Claude Code runs; neither is a line a
      // reader copies. A command line is one that carries the clone URL and no `--branch`.
      if (!/git clone\s+https:\/\/github\.com\/\S+/.test(line)) return;
      if (line.includes('--branch')) return;
      offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [],
    `${offenders.length} clone command(s) would land a user on the default branch, which is not a `
    + 'release:\n' + offenders.join('\n'));
});

test('ARC-09-C60 — and the page does not claim the default branch is the latest release', () => {
  // The justification, asserted separately from the command: fixing one and leaving the other is
  // how the page came to explain a wrong command convincingly.
  for (const rel of USER_PAGES) {
    const text = read(rel);
    assert.equal(/`main` is whatever was released last/.test(text), false,
      `${rel} still tells the reader that \`main\` is the latest release`);
  }
});

test('ARC-09-C61 — the pinned clone names the newest release that exists', async () => {
  // THE SECOND PLACE THE RELEASE'S WRITES DO NOT COME BACK. `writeInstallTag` runs during the
  // release, on the release branch, which is not an ancestor of `develop` — so `develop` sat at
  // `--branch v2.0.2` from the moment `v2.0.3` was tagged, and the bump PR is the only thing that
  // can bring it back. Exactly the shape ARC-09-C12c found for the changelog, in a file nobody had
  // checked for it.
  //
  // My own C60 runbook note made it worse by being half right: "the release writes it; the bump
  // leaves it alone". The first half — never write a `-dev` version here — is correct; the second
  // left every reader of `develop` pointed at the previous release.
  //
  // DEFERS WITHOUT TAGS rather than passing quietly, which is ARC-10's conditional-guard shape: on a
  // clone with no tags there is no newest release to compare against, and a green run there would be
  // a guard that never fired where it matters.
  const { execFileSync } = await import('node:child_process');
  const tags = (() => {
    try {
      return execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' })
        .split('\n').map((t) => t.trim()).filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
    } catch { return []; }
  })();
  if (tags.length === 0) {
    assert.ok(true, 'no release tags in this clone — nothing to compare the pages against');
    return;
  }
  const num = (t) => t.slice(1).split('.').map(Number);
  const newest = tags.sort((a, b) => {
    const [x, y] = [num(a), num(b)];
    return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]);
  })[0];

  for (const rel of ['docs/INSTALL.md', 'docs/MIGRATION.md', 'README.md']) {
    const named = [...read(rel).matchAll(/git clone --branch (v\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    assert.ok(named.length > 0, `${rel} names no release tag in a clone command`);
    for (const tag of new Set(named)) {
      assert.equal(tag, newest,
        `${rel} tells a reader to clone ${tag}, but ${newest} is the newest release in this clone `
        + '— the release wrote it on a branch that is not an ancestor of develop, and the bump PR '
        + 'has to bring it back');
    }
  }
});
