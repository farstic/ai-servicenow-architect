// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C300 — docs/INSTALL-MACOS.md is true of the product it describes.
 *
 * The page is for a Mac user who has nothing installed and follows it from top to bottom, one command at a time, on one of two paths: with the
 * Mac's administrator password (path A), or on a company Mac without it (path B). It is the twin of docs/INSTALL-WINDOWS.md and of the test beside
 * that page (tests/install-windows-guide.test.mjs, ARC-09-C271), and it goes wrong in the same two ways: a screen it quotes stops being what the
 * product prints, or a command it tells the reader to type stops being one the product has. This file holds both, and the shape the reader depends
 * on: one command per block, no administrator rights outside path A, the licence in place before the installer, a bash line for every zsh line.
 *
 * WHAT IS DERIVED, AND FROM WHAT. The product's own constants and functions where it exports them (the plan screen and the steps it lists, the
 * permissions screen and the presets, the instance sub-command table, the licence file's path and its banner line, the store line, the launcher's
 * spelling); its source text, without the lines that are only comments, where it does not (the wizard's questions and menus are strings inside
 * functions), so a phrase on the page must occur there verbatim. Nothing here is a copy of the product's text kept for the test: the
 * phrase list names what the PAGE says, and the product is asked whether it still says so. Three things the product does not hold are pinned to the page
 * and nothing else, each with where it was measured: the macOS floor of the Node.js release, the size of the draw.io image, and the closing line.
 *
 * WHAT THE WINDOWS TWIN CHECKS AND THIS FILE DOES NOT, because it has no meaning on a Mac: the administrator-window check (Win + R, the integrity level,
 * `whoami /groups`); the four outcomes of the permission lock on a Windows store and the F9 repair that applies them (a Mac has one store line, one
 * check, SV-02, and one repair, F5); the wizard line about a lock that failed; the PowerShell lines that change the user's PATH, and `%APPDATA%\npm`
 * for the SDK (where `npm i -g` puts a tool on a Mac is on the Mac test list, not known yet); the three messages of an install without administrator
 * rights and their reload command; the PowerShell form of the Word converter; and the record of the end-to-end run, which does not exist for a Mac yet:
 * the page ends "Not yet tested end to end on a Mac.", and that line is held here until the Mac run turns it into a record.
 *
 * AND WHAT IS NOT HERE YET, deliberately: the twin of the remedies check (the product's darwin remedies for git and Node.js still name Homebrew, and
 * name no step of this page; rewriting them, and TROUBLESHOOTING's Mac paragraph, are rows of 2.2.8) and the twin of the check that both pages hold
 * the same troubleshooting messages.
 *
 * The commands the page makes the reader type that are safe to run, and whose behaviour the page describes (the PATH lines, the licence copy, the
 * `drawio` command of path B), are run here against a temporary home folder with bash, where bash is. Nothing runs outside it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const href = (rel) => pathToFileURL(join(root, rel)).href;
const PAGE = 'docs/INSTALL-MACOS.md';
const page = read(PAGE);

// The launcher a Mac types is the product's own spelling of it for zsh and bash alike, never a copy kept here (the launcher audit, ARC-07-C35).
const { cliSpelling, bootstrapSpelling } = await import(href('packages/snowarch/dist/cli/tty.js'));
const cli = cliSpelling('darwin', { SHELL: '/bin/zsh' });
const bootstrap = bootstrapSpelling('darwin', { SHELL: '/bin/zsh' });

/** Whitespace folded, so a sentence wrapped across two source lines is still one sentence. */
const fold = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * The page's fenced blocks, each with the line that introduces it and the heading it sits under.
 * A line ending `Run:` introduces a command; a line starting `On screen` introduces what the reader sees.
 * The parser is the Windows twin's, unchanged: every command label on this page ends in `Run:` (`**zsh**. Run:`, `**Apple silicon** (…). Run:`).
 */
function blocksOf(text) {
  const out = [];
  let heading = '';
  let label = '';
  let open = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (open) { out.push(open); open = null; } else {
        open = { kind: /(^|\s)Run:$/.test(label) ? 'run' : label.startsWith('On screen') ? 'screen' : 'other', label, heading, lines: [] };
      }
      continue;
    }
    if (open) { open.lines.push(line); continue; }
    if (/^#{1,4} /.test(line)) heading = line.replace(/^#+ /, '');
    if (line.trim() !== '') label = line.trim();
  }
  return out;
}

/** The page's headings outside the fenced blocks, in order. */
function headingsOf(text) {
  const out = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) { fenced = !fenced; continue; }
    const m = !fenced && /^(#{1,4}) (.+)$/.exec(line);
    if (m) out.push({ level: m[1].length, title: m[2] });
  }
  return out;
}

/** The page without its fenced blocks: what a reader reads, as against what a reader types or sees. */
function proseOf(text) {
  const out = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) { fenced = !fenced; continue; }
    if (!fenced) out.push(line);
  }
  return out.join('\n');
}

const blocks = blocksOf(page);
const runs = blocks.filter((b) => b.kind === 'run');
const screens = blocks.filter((b) => b.kind === 'screen');
/** Every command line the page asks for, in order, with the heading and the label line it sits under. */
const commands = runs.flatMap((b) => b.lines.filter((l) => l.trim() !== '').map((line) => ({ line, heading: b.heading, label: b.label })));
const lines = commands.map((c) => c.line);
const at = (pred) => commands.findIndex(pred);
const headings = headingsOf(page);
const titles = headings.map((h) => h.title);
const prose = proseOf(page);
/** What the reader sees, folded: the plan screens, the wizard, the check screens. */
const onScreens = fold(screens.flatMap((b) => b.lines).join('\n'));
const closing = page.trimEnd().split('\n').at(-1);

/** The Node.js release the page installs, from its first download (the installer file); the test of the downloads holds the other two to it. */
const NODE_PKG = /^curl -fL -o ~\/snowarch-dl\/node\.pkg https:\/\/nodejs\.org\/dist\/v(\d+\.\d+\.\d+)\/node-v(\d+\.\d+\.\d+)\.pkg$/;
const node = commands.map((c) => NODE_PKG.exec(c.line)).find(Boolean)?.[1] ?? null;

/** The states of the licence, as the product declares them. */
function licenceStates() {
  const union = /export type LicenceState = ([^;]+);/.exec(read('packages/snowarch/src/licence/core.ts'));
  assert.ok(union, 'the product no longer declares LicenceState where it did');
  return [...union[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
}

/** The product's source text: every place a screen's words are written. Unescaped, so a `—` in a string is the dash on the page. */
function productText() {
  const walk = (dir, accept, out = []) => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel, accept, out); else if (accept.test(name)) out.push(rel);
    }
    return out;
  };
  const files = [
    ...walk('packages/snowarch/src/cli', /\.ts$/), ...walk('packages/snowarch/src/licence', /\.ts$/),
    // The probes' words (`ServiceNow SDK not installed`) and the reachability menu of the URL question are written here, one folder beyond the Windows twin's.
    ...walk('packages/snowarch/src/servicenow', /\.ts$/),
    ...walk('tools/snowarch/lib', /\.(mjs|json)$/),
  ];
  // A line that is only a comment is not the product saying something: a phrase the code stopped printing would otherwise stay "found" in the comment that
  // explains it (several of the phrases below have such comments). Trailing comments stay, because a regex cannot tell one from a string.
  const code = (rel) => read(rel).split('\n').filter((l) => !/^\s*(?:\/\/|\/\*|\*)/.test(l)).join('\n');
  return fold(files.map(code).join('\n')
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\'/g, "'").replace(/\\"/g, '"')
    // A sentence the source writes as two literals joined with `+` is one sentence on the screen.
    .replace(/['"`]\s*\+\s*['"`]/g, ''));
}

// ───────────────────────────── the shape of the page ─────────────────────────────

test('ARC-09-C300 — the page has the steps it is read in, and the two paths sit under the three steps where they differ', () => {
  for (const heading of ['Step 1 · Open Terminal', 'Which shell your Terminal uses', 'Step 2 · Install the programs', 'Path A or path B: choose yours first',
    '2a · Git (Apple\'s Command Line Tools)', '2b · Node.js', '2c · Claude Code', '2d · Tell your Mac where Claude Code is',
    '2e · Open a fresh window and check', '2f · draw.io Desktop (for the diagrams)',
    'Step 3 · Sign in to Claude Code', 'Step 4 · Download the AI Architect', 'Step 5 · Add your licence', 'Step 6 · Run the installer',
    'Step 7 · Check your licence', 'Step 8 · Start the AI Architect', 'Optional tools', 'Every day', 'Change settings later', 'Licence renewal',
    'New releases', 'If something goes wrong', 'Asking for help', 'Uninstall', 'Your data and safety', 'What has not been tested']) {
    assert.ok(titles.includes(heading), `no heading "${heading}"`);
  }
  // The sub-steps are named by their number: their words may change, the number is what the rest of the page points at.
  for (const ref of ['5a', '5b', '5c', '6a', '6b', '6c', '6d', '6e']) assert.ok(titles.some((t) => t.startsWith(`${ref} · `)), `no sub-step ${ref}`);
  assert.ok(titles.indexOf('Path A or path B: choose yours first') < titles.findIndex((t) => t.startsWith('2a · ')), 'the choice of a path comes before 2a');
  assert.match(page, /^\| \| Path A \| Path B \|$/m, 'the table that sets the two paths side by side is gone');

  // 2a, 2b and 2f are where the paths differ: each has exactly one Path A and one Path B heading, in that order. 2c, 2d and 2e are the same for both.
  const under = (ref) => {
    const from = headings.findIndex((h) => h.level === 3 && h.title.startsWith(`${ref} · `));
    assert.ok(from >= 0, `no ${ref} heading`);
    const subs = [];
    for (const h of headings.slice(from + 1)) { if (h.level <= 3) break; subs.push(h.title); }
    return subs;
  };
  for (const ref of ['2a', '2b', '2f']) {
    const subs = under(ref);
    assert.equal(subs.length, 2, `${ref} should have one Path A and one Path B heading, it has: ${subs.join(' / ')}`);
    assert.ok(subs[0].startsWith('Path A · ') && subs[1].startsWith('Path B · '), `${ref}: the two paths are not Path A then Path B: ${subs.join(' / ')}`);
  }
  for (const ref of ['2c', '2d', '2e']) assert.deepEqual(under(ref), [], `${ref} is the same for both paths and has no Path heading`);
  assert.equal(titles.filter((t) => /^Path [AB] · /.test(t)).length, 6, 'the page has six Path headings: A and B under each of 2a, 2b and 2f');
});

test('ARC-09-C300 — every step, sub-step and section the page sends the reader to exists', () => {
  const refs = new Set([...prose.matchAll(/\b([2-6][a-f])\b/g)].map((m) => m[1]));
  assert.ok(refs.size >= 10, `only ${refs.size} sub-step references found: the reading is broken`);
  for (const ref of refs) assert.ok(titles.some((t) => t.startsWith(`${ref} · `)), `the page points at ${ref}, which it has no heading for`);
  for (const n of new Set([...prose.matchAll(/\bStep (\d)\b/g)].map((m) => m[1]))) {
    assert.ok(titles.some((t) => t.startsWith(`Step ${n} · `)), `the page points at Step ${n}, which it has no heading for`);
  }
  // A section named in quotation marks is a heading, or a bold lead-in such as "Add another instance".
  const named = new Set([...prose.matchAll(/"([A-Z][A-Za-z' ]{3,50})"/g)].map((m) => m[1]));
  assert.ok(named.size >= 8, `only ${named.size} quoted section names found: the reading is broken`);
  for (const name of named) assert.ok(titles.includes(name) || page.includes(`**${name}.**`), `the page sends the reader to "${name}", which is no section of it`);
  // A repository path the page names is a file of the repository (a folder of the install, such as .local/ or vendor/, is the reader's own).
  for (const m of prose.matchAll(/(?<![\w/.-])((?:docs|scripts)\/[A-Za-z0-9._/-]*[A-Za-z0-9])/g)) assert.ok(existsSync(join(root, m[1])), `the page names ${m[1]}, which is not in the repository`);
});

test('ARC-09-C300 — every command block holds exactly one command', () => {
  assert.ok(runs.length >= 40, `only ${runs.length} command blocks found: the parser lost some`);
  const bad = runs.filter((b) => b.lines.filter((l) => l.trim() !== '').length !== 1);
  assert.deepEqual(bad.map((b) => `${b.heading}: ${b.lines.join(' / ')}`), [],
    'a pasted block of several lines arrived broken on the first end-to-end install on Windows, and the shell asked a question nobody expected');
});

// ───────────────────────────── no administrator, no hole ─────────────────────────────

/** What may ask a Mac user for an administrator, and so is allowed only under a Path A heading: Apple's tools installer and the Node.js installer. */
const PATH_A_ONLY = [/^xcode-select --install$/, /^open ~\/snowarch-dl\/node\.pkg$/];

test('ARC-09-C300 — no command needs an administrator except under a Path A heading, and nothing under Path B leaves the home folder', () => {
  for (const { line, heading } of commands) {
    assert.doesNotMatch(line, /\b(?:sudo|brew|softwareupdate|chown|chsh|xattr|spctl|launchctl)\b|\bdefaults\s+write\b/, `${heading}: ${line}`);
    // The page deletes nothing by command: the Uninstall step moves the folder to the Trash in Finder, which can be undone.
    assert.doesNotMatch(line, /\b(?:rm|rmdir|mv)\b/, `${heading}: a command that deletes or moves: ${line}`);
    if (PATH_A_ONLY.some((re) => re.test(line))) assert.ok(heading.startsWith('Path A'), `${heading}: ${line} may ask for an administrator's password and belongs under a Path A heading`);
    if (heading.startsWith('Path B')) {
      // An absolute path starts after a space, a quote or an equals sign: `$HOME/…` and `~/…` do not, and a shebang or a URL has a character before its slash.
      assert.doesNotMatch(line, /(?:^|[\s"'=])\/[A-Za-z]/, `${heading}: path B has no password, so it writes only inside the home folder: ${line}`);
    }
  }
  // The allowance is not vacuous: each of the two commands is on the page once, and is Path A's.
  for (const re of PATH_A_ONLY) assert.equal(commands.filter((c) => re.test(c.line)).length, 1, `${re}: expected exactly one command`);
  // ...and neither is the rule: path B has the commands that make its folders (a heading that lost them would pass the loop above with nothing to hold).
  const pathB = commands.filter((c) => c.heading.startsWith('Path B'));
  assert.ok(pathB.length >= 10, `only ${pathB.length} commands sit under a Path B heading: the reading is broken`);
  for (const expected of ['git --version', 'mkdir -p ~/.local/node', 'mkdir -p ~/Applications']) assert.ok(pathB.some((c) => c.line === expected), `path B lost the command: ${expected}`);
});

test('ARC-09-C300 — a command is paste-ready: no placeholder the reader must replace', () => {
  for (const { line, heading } of commands) {
    // The last time a placeholder was pasted it went into a prompt that stored it.
    assert.doesNotMatch(line, /<[A-Za-z][^>]*>/, `${heading}: a placeholder in a command: ${line}`);
    assert.doesNotMatch(line, /(?<!\$)\{[A-Za-z][A-Za-z0-9_]*\}/, `${heading}: a {placeholder} in a command: ${line}`);
    // The licence is copied under a pattern, so the reader never edits a command with a licence number in it.
    assert.doesNotMatch(line, /LIC-\d{4}-\d{4}/, `${heading}: a licence number in a command: ${line}`);
  }
});

// ───────────────────────────── PATH, the shells and the user's own files ─────────────────────────────

const BASH_CHECK = 'ls ~/.bash_profile ~/.bash_login ~/.profile';
/** The one shape of a line that changes the user's PATH: it puts a folder of their own in front, in the file their shell reads, and applies it to the window. */
const PATH_LINE = /^echo 'export PATH="\$HOME\/(\.local(?:\/node)?\/bin):\$PATH"' >> ~\/\.(zshrc|bash_profile) && source ~\/\.(zshrc|bash_profile)$/;
/** The folders the page puts on PATH: Node.js on path B (2b) and Claude Code's own (2d). A third is a deliberate change of this list. */
const PATH_FOLDERS = ['.local/node/bin', '.local/bin'];

test('ARC-09-C300 — a PATH change is the user\'s, in one shape, and every zsh line has its bash line', () => {
  const changes = commands.filter((c) => c.line.includes('>>'));
  assert.ok(changes.length >= 4, `only ${changes.length} commands append to a file: the reading is broken`);
  for (const { line, heading } of changes) {
    const m = PATH_LINE.exec(line);
    assert.ok(m, `${heading}: this appends something other than an export PATH line that puts the user's own folder first: ${line}`);
    assert.equal(m[2], m[3], `${heading}: the file appended to is not the file that is sourced: ${line}`);
    assert.ok(PATH_FOLDERS.includes(m[1]), `${heading}: a folder this list does not know goes on PATH: ${m[1]}`);
  }
  // Every redirect on the page writes one of three places: the zsh file or the bash file by appending, and the `drawio` command of path B by creating it.
  const WRITES = { '>>': ['~/.zshrc', '~/.bash_profile'], '>': ['~/.local/bin/drawio'] };
  for (const { line, heading } of commands) {
    for (const m of line.matchAll(/(>>?)\s*(~\/\S+)/g)) assert.ok(WRITES[m[1]]?.includes(m[2]), `${heading}: ${m[1]} ${m[2]} writes a file this page does not account for: ${line}`);
  }
  // zsh first, bash where it differs: the bash line is the next command, the same but for the file, and each carries its shell's name.
  commands.forEach((c, i) => {
    if (/~\/\.zshrc\b/.test(c.line)) {
      assert.equal(commands[i + 1]?.line, c.line.replaceAll('~/.zshrc', '~/.bash_profile'), `${c.heading}: the zsh command ${c.line} has no bash twin straight after it`);
      assert.ok(c.label.startsWith('**zsh**'), `${c.heading}: the zsh command is not labelled zsh: ${c.label}`);
      assert.ok(commands[i + 1].label.startsWith('**bash**'), `${c.heading}: the bash twin is not labelled bash: ${commands[i + 1].label}`);
    }
    if (c.line !== BASH_CHECK && /~\/\.bash_profile\b/.test(c.line)) {
      assert.equal(commands[i - 1]?.line, c.line.replaceAll('~/.bash_profile', '~/.zshrc'), `${c.heading}: the bash command ${c.line} has no zsh command straight before it`);
    }
  });
  assert.ok(changes.filter((c) => /~\/\.zshrc\b/.test(c.line)).length >= 2, 'the page no longer changes PATH under zsh twice (Node.js on path B, Claude Code)');
});

test('ARC-09-C300 — bash is checked before it is written to: a .bash_profile that would hide the reader\'s own file', () => {
  assert.equal(commands.filter((c) => c.line === BASH_CHECK).length, 1, 'the Step 1 check of the bash files is not on the page exactly once');
  const check = at((c) => c.line === BASH_CHECK);
  const firstBash = at((c) => c.line.includes('>> ~/.bash_profile'));
  assert.ok(check >= 0 && firstBash >= 0 && check < firstBash, 'the check of the bash files must come before the first command that appends to .bash_profile');
  assert.ok(commands[check].heading === 'Which shell your Terminal uses' && commands[check].label.startsWith('**bash**'), 'the check belongs to Step 1 and is for bash readers');
  // bash reads the first of .bash_profile, .bash_login and .profile that exists, so making a .bash_profile hides the others: the page says to stop first.
  const stop = page.indexOf('stop here and ask for help before Step 2');
  assert.ok(stop >= 0 && stop < page.indexOf('>> ~/.bash_profile'), 'the rule that stops the reader comes after the first command that would break it');
  // zsh is asked first, and the answer decides which of the labelled commands the reader runs.
  assert.ok(lines.indexOf('echo $0') >= 0 && lines.indexOf('echo $0') < check, 'the question of which shell comes before the bash check');
});

// ───────────────────────────── the licence ─────────────────────────────

test('ARC-09-C300 — the licence is in place before the installer, under the name the product reads', async () => {
  const mkdir = at((c) => c.line === 'mkdir -p .local');
  const ls = at((c) => c.line === 'ls ~/Downloads/LIC-*.json');
  const copy = at((c) => c.line === 'cp ~/Downloads/LIC-*.json .local/licence.json');
  const boot = at((c) => c.line === bootstrap);
  assert.ok(mkdir >= 0 && ls >= 0 && copy >= 0 && boot >= 0, 'one of the four commands is gone');
  assert.ok(mkdir < ls && ls < copy && copy < boot, 'the folder, the look at the file, the copy, then the installer');
  assert.equal(commands.filter((c) => c.line === bootstrap).length, 1, 'the installer is a command of Step 6 once');
  assert.deepEqual([mkdir, ls, copy].map((i) => commands[i].heading.slice(0, 2)), ['5a', '5b', '5c'], 'the three licence commands sit under 5a, 5b and 5c');
  // ...and `.local/licence.json` is the file the product reads, spelled the British way.
  const { licencePath } = await import(href('packages/snowarch/dist/licence/state.js'));
  const base = join(root, 'x');
  const rel = licencePath(base).slice(base.length + 1).replaceAll('\\', '/');
  assert.equal(rel, '.local/licence.json');
  assert.match(page, /spelled with a \*\*c\*\*, the British way/);
  // Both copies, Step 5 and the renewal, use the pattern and the product's name, and the renewal goes to the folder first.
  const puts = commands.map((c, i) => ({ ...c, i })).filter((c) => c.line.endsWith(rel));
  assert.ok(puts.length >= 2, 'the copy of 5c and the renewal\'s copy are not both there');
  for (const put of puts) assert.equal(put.line, 'cp ~/Downloads/LIC-*.json .local/licence.json', `${put.heading}: a licence is copied under its own name, which the reader would have to edit into the command`);
  assert.ok(puts[0].heading.startsWith('5c · ') && puts.at(-1).heading === 'Licence renewal', 'the copies belong to 5c and to the renewal');
  assert.equal(commands[puts.at(-1).i - 1].line, 'cd ~/AI-Arch', 'the renewal copies into .local of a folder it has not gone to');
  assert.match(page, /It must list exactly one file\./);
});

// ───────────────────────────── step 2d, the plan screen, the words on the screens ─────────────────────────────

test('ARC-09-C300 — step 2d is the line the installer prints when it finds Claude Code off PATH', () => {
  // ARC-09-C270: when `claude` is not on PATH and the native installer's file is there, B00 prints the fix for the platform, and the fix ends the line.
  // The page gives the reader the same command in the main steps, so the reader is not sent to a failure to meet it. On a Mac the fix is for zsh, with
  // the bash file named in its text, so the page has the line and its bash twin, once each.
  const fix = JSON.parse(read('tools/snowarch/lib/remedies.json')).claudeCode.offPath.darwin;
  const command = fix.slice(fix.indexOf('echo \''));
  assert.ok(command.startsWith('echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.zshrc && source ~/.zshrc'), `the product's fix no longer ends in the zsh line: ${fix}`);
  assert.ok(fix.includes('bash on macOS: ~/.bash_profile instead'), `the product's fix no longer says which file bash reads: ${fix}`);
  const found = commands.filter((c) => c.line === command);
  assert.equal(found.length, 1, 'the page does not give the command the installer prints, once');
  assert.ok(found[0].heading.startsWith('2d · '), 'the command the installer prints is the one of step 2d');
  assert.equal(commands.filter((c) => c.line === command.replaceAll('~/.zshrc', '~/.bash_profile')).length, 1, 'the page does not give the bash twin of the installer\'s command, once');
  assert.match(page, /The AI Architect's installer prints this same command if it ever finds Claude Code installed but its folder not on PATH\./);
});

test('ARC-09-C300 — the plan screen is the product\'s: its lines, its header, its keys, and the steps a licence in force adds', async () => {
  const { ORIENTATION, HEADER, ackLine, buildPlan, formatPlan, choicesLine, LINES } = await import(href('tools/snowarch/lib/plan.mjs'));
  for (const line of [...ORIENTATION, HEADER]) assert.ok(onScreens.includes(fold(line)), `the plan screen on the page lacks: ${line}`);
  // Type 1, Return; type 2, Return; Return. The acknowledgement after the second key is the product's sentence for it.
  assert.ok(onScreens.includes(fold(ackLine({ label: 'Mode', to: 'live', key: '1' }))), 'the screen after choosing live is not the product\'s');
  assert.match(page, /1\. Type `1` and press \*\*Return\*\*\./);
  assert.match(page, /2\. Type `2` and press \*\*Return\*\*\./);
  assert.match(page, /3\. Press \*\*Return\*\* once more\./);
  assert.match(page, /The installer's own screens say \*Enter\*\. On a Mac that is the \*\*Return\*\* key\./);

  // The whole screen, before the reader chooses live and after, with the Node.js release that the page installs: the product draws it.
  assert.ok(node, 'the page has no Node.js installer to take the version from');
  const ctx = { mode: 'design-only', docs: 'full', env: {}, node: { present: true, version: node }, root: join(root, 'no-such-folder'), areaCount: 0 };
  const plan = buildPlan({ ctx, state: null, flags: {} });
  const liveCtx = (licence) => ({ ...ctx, mode: 'live', licence });
  const screenOf = (licence) => formatPlan({ ...plan, mode: 'live' }, liveCtx(licence));
  for (const line of [...formatPlan(plan, ctx).split('\n'), ...screenOf({ state: 'ok' }).split('\n')]) {
    assert.ok(onScreens.includes(fold(line)), `the plan screen on the page lacks the product's line: ${line}`);
  }
  assert.ok(onScreens.includes(fold(choicesLine(LINES[1], plan))), 'the mode menu on the page is not the product\'s');
  assert.equal((onScreens.match(new RegExp(`Node ${node.replaceAll('.', '\\.')} found`, 'g')) ?? []).length, 2, `both plan screens say Node ${node} found, the version the page installs`);

  // B06 and B08 are the one visible sign of a licence: with a licence in force the live plan names them, and the page says exactly when it does not.
  for (const state of licenceStates()) {
    const steps = screenOf({ state }).split('\n').find((l) => l.trim().startsWith('Steps'));
    assert.equal(steps.includes('B06 instance') && steps.includes('B08 verify'), state === 'ok' || state === 'expiring', `a licence that is ${state}: the live plan names the wizard and the verify step or leaves them out, against what the page says`);
  }
  assert.match(page, /If the first word was not `ok` or `expiring` when you ran the installer, it left out the instance wizard \(6d\) and the verify step\./);
  assert.match(page, /Check that the \*Steps\* line names `B06 instance` and `B08 verify`\./);

  // The lines of the install that follow, `[B01/09] workspace … ok (4 s)`: each is a step of the product, with the product's title and count.
  const { STEPS, LAST } = await import(href('tools/snowarch/lib/steps/index.mjs'));
  const seen = [...onScreens.matchAll(/\[(B\d\d)\/(\d\d)\] (.+?) … /g)];
  assert.deepEqual([...new Set(seen.map((m) => m[1]))], STEPS.map((s) => s.id), 'the install lines on the page are not every step of the product, in order');
  for (const [, id, total, title] of seen) {
    assert.equal(STEPS.find((s) => s.id === id)?.title, title, `${id} is called "${title}" on the page`);
    assert.equal(`B${total}`, LAST, `the page counts the steps to ${total}, the product to ${LAST}`);
  }
});

/**
 * What the page says on a screen and the product must still say. One phrase per line of a screen that the product writes whole; the lines it assembles
 * from parts (a step number, a count, a path) are matched by their fixed part. Each must be on the page AND in the product's source, so changing either
 * side without the other fails here. It is the Windows twin's list, without the line about a lock that failed (Windows only), and with the lines a Mac
 * reader meets that a Windows reader does not.
 */
const SCREEN_PHRASES = [
  // The wizard's frame and its seven steps.
  'Instance wizard — seven steps (six questions and a login check).',
  'Have ready: the instance URL and a username + password for it. Nothing is saved until the end.',
  'a short name you will type in commands, e.g. pdi, acme-dev',
  'Instance URL (https://<host>, no path)',
  'What is this instance?',
  'your personal developer instance (devNNNNNN.service-now.com)',
  'a shared development instance',
  'a test / UAT instance',
  'real users; the wizard saves it read-only',
  'Authentication?',
  'username + password (recommended for PDI; no instance-side setup)',
  'OAuth password grant (legacy; needs client id + secret AND a user password;',
  'Username (a ServiceNow user on this instance — admin on a PDI)',
  'Password (nothing is shown while you type):',
  'Checking the login and what this account may do (read-only, a few seconds)',
  // The product writes the label and the environment as values: the page shows an example, the product its template.
  ['Permissions for instance "pdi" (environment pdi) — what Claude\'s tools may do there.',
    'Permissions for instance "${label}" (environment ${environment}) — what Claude\'s tools may do there.'],
  'Enter = apply as shown · a number opens that flag · "preset <name>" switches · "?" explains',
  // The FLUENT line on a Mac without the SDK: the probe's words, the recommendation after them, and the command on its own line below.
  'ServiceNow SDK not installed',
  'recommend: off',
  'npm i -g @servicenow/sdk',
  // The plan screen's menus.
  'works from the ServiceNow docs and the specialist skills; no instance',
  'also connects one ServiceNow instance (the wizard asks for URL and login)',
  'live needs a ServiceNow instance (wizard runs in this terminal)',
  'full = whole corpus · skip = none (the doctor will report FAIL)',
  // What the URL question and the first answer of a question do, which the page explains in prose.
  're-enter the URL',
  'abort (nothing is saved)',
  'reachability: FAIL',
  'trailing slash removed',
  'Enter picks this',
  // The end of the install.
  'Health check (quick):',
  'more run with',
  'Next: run',
  // The sample of `licence check` in Step 7: the two lines that are not the banner. And the question `upgrade` asks before it changes anything.
  'revocation list: none held',
  'nothing is refused while the licence is in force',
  'Proceed? [Y/n]',
];

/** Lines the page quotes that are written in the launchers and the renderer, outside the folders the walk reads: [the file, the words]. */
const OUTSIDE = [
  // With no Node.js on PATH, bootstrap.sh says so on the plan line of its own, and reads one answer: the page warns the reader off typing `1` there.
  ['bootstrap.sh', 'Plan: Mode design-only (fixed — Node.js 20+ not found)'],
  ['bootstrap.sh', 'Enter = run · s = docs skip · q = quit'],
  ['bootstrap.sh', 'note: Node.js not found'],
  ['snowarch', 'snowarch: Node.js 20+ is required and was not found on PATH.'],
  ['scripts/render-drawio.sh', 'ERROR: draw.io Desktop not found'],
];

test('ARC-09-C300 — the words on the screens are the product\'s, in both directions', () => {
  const product = productText();
  const onPage = fold(page);
  for (const entry of SCREEN_PHRASES) {
    const [shown, written] = Array.isArray(entry) ? entry : [entry, entry];
    assert.ok(onPage.includes(fold(shown)), `the page lacks: ${shown}`);
    assert.ok(product.includes(fold(written)), `the product no longer says (the page still does): ${written}`);
  }
  for (const [file, words] of OUTSIDE) {
    assert.ok(onPage.includes(fold(words)), `the page lacks: ${words}`);
    assert.ok(fold(read(file)).includes(fold(words)), `${file} no longer says (the page still does): ${words}`);
  }
});

test('ARC-09-C300 — question 1 states the product\'s label rule, and the labels the page uses obey it', async () => {
  const { LABEL_RULE } = await import(href('packages/snowarch/dist/cli/instance.js'));
  // The rule, in the words of the page: up to 32 characters, lower-case letters, digits, `-` or `_`, the first a letter.
  assert.ok(LABEL_RULE.test('a'.repeat(32)) && !LABEL_RULE.test('a'.repeat(33)), 'the product\'s label is no longer up to 32 characters');
  assert.ok(LABEL_RULE.test('a-b_c9'), 'the product no longer takes lower-case letters, digits, - and _');
  for (const bad of ['Acme', '9a', '_a', '-a', 'a b', '']) assert.equal(LABEL_RULE.test(bad), false, `the product takes the label "${bad}", which the page's rule excludes`);
  assert.ok(page.includes('a short name of up to 32 lower-case letters, digits, `-` or `_`, starting with a letter'), 'question 1 does not state the product\'s rule in full');
  for (const label of ['pdi', 'acme-dev']) assert.ok(LABEL_RULE.test(label), `the page's example label ${label} is refused by the wizard`);
});

test('ARC-09-C300 — the store line of question 7 is the one `storeLine` builds for a Mac, and the doctor has the check and the repair the page names', async () => {
  // On a Mac the wizard says who can read the store from the modes it sets, and `storeLine` builds that sentence. The screen of question 7 quotes it,
  // so the page is asked of the function and not of a copy of its words. The store is the checkout's own (`.local/instances.json` in the folder the
  // install runs in), which is where this guide puts it. `{}` is the environment: the first line of the sentence does not depend on the shell.
  const { storeLine, savedLine } = await import(href('packages/snowarch/dist/cli/instance.js'));
  const store = '/Users/you/AI-Arch/.local/instances.json';
  const line = storeLine(store, 'darwin', store, undefined, {});
  assert.equal(line, 'Saved to .local/instances.json in this folder — readable only by you (0600).');
  assert.ok(onScreens.includes(fold(line)), `the screen of question 7 on the page lacks the product's line: ${line}`);
  const saved = savedLine('pdi', { environment: 'pdi', auth: { method: 'basic' }, preset: 'custom' }, true);
  assert.ok(onScreens.includes(fold(saved)), `the screen of question 7 on the page lacks the product's line: ${saved}`);
  // The modes the sentence says: the file 0600 and the folder 0700, which the product sets and the page repeats.
  assert.match(page, /readable only by your account \(file mode 0600, folder mode 0700\)/);
  assert.match(read('packages/snowarch/src/store/index.ts'), /chmodSync\(path, 0o600\)/);
  assert.match(read('tools/snowarch/lib/steps/B01.mjs'), /chmodSync\(dir, 0o700\)/);
  // ...and the doctor has what the page names: SV-02 reads the store's modes, `--fix` is its flag, F5 is the repair that restores the folder's mode.
  const doctorLines = [...page.matchAll(/`(\S+) doctor` checks it \(check SV-02\); `(\S+) doctor --fix` repairs it after showing what it will change\./g)];
  assert.equal(doctorLines.length, 1, 'the page lost the sentence that names the check and the repair');
  assert.deepEqual([doctorLines[0][1], doctorLines[0][2]], [cli, cli], 'the page spells the launcher in the doctor sentence differently from the product');
  assert.match(read('packages/snowarch/src/doctor/checks.ts'), /id: 'SV-02',\s*title: 'store'/);
  assert.match(read('packages/snowarch/src/doctor/checks.ts'), /fix = \{ kind: 'store-mode', path: res\.path, to: '600' \}/);
  const { COMMANDS } = await import(href('tools/snowarch/lib/cli.mjs'));
  assert.match(String(COMMANDS.doctor.usage({})), /\[--fix\]/);
  assert.match(read('tools/snowarch/lib/doctor/fix.mjs'), /id: 'F5', kind: 'store-mode'/);
});

test('ARC-09-C300 — question 7 is the screen the product draws for a PDI on a Mac without the SDK, and the question FLUENT then asks', async () => {
  // The Windows twin holds nine phrases of this screen to the product's source text, which also holds the comments that mention them. The screen is a pure
  // function of its input, so the Mac page is asked of the function: every line, in order, with the probe words the product gives a missing SDK.
  const { renderReviewScreen, flagQuestion } = await import(href('packages/snowarch/dist/cli/preset-ui.js'));
  const { PRESETS } = await import(href('packages/snowarch/dist/utils/permissions.js'));
  const probes = { auth: 'ok', write: 'ok', cmdb: 'ok', scripting: 'ok', atf: 'ok', nowAssist: 'ok', fluent: 'not installed' };
  const screen = renderReviewScreen({ cli, label: 'pdi', environment: 'pdi', preset: 'full', flags: { ...PRESETS.full }, probes });
  assert.ok(onScreens.includes(fold(`[7/7] Permissions ${screen}`)), `the screen of question 7 on the page is not the one the product draws:\n${screen}`);
  // Type 6, and the product asks about FLUENT in the words the page quotes in its list of keys.
  const ask = flagQuestion('FLUENT_ENABLED', { ...PRESETS.full }, 'not installed');
  assert.ok(fold(prose).includes(fold(`\`${ask}\``)), `the question that FLUENT asks is not the one the page quotes: ${ask}`);
});

test('ARC-09-C300 — the permissions and the presets the page explains are the product\'s', async () => {
  const { FLAG_NAMES, PRESETS, DEPENDENCIES } = await import(href('packages/snowarch/dist/utils/permissions.js'));
  const { proposePreset, labelOf } = await import(href('packages/snowarch/dist/cli/preset-ui.js'));
  const names = FLAG_NAMES.map(labelOf);
  const permissions = [...page.matchAll(/^\| (WRITE|CMDB_WRITE|SCRIPTING|ATF|NOW_ASSIST|FLUENT) \| (.*) \|$/gm)];
  assert.deepEqual(permissions.map((m) => m[1]), names, 'the table of permissions is not the product\'s six, in its order');
  // "Needs WRITE." is said of exactly the permissions the product cannot switch on without WRITE.
  for (const [, name, what] of permissions) {
    assert.equal(/\bNeeds WRITE\./.test(what), DEPENDENCIES[`${name}_ENABLED`].includes('WRITE_ENABLED'), `${name}: the page and the product disagree on whether it needs WRITE`);
  }
  const preset = (name) => new RegExp(`^\\| ${name} \\| (.*?) \\| (.*) \\|$`, 'm').exec(page);
  const on = (name) => names.filter((n) => PRESETS[name][`${n}_ENABLED`] === 'true');
  assert.deepEqual(on('full'), names);
  assert.equal(preset('full')?.[1], 'Everything');
  assert.deepEqual(on('read-only'), []);
  assert.equal(preset('read-only')?.[1], 'Nothing');
  assert.equal(preset('pdi-developer')?.[1], `Everything except ${names.filter((n) => !on('pdi-developer').includes(n)).join(' and ')}`);
  assert.ok(preset('custom'), 'the page no longer explains the custom preset');
  // The wizard proposes `full` for a development instance and `read-only` for production, which is where the page says each is for.
  for (const environment of ['pdi', 'dev', 'test']) assert.equal(proposePreset(environment), 'full');
  assert.equal(proposePreset('prod'), 'read-only');
  assert.match(preset('full')[2], /^Proposed for pdi, dev and test instances\.$/);
  assert.match(preset('read-only')[2], /The only choice for a prod instance\./);
});

// ───────────────────────────── the commands of the product ─────────────────────────────

test('ARC-09-C300 — the settings commands are the product\'s: each sub-command, with the arguments it takes', async () => {
  const { SUB_COMMANDS } = await import(href('packages/snowarch/dist/cli/help-tables.js'));
  const seen = new Set();
  const instanceLines = commands.filter((c) => c.line.startsWith(`${cli} instance `));
  for (const { line } of instanceLines) {
    const words = line.split(/\s+/).slice(2);          // after `./snowarch instance`
    const [sub, ...rest] = words;
    seen.add(sub);
    assert.ok(sub in SUB_COMMANDS, `the page uses "instance ${sub}", which the product does not have: ${line}`);
    const { positionals } = SUB_COMMANDS[sub];
    const flags = rest.filter((w) => /^[A-Z_]+=(on|off)$/.test(w));
    const plain = rest.filter((w) => !flags.includes(w));
    if (positionals >= 0) assert.equal(plain.length, positionals, `"instance ${sub}" takes ${positionals} argument(s): ${line}`);
    else assert.ok(plain.length === 1 && flags.length >= 1, `"instance ${sub}" takes a label and FLAG=on|off pairs: ${line}`);
  }
  for (const sub of ['set-credentials', 'set-preset', 'set-flags', 'test', 'list', 'remove']) assert.ok(seen.has(sub), `the page no longer shows instance ${sub}`);
  // `instance remove` asks before it deletes, and the question ends in [y/N]: the default is no, as the page says.
  const { removeQuestion } = await import(href('packages/snowarch/dist/cli/instance.js'));
  const question = removeQuestion('pdi', join(root, '.local', 'instances.json'));
  assert.ok(question.trimEnd().endsWith('[y/N]') && question.includes('its stored credentials'), `the question of "instance remove" is not the one the page describes: ${question}`);
  assert.match(page, /the question ends in `\[y\/N\]`, so the default is no/);
  // The permission names the page uses are the six the wizard lists.
  for (const flag of ['WRITE', 'CMDB_WRITE', 'SCRIPTING', 'ATF', 'NOW_ASSIST', 'FLUENT']) assert.match(page, new RegExp(`\\| ${flag} \\|`));
});

test('ARC-09-C300 — the other commands exist: mode, doctor, licence check, upgrade, version', async () => {
  const wanted = ['mode design', 'mode live', 'doctor', 'licence check', 'upgrade --check', 'upgrade', 'version'].map((rest) => `${cli} ${rest}`);
  for (const expected of wanted) assert.ok(lines.includes(expected), `the page lacks: ${expected}`);
  // Every `./snowarch <verb>` on the page is a verb of the CLI's own table.
  const { COMMANDS } = await import(href('tools/snowarch/lib/cli.mjs'));
  const used = new Set(commands.filter((c) => c.line.startsWith(`${cli} `)).map((c) => c.line.split(/\s+/)[1]));
  for (const verb of used) assert.ok(verb in COMMANDS, `the page uses "${verb}", which the CLI does not have`);
  for (const verb of ['version', 'mode', 'doctor', 'instance', 'upgrade', 'licence']) assert.ok(used.has(verb), `the page no longer uses ${verb}`);
  // The arguments: `upgrade --check` is upgrade's own flag; `mode live|design` are mode's; `licence check` is a licence sub-command.
  assert.match(String(COMMANDS.upgrade.usage({})), /--check/);
  assert.match(String(COMMANDS.mode.usage({})), /\[live\|design\]/);
  assert.match(read('tools/snowarch/lib/commands/licence.mjs'), /check/);
  // The licence states the page explains are the product's, no more and no fewer: the table under Step 7 has one row for each.
  const states = licenceStates();
  const rows = [...page.matchAll(/^\| (ok|expiring|expired|missing|invalid|revoked) \| /gm)].map((m) => m[1]);
  assert.deepEqual([...rows].sort(), [...states].sort(), 'the licence table on the page and the product\'s states disagree');
});

test('ARC-09-C300 — Step 7 shows the licence line the product prints, and says what a licence that has ended still allows', async () => {
  const { bannerLine, allowedPhrase } = await import(href('tools/snowarch/lib/licence/state.mjs'));
  const { EXPIRING_DAYS } = await import(href('packages/snowarch/dist/licence/core.js'));
  // The first line of the sample, under Step 7 and again in the answer of Step 8: the product's banner for a live licence, and its word for a design-only one.
  const live = { state: 'ok', id: 'LIC-2026-0000', validUntil: '2026-12-31', scope: 'live' };
  assert.equal(onScreens.split(bannerLine(live)).length - 1, 2, `the page does not show "${bannerLine(live)}" in Step 7 and in Step 8`);
  assert.equal(bannerLine({ ...live, scope: 'design-only' }), 'Licence: ok · LIC-2026-0000 · design-only · until 2026-12-31');
  assert.match(page, /If the first line also says `design-only`, your licence covers design-only mode/);
  // The sample has more days left than an expiring licence can have, which is why the page says its health check shows no warning.
  const days = Number(/\(UTC, (\d+) days\)/.exec(onScreens)?.[1]);
  assert.ok(days > EXPIRING_DAYS, `the sample has ${days} days left, which is not more than the ${EXPIRING_DAYS} after which the product calls a licence expiring`);
  assert.match(page, /This example licence has \d+ days left, so it says `ok`/);
  // What still works after the end date is the product's list, in the product's order.
  const items = allowedPhrase().replace(' and ', ', ').split(', ').map((word) => `\`${word}\``);
  assert.ok(prose.includes(`${items.slice(0, -1).join(', ')} and ${items.at(-1)}.`), `the page does not list the commands a licence that has ended allows, as the product does: ${allowedPhrase()}`);
});

// ───────────────────────────── the versions, and what CI runs ─────────────────────────────

/**
 * The macOS that a Node.js release itself needs, from the BUILDING.md of that release's tag: "macOS >= 13.5" for x64 and for arm64 on Node.js 26.13.1.
 * The product does not hold it, so the page is held to this figure, and a new Node.js version has to be looked up here before its page is right
 * (Claude Code's own floor, 13.0, is the lower of the two, so the page states the higher).
 */
const MACOS_FLOOR_OF_NODE = { '26.13.1': '13.5' };
/** The size of the draw.io image, in whole megabytes: draw.io-universal-32.7.4.dmg is 260,790,513 bytes (the release's asset list, 2026-11-17). */
const MEASURED_MB = { '32.7.4': 260 };

test('ARC-09-C300 — what a reader is told about Node.js on the page, the README and the install page is one sentence', () => {
  const row = /\| Node\.js \| ([^|]*) \|/.exec(page);
  assert.ok(row, 'the version table has no Node.js row');
  assert.match(row[1], /^v20\. Step 2b installs v\d+\.\d+\.\d+\. The AI Architect is tested with Node\.js 20, 22, 24 and 26 on Windows, macOS and Linux\.$/);
  // ...and the README and the install page say the same, in the same words.
  for (const rel of ['README.md', 'docs/INSTALL.md']) {
    assert.match(read(rel), /Node\.js ≥ \*\*20\*\* \(22 LTS recommended; 20, 22, 24 and 26 tested on Linux, macOS and Windows\)/, rel);
  }
});

test('ARC-09-C300 — the sentence about Node.js 26 on a Mac is what CI runs', () => {
  const ci = JSON.parse(read('tests/fixtures/required-contexts.json')).contexts;
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    for (const v of [20, 22, 24, 26]) assert.ok(ci.includes(`test (${os}, node ${v})`), `the page says Node.js ${v} is tested on every system, and CI has no cell "test (${os}, node ${v})"`);
  }
});

test('ARC-09-C300 — each program the page downloads is one version: in the downloads, on the check screens and in the closing paragraph', () => {
  const one = (re, what) => {
    const found = commands.filter((c) => re.test(c.line));
    assert.equal(found.length, 1, `${what}: expected one command, found ${found.length}`);
    return found[0];
  };
  // Node.js: the installer for path A, and the archive of each chip for path B, all three of one release, the folder named for the file.
  const downloads = commands.filter((c) => /nodejs\.org\/dist\//.test(c.line));
  assert.equal(downloads.length, 3, 'the page has one installer and two archives of Node.js, and no other download from nodejs.org');
  const versions = new Set();
  for (const [what, re, label] of [
    ['the installer', NODE_PKG, null],
    ['the Apple silicon archive', /^curl -fL -o ~\/snowarch-dl\/node\.tar\.gz https:\/\/nodejs\.org\/dist\/v(\d+\.\d+\.\d+)\/node-v(\d+\.\d+\.\d+)-darwin-arm64\.tar\.gz$/, '**Apple silicon**'],
    ['the Intel archive', /^curl -fL -o ~\/snowarch-dl\/node\.tar\.gz https:\/\/nodejs\.org\/dist\/v(\d+\.\d+\.\d+)\/node-v(\d+\.\d+\.\d+)-darwin-x64\.tar\.gz$/, '**Intel**'],
  ]) {
    const command = one(re, what);
    const m = re.exec(command.line);
    assert.equal(m[1], m[2], `${what}: the folder and the file name are different versions: ${command.line}`);
    versions.add(m[1]);
    // A reader with the other chip runs the other file and meets `bad CPU type in executable`: the chip's label is the whole protection.
    if (label) assert.ok(command.label.startsWith(label), `${what} is not under the label ${label}: ${command.label}`);
    assert.ok(command.heading.startsWith(label ? 'Path B' : 'Path A'), `${what} is under the wrong path: ${command.heading}`);
  }
  assert.equal(versions.size, 1, `the Node.js downloads are not one release: ${[...versions].join(', ')}`);
  assert.equal([...versions][0], node);
  assert.ok(screens.some((b) => b.lines.includes(`v${node}`)), `the check in 2e does not show v${node}`);
  assert.ok(screens.some((b) => b.lines.some((l) => l.startsWith(`ok B00 node: ${node} · npm `))), `the checks of 6a do not show Node.js ${node}`);
  assert.ok(closing.includes(`Node.js ${node},`), `the closing paragraph does not name Node.js ${node}`);
  // The archive goes into the folder 2b puts on PATH, and the installer's file is the one that `open` opens.
  assert.ok(lines.includes('tar -xzf ~/snowarch-dl/node.tar.gz -C ~/.local/node --strip-components=1'), 'the archive is not unpacked into ~/.local/node');
  assert.ok(lines.includes('mkdir -p ~/.local/node'), 'the folder the archive goes into is not made');
  assert.ok(lines.indexOf('mkdir -p ~/snowarch-dl') >= 0 && lines.indexOf('mkdir -p ~/snowarch-dl') < at((c) => /^curl -fL -o ~\/snowarch-dl\//.test(c.line)), 'the download folder is made after the first download');
  assert.ok(lines.includes('cd ~/snowarch-dl'), 'Step 3 does not start in the download folder');
  // The macOS the release needs: the page states it everywhere it states a floor, and the product holds only Claude Code's.
  assert.ok(node in MACOS_FLOOR_OF_NODE, `read BUILDING.md of Node.js ${node} for the macOS it needs and add it to MACOS_FLOOR_OF_NODE`);
  const floor = MACOS_FLOOR_OF_NODE[node];
  const major = node.split('.')[0];
  assert.ok(page.split('\n')[2].startsWith(`AI ServiceNow Architect · macOS ${floor} or later `), 'the title line does not state the macOS floor');
  const need = page.split('\n').find((l) => l.startsWith('- A Mac with '));
  assert.ok(need.includes(`**macOS ${floor} or later**`) && need.includes(`Claude Code needs 13.0, Node.js ${major} needs ${floor}`), `"What you need" does not state the floor, and whose it is: ${need}`);
  assert.ok(prose.includes(`this guide needs ${floor} or later`), 'the dyld row does not name the floor');
  assert.ok(prose.includes(`macOS ${floor} to 15`), 'the list of what has not been tested does not start at the floor');
  for (const m of prose.matchAll(/macOS (\d+(?:\.\d+)?) or later/g)) assert.ok([floor, '10.15'].includes(m[1]), `the page states a macOS floor of ${m[1]}: only ${floor} and the zsh default of 10.15 belong to it`);

  // draw.io: one image for both paths and both chips, one version in the URL and the file, the size measured on that file, one folder it is saved to.
  const dl = one(/jgraph\/drawio-desktop\/releases\/download\//, 'the draw.io download');
  const d = /^curl -fL -o (~\/snowarch-dl\/drawio\.dmg) https:\/\/github\.com\/jgraph\/drawio-desktop\/releases\/download\/v(\d+\.\d+\.\d+)\/draw\.io-universal-(\d+\.\d+\.\d+)\.dmg$/.exec(dl.line);
  assert.ok(d && d[2] === d[3], `the draw.io download is not one versioned universal image: ${dl.line}`);
  assert.ok(dl.heading.startsWith('2f · '), 'the draw.io download is not shared by the two paths: it is under a Path heading');
  assert.doesNotMatch(page, /draw\.io-(?:arm64|x64)-|-windows\.zip/, 'the page names a draw.io image other than the universal one');
  assert.deepEqual(commands.filter((c) => c.line === `open ${d[1]}`).map((c) => c.heading.slice(0, 6)), ['Path A', 'Path B'], 'each path opens the image the download saves');
  assert.ok(closing.includes(`draw.io ${d[2]},`), `the closing paragraph does not name draw.io ${d[2]}`);
  assert.ok(d[2] in MEASURED_MB, `measure draw.io-universal-${d[2]}.dmg (the release's asset list) and add its size to MEASURED_MB`);
  assert.match(page, new RegExp(`It is about ${MEASURED_MB[d[2]]} MB\\.`));
});

test('ARC-09-C300 — the page ends as long as no Mac has run it: "Not yet tested end to end on a Mac."', () => {
  // The Windows page ends with a record of the run it was written from (the version of each program, the machine, the release). This one has none to
  // give. When the Mac run is made the closing line becomes that record, and the Windows twin's record check (each version in the download is the
  // version in the record) takes the place of this case.
  assert.ok(closing.startsWith('Not yet tested end to end on a Mac. '), `the closing line is not the statement that no Mac has run the page: ${closing}`);
  assert.ok(page.split('\n')[2].includes('not yet tested end to end on a Mac (see "What has not been tested")'), 'the title line no longer says that no Mac has run the page');
  assert.doesNotMatch(page, /^Tested end to end on /m, 'a record of a run is on the page: the closing line and this case change together');
  assert.ok(titles.includes('What has not been tested'));
});

test('ARC-09-C300 — the page is linked from where a Mac reader starts, and carries a release tag the release writes', () => {
  assert.match(read('README.md'), /\]\(docs\/INSTALL-MACOS\.md\)/);
  assert.match(read('docs/INSTALL.md'), /\]\(INSTALL-MACOS\.md\)/);
  // One clone command, pinned to a release; the release's writer owns the tag (scripts/lib/release/writers.mjs).
  const clones = commands.filter((c) => /^git -c advice\.detachedHead=false clone --branch v\d+\.\d+\.\d+ https:\/\/github\.com\/farstic\/snowarch\.git AI-Arch$/.test(c.line));
  assert.equal(clones.length, 1);
  // The folder the clone makes is the folder every later command goes to.
  assert.ok(lines.includes('cd AI-Arch') && lines.filter((l) => l === 'cd ~/AI-Arch').length >= 2, 'the folder of the clone is not the folder the page goes back to');
  // No other release number is written on the page by hand outside the examples the page says are examples.
  assert.match(page, /The screens in this guide are examples\./);
});

// ───────────────────────────── draw.io and the Word converter: the renderer's side ─────────────────────────────

test('ARC-09-C300 — draw.io is where the renderer looks, and path B has the command the renderer needs until it looks in the home folder', async () => {
  const sh = read('scripts/render-drawio.sh');
  const { DRAWIO_CANDIDATES, drawioCandidates } = await import(href('tools/snowarch/lib/doctor/checks/engine-prereqs.mjs'));
  const checks = commands.filter((c) => /^ls \S*Applications\/draw\.io\.app\//.test(c.line));
  assert.equal(checks.length, 2, 'the page checks draw.io once on each path');
  const [a, b] = ['Path A', 'Path B'].map((p) => checks.find((c) => c.heading.startsWith(p)));
  assert.ok(a && b, 'each path has its own check of draw.io');
  // Path A: the check path is the first place the renderer looks on a Mac, and the doctor's list starts there too.
  const pathA = a.line.slice('ls '.length);
  assert.equal(/^\s+mac\)\s*\n\s+pick "([^"]+)"/m.exec(sh)?.[1], pathA, 'the renderer\'s first place for draw.io on a Mac is not the path the page checks');
  assert.equal(DRAWIO_CANDIDATES.posix[0], pathA, 'the doctor\'s first place for draw.io on a Mac is not the path the page checks');
  // Path B: the home folder's Applications. Until the renderer looks there by itself, the page makes the command it finds on PATH.
  const pathB = b.line.slice('ls '.length);
  assert.equal(pathB, '~/Applications/draw.io.app/Contents/MacOS/draw.io');
  const code = sh.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  const looksInHome = /\$\{?HOME\}?\/Applications\//.test(code);
  const wrappers = commands.filter((c) => c.line.includes('> ~/.local/bin/drawio'));
  if (!looksInHome) {
    assert.equal(wrappers.length, 1, 'the renderer does not look in ~/Applications, and the page does not make the command that starts draw.io from there');
    assert.equal(wrappers[0].line, `printf '#!/bin/sh\\nexec "${pathB.replace('~', '$HOME')}" "$@"\\n' > ~/.local/bin/drawio && chmod +x ~/.local/bin/drawio`, 'the command of path B does not start the app that the check finds');
    assert.ok(wrappers[0].heading.startsWith('Path B'), 'the drawio command is made under path B');
    // It goes into the folder 2d puts on PATH (the product's own line for Claude Code, which the 2d case holds the page to), under a name the renderer
    // looks for on PATH, in the first of its names.
    const offPath = JSON.parse(read('tools/snowarch/lib/remedies.json')).claudeCode.offPath.darwin;
    assert.ok(offPath.includes('export PATH="$HOME/.local/bin:$PATH"'), 'the product no longer puts ~/.local/bin on PATH when it finds Claude Code off it');
    assert.match(sh, /for n in drawio draw\.io draw\.io\.exe; do/, 'the renderer no longer looks for a command called drawio on PATH');
    assert.ok(prose.includes('which makes the `drawio` command'), 'the troubleshooting row does not send path B to the command that makes `drawio`');
  } else {
    // The renderer looks in ~/Applications itself (and the doctor's list must follow): the command and its paragraph go, and the page says so as Windows 2f does.
    assert.equal(wrappers.length, 0, 'the renderer looks in ~/Applications now: the drawio command and its paragraph go from path B');
    assert.doesNotMatch(prose, /`drawio` command|command named `drawio`/, 'a paragraph still tells path B to make a drawio command');
    assert.ok(prose.includes('looks for draw.io in that folder by itself'), 'path B does not say that the AI Architect finds draw.io in your own Applications folder by itself');
    assert.ok(drawioCandidates({ platform: 'darwin', env: { HOME: '/Users/you' } }).includes('/Users/you/Applications/draw.io.app/Contents/MacOS/draw.io'),
      'the doctor does not look in ~/Applications although the renderer does');
  }
  assert.ok(prose.includes('The AI Architect looks for draw.io there by itself, so there is no PATH command to run.'), 'path A no longer says that there is nothing more to do once draw.io is in Applications');
});

test('ARC-09-C300 — the Word converter on a Mac is python3, and the doctor says so in the words the page quotes', async (t) => {
  assert.equal(read('scripts/md-to-docx.py').split('\n')[0], '#!/usr/bin/env python3');
  assert.match(read('scripts/README.md'), /python3 scripts\/md-to-docx\.py/);
  assert.ok(lines.includes('python3 --version'), 'the page no longer lets the reader check python3');
  assert.ok(prose.includes('On a Mac the AI Architect makes its Word documents with python3.'));
  // E-04 finds the converter by looking for a command called python3 on PATH; a folder holding an executable of that name is a Mac that has it.
  const dir = tempDir('install-macos-guide-', t);
  writeFileSync(join(dir, 'python3'), '#!/bin/sh\n', { mode: 0o755 });
  const { capabilityPacks } = await import(href('tools/snowarch/lib/doctor/checks/engine-prereqs.mjs'));
  const { capabilitiesLine } = await import(href('tools/snowarch/lib/doctor/panel.mjs'));
  const packs = capabilityPacks({ env: { PATH: dir }, platform: 'darwin', exists: () => false });
  assert.equal(packs.docx.need, 'python3');
  const shown = capabilitiesLine(Object.fromEntries(Object.entries(packs).map(([name, p]) => [name, { present: Boolean(p.how), how: p.how }])));
  assert.ok(shown.includes('docx yes (python3)'), `the doctor does not say "docx yes (python3)" for a Mac with python3: ${shown}`);
  assert.ok(prose.includes('`docx yes (python3)`'), 'the page does not quote the doctor\'s words');
});

test('ARC-09-C300 — the optional SDK is the package the product tells a reader to install, and the command it runs', () => {
  const install = lines.filter((l) => l.startsWith('npm install -g '));
  assert.deepEqual(install, ['npm install -g @servicenow/sdk']);
  // The server runs `now-sdk` and, when it is missing, says to `npm i -g` the same package: the page installs it and checks it by the same two names.
  assert.ok(read('packages/snowarch/src/tools/fluent.ts').includes('now-sdk not found. Install with: npm i -g @servicenow/sdk'), 'the server no longer names the package and the command of the SDK');
  assert.ok(lines.includes('now-sdk --version'), 'the page does not check the SDK by its command');
  const setFlags = lines.filter((l) => l.startsWith(`${cli} instance set-flags pdi FLUENT=on`));
  assert.equal(setFlags.length, 1, 'the page does not switch the FLUENT permission on once the SDK is there');
});

// ───────────────────────────── written for a Mac ─────────────────────────────

test('ARC-09-C300 — the page is written for a Mac: no Windows text in it, and Windows named only where it says why', () => {
  assert.doesNotMatch(page, /PowerShell|\bwinget\b|\.cmd\b|\.exe\b|\.ps1\b|Ctrl\+|%[A-Z]+%|\b[A-Z]:\\|\*\*Enter\*\*|\bBackspace\b|\bAlt\+/, 'the page carries a word that belongs to the Windows guide');
  // The four places Windows is named on purpose: where the reader is told why one command at a time, which systems CI tests, where a measurement came from.
  let rest = fold(page);
  for (const phrase of ['In our own test on Windows a pasted block of three lines arrived broken', 'tested with Node.js 20, 22, 24 and 26 on Windows, macOS and Linux',
    'in our Windows test it took two and a half minutes', 'come from the code and from our Windows test']) {
    assert.ok(rest.includes(phrase), `the page no longer says: ${phrase}`);
    rest = rest.replace(phrase, '');
  }
  assert.doesNotMatch(rest, /\bWindows\b/, 'the page names Windows where this case does not know why');
  // Keys are named as a Mac names them.
  assert.match(page, /\*\*Command\+C\*\*/);
  assert.match(page, /\*\*Control\+C\*\*/);
});

// ───────────────────────────── the commands, run ─────────────────────────────

/** Bash is on every runner that has a Mac or a Linux in it. Nothing below runs on Windows, where a Mac's commands have no meaning. */
const BASH = { skip: process.platform === 'win32' ? 'a Mac\'s commands are run where there is a bash' : false };

/** Run `command` under bash, with `home` as the home folder and `cwd` as the folder, and return what it did. */
const bash = (command, { home, cwd = home }) => spawnSync('bash', ['-c', command], {
  cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, LANG: 'C' },
});

test('ARC-09-C300 — the PATH lines write the line they say, and a window that reads it has the folder first', BASH, (t) => {
  const changes = commands.filter((c) => c.line.includes('>>'));
  assert.ok(changes.length >= 4);
  for (const { line, heading } of changes) {
    const home = tempDir('install-macos-guide-', t);
    const [, folder, file] = PATH_LINE.exec(line);
    const r = bash(line, { home });
    assert.equal(r.status, 0, `${heading}: ${line} failed: ${r.stderr}`);
    assert.equal(r.stdout + r.stderr, '', `${heading}: the page says the command normally prints nothing: ${r.stdout}${r.stderr}`);
    assert.equal(readFileSync(join(home, `.${file}`), 'utf8'), `export PATH="$HOME/${folder}:$PATH"\n`, `${heading}: the file holds something other than the one PATH line`);
    // A window of the shell that reads the file: the user's folder comes first, and what was on PATH before is still there.
    const next = spawnSync('bash', ['-c', `. "$HOME/.${file}" && printf %s "$PATH"`], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home } });
    assert.equal(next.stdout, `${home}/${folder}:/usr/bin:/bin`, `${heading}: a window that reads the file does not have the folder first`);
  }
});

test('ARC-09-C300 — the licence copy does what the page says: one file is copied under the product\'s name, two are refused', BASH, (t) => {
  const home = tempDir('install-macos-guide-', t);
  const folder = join(home, 'AI-Arch');
  mkdirSync(folder, { recursive: true });
  mkdirSync(join(home, 'Downloads'));
  writeFileSync(join(home, 'Downloads', 'LIC-2026-0000.json'), '{"licence":"placeholder"}\n');
  const mkdir = lines.find((l) => l === 'mkdir -p .local');
  const list = lines.find((l) => l.startsWith('ls ~/Downloads/'));
  const copy = lines.find((l) => l.startsWith('cp ~/Downloads/'));
  const first = bash(`${mkdir} && ${list} && ${copy}`, { home, cwd: folder });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Downloads\/LIC-2026-0000\.json\n$/, '5b lists the one file it finds');
  assert.equal(readFileSync(join(folder, '.local', 'licence.json'), 'utf8'), '{"licence":"placeholder"}\n', 'the copy is not the file in Downloads');
  // A browser that saves a renewal beside the old file names it `LIC-… (1).json`: the pattern then matches two, and the copy must say so rather than choose.
  writeFileSync(join(home, 'Downloads', 'LIC-2026-0000 (1).json'), '{"licence":"renewal"}\n');
  const second = bash(copy, { home, cwd: folder });
  assert.notEqual(second.status, 0, 'the copy of two files did not fail: the page tells the reader that an error means more than one file');
  assert.equal(readFileSync(join(folder, '.local', 'licence.json'), 'utf8'), '{"licence":"placeholder"}\n', 'a refused copy changed the licence in place');
});

test('ARC-09-C300 — the drawio command of path B is a working one: the page makes it, the doctor finds it, and it starts the app the page installs', BASH, async (t) => {
  const command = commands.find((c) => c.line.includes('> ~/.local/bin/drawio'))?.line;
  if (!command) return;                                  // the renderer looks in ~/Applications itself, and the command has gone from the page
  const home = tempDir('install-macos-guide-', t);
  mkdirSync(join(home, '.local', 'bin'), { recursive: true });      // Claude Code's installer makes this folder; 2d puts it on PATH
  const app = join(home, 'Applications', 'draw.io.app', 'Contents', 'MacOS');
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, 'draw.io'), '#!/bin/sh\nprintf "started:%s" "$*"\n', { mode: 0o755 });
  const made = bash(command, { home });
  assert.equal(made.status, 0, made.stderr);
  assert.equal(made.stdout + made.stderr, '', 'the page says the command prints nothing when it works');
  // unlicensed start: the command is the wrapper of path B, which starts a stand-in draw.io this case wrote; it reads no licence and starts no product
  const started = spawnSync(join(home, '.local', 'bin', 'drawio'), ['--version'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home } });
  assert.equal(started.stdout, 'started:--version', 'the command does not pass its arguments to draw.io, or does not start it');
  // E-04 looks for `drawio` on PATH first: a Mac whose PATH has the folder of 2d finds the app through the command.
  const { capabilityPacks } = await import(href('tools/snowarch/lib/doctor/checks/engine-prereqs.mjs'));
  const packs = capabilityPacks({ env: { PATH: join(home, '.local', 'bin') }, platform: 'darwin', exists: () => false });
  assert.equal(packs.drawio.how, join(home, '.local', 'bin', 'drawio'), 'the doctor does not find draw.io through the command of path B');
});
