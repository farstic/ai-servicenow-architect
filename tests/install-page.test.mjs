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
    for (const rel of [INSTALL, README, 'docs/README-head.md', 'docs/snippets/terminal-handoff.md',
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
    assert.match(after.stderr, /composed from docs\/README-head\.md \+ docs\/INSTALL\.md/);
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

test('...and the two the page must contain', () => {
  assert.match(read('docs/README-head.md'), /2\.0\.0/, 'the head carries no version');
  assert.match(read(INSTALL), /Apache-2\.0/, 'D-02: the licence is named on the page');
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

test('the page stays a page — the budget, with both numbers reported', () => {
  const lines = read(INSTALL).split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).length;
  const install = read(INSTALL);
  // The install NARRATIVE ends at "What is here": that heading and "Licence and attribution" are
  // README sections, and they live here only because README = head + this body and the head is
  // capped at ten lines. Both numbers are asserted so neither can grow unnoticed.
  const narrative = install.slice(0, install.indexOf('\n## What is here')).split('\n').length;
  assert.ok(narrative <= 250, `${narrative} lines of install narrative (story target: 250)`);
  assert.ok(lines <= 270, `${lines} lines total, ${lines - narrative} of them README sections`);
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
