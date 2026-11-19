// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C300 — docs/INSTALL-MACOS.md is true of the product it describes.
 *
 * The page is for a Mac user with Apple silicon who has nothing installed and follows it from top to bottom, one command at a time. There is ONE path
 * for every such Mac (the owner's ruling of 18 November 2026, after a first version with two paths and two chips): everything the guide installs goes
 * into the home folder with no password, and the one command that may ask for an administrator is Apple's Command Line Tools in 2a. It is the twin of
 * docs/INSTALL-WINDOWS.md and of the test beside that page (tests/install-windows-guide.test.mjs, ARC-09-C271), and it goes wrong in the same two
 * ways: a screen it quotes stops being what the product prints, or a command it tells the reader to type stops being one the product has. This file
 * holds both, and the shape the reader depends on: one command per block, no administrator outside 2a, nothing written outside the home folder, the
 * licence in place before the installer, a bash line for every zsh line, and only the files made for Apple silicon.
 *
 * WHAT IS DERIVED, AND FROM WHAT. The product's own constants and functions where it exports them (the plan screen and the steps it lists, the
 * permissions screen and the presets, the instance sub-command table, the licence file's path and its banner line, the store line, the launcher's
 * spelling); its source text, without the lines that are only comments, where it does not (the wizard's questions and menus are strings inside
 * functions), so a phrase on the page must occur there verbatim. Nothing here is a copy of the product's text kept for the test: the
 * phrase list names what the PAGE says, and the product is asked whether it still says so. What the product does not hold is pinned to the page and
 * nothing else, each with where it was read: the macOS floor of the Node.js release, the size and the SHA-256 of each download, and the closing line.
 * A new Node.js, draw.io or LibreOffice release is a change of those constants and of the page, and nothing else here.
 *
 * WHAT THE WINDOWS TWIN CHECKS AND THIS FILE DOES NOT, because it has no meaning on a Mac: the administrator-window check (Win + R, the integrity level,
 * `whoami /groups`); the four outcomes of the permission lock on a Windows store and the F9 repair that applies them (a Mac has one store line, one
 * check, SV-02, and one repair, F5); the wizard line about a lock that failed; the PowerShell lines that change the user's PATH, and `%APPDATA%\npm`
 * for the SDK (where `npm i -g` puts a tool on a Mac is on the Mac test list, not known yet); the three messages of an install without administrator
 * rights and their reload command; the PowerShell form of the Word converter; and the record of an end-to-end run, which a Mac has only in part: the first
 * run (19 November 2026) went through Step 1 and Step 2, so the page ends with the record of those two steps and "Not yet tested end to end on a Mac.", and
 * the record of a whole run takes the Windows twin's place when Steps 3 to 8 have run.
 *
 * AND WHAT IS NOT HERE YET, deliberately: the twin of the remedies check (the product's darwin remedies for git and Node.js still name Homebrew, and
 * name no step of this page; rewriting them, and TROUBLESHOOTING's Mac paragraph, are rows of 2.2.8) and the twin of the check that both pages hold
 * the same troubleshooting messages.
 *
 * The commands the page makes the reader type that are safe to run, and whose behaviour the page describes (the PATH line, the licence copy, the
 * `drawio` and `soffice` commands, the checksum, and on a Mac the disk-image steps against a synthetic image), are run here against a temporary home
 * folder, with bash where bash is. Nothing runs outside that folder, and NO CASE STARTS DRAW.IO OR LIBREOFFICE: both are installed on machines that run
 * this suite, an earlier test of the renderer once started the real draw.io and macOS asked for a keychain (ARC-09-C273), so the apps are stand-ins that
 * a case writes, and the lookups of the renderers are asked by sourcing them or by running the one line that looks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, truncateSync, writeFileSync } from 'node:fs';
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

/** Bash is on every runner that has a Mac or a Linux in it. Nothing below runs on Windows, where a Mac's commands have no meaning. */
const BASH = { skip: process.platform === 'win32' ? 'a Mac\'s commands are run where there is a bash' : false };

/** Run `command` under bash, with `home` as the home folder and `cwd` as the folder, and return what it did. */
const bash = (command, { home, cwd = home }) => spawnSync('bash', ['-c', command], {
  cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, LANG: 'C' },
});

/**
 * The three downloads of Step 2, and the file each is saved as. ONE file per program, made for Apple silicon: the vendors call the chip `arm64` for
 * Node.js and draw.io and `aarch64` for LibreOffice. The shapes are anchored, so a download of anything else (an Intel file, a universal image, an
 * installer package) is not read as one of the three, and fails the case that counts them. Each has the version twice, in the folder and in the file name.
 */
const DOWNLOADS = {
  node: { file: 'node.tar.gz', re: /^curl -fL -o ~\/snowarch-dl\/node\.tar\.gz https:\/\/nodejs\.org\/dist\/v(\d+\.\d+\.\d+)\/node-v(\d+\.\d+\.\d+)-darwin-arm64\.tar\.gz$/ },
  drawio: { file: 'drawio.dmg', re: /^curl -fL -o ~\/snowarch-dl\/drawio\.dmg https:\/\/github\.com\/jgraph\/drawio-desktop\/releases\/download\/v(\d+\.\d+\.\d+)\/draw\.io-arm64-(\d+\.\d+\.\d+)\.dmg$/ },
  libreoffice: { file: 'libreoffice.dmg', re: /^curl -fL -o ~\/snowarch-dl\/libreoffice\.dmg https:\/\/download\.documentfoundation\.org\/libreoffice\/stable\/(\d+\.\d+\.\d+)\/mac\/aarch64\/LibreOffice_(\d+\.\d+\.\d+)_MacOS_aarch64\.dmg$/ },
};
/** The release a download names (once the folder and the file name agree), or null when the page has not exactly one such command. */
const versionOf = (name) => {
  const hits = commands.map((c) => DOWNLOADS[name].re.exec(c.line)).filter(Boolean);
  return hits.length === 1 && hits[0][1] === hits[0][2] ? hits[0][1] : null;
};
/** The Node.js release the page installs; the plan screens and the check screens are held to it. */
const node = versionOf('node');

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

/** The steps of the page in the order it is read: the one path of Step 2 is seven sub-steps, 2a to 2g, and Step 1 checks the chip before anything is installed. */
const STEP_HEADINGS = ['Step 1 · Open Terminal', 'Check that your Mac has Apple silicon', 'Which shell your Terminal uses', 'Step 2 · Install the programs',
  '2a · Git (Apple\'s Command Line Tools)', '2b · Node.js', '2c · Claude Code', '2d · Tell your Mac where Claude Code and Node.js are',
  '2e · Open a fresh window and check', '2f · draw.io Desktop (for the diagrams)', '2g · LibreOffice (to check your Word documents as PDF)',
  'Step 3 · Sign in to Claude Code', 'Step 4 · Download the AI Architect', 'Step 5 · Add your licence', 'Step 6 · Run the installer',
  'Step 7 · Check your licence', 'Step 8 · Start the AI Architect'];

test('ARC-09-C300 — the page has the steps it is read in, on one path: Step 1 checks the chip, 2a to 2g follow, and nothing offers a choice', () => {
  for (const heading of [...STEP_HEADINGS, 'Optional tools', 'Every day', 'Change settings later', 'Licence renewal', 'New releases', 'If something goes wrong',
    'Asking for help', 'Uninstall', 'Your data and safety', 'What has not been tested']) {
    assert.ok(titles.includes(heading), `no heading "${heading}"`);
  }
  const inOrder = STEP_HEADINGS.map((h) => titles.indexOf(h));
  assert.deepEqual(inOrder, [...inOrder].sort((a, b) => a - b), 'the steps of the page are not in the order they are read');
  // The sub-steps are named by their number: their words may change, the number is what the rest of the page points at.
  for (const ref of ['5a', '5b', '5c', '6a', '6b', '6c', '6d', '6e']) assert.ok(titles.some((t) => t.startsWith(`${ref} · `)), `no sub-step ${ref}`);

  // ONE PATH: no Path A or Path B heading, no table that sets two paths side by side, no choice of chip, and no heading below a sub-step of Step 2 or
  // below any section but the seven questions of the wizard.
  assert.deepEqual(titles.filter((t) => /\bPath [AB]\b|\bpath [AB]\b|choose yours/i.test(t)), [], 'a heading offers a path');
  assert.doesNotMatch(page, /\b[Pp]ath [AB]\b|\| Path A \||choose yours first/, 'the page still speaks of two paths');
  assert.deepEqual(commands.filter((c) => /^\*\*(?:Apple silicon|Intel)\*\*/.test(c.label)).map((c) => c.line), [], 'a command is labelled for one chip: there is one chip');
  assert.deepEqual(headings.filter((h) => h.level === 4 && !/^Question \d of 7 · /.test(h.title)).map((h) => h.title), [], 'a heading below a step that is not one of the wizard\'s seven questions');
  for (const ref of ['2a', '2b', '2c', '2d', '2e', '2f', '2g']) assert.equal(headings.filter((h) => h.level === 3 && h.title.startsWith(`${ref} · `)).length, 1, `${ref} is not one level-3 heading`);
});

test('ARC-09-C300 — every step, sub-step and section the page sends the reader to exists', () => {
  const refs = new Set([...prose.matchAll(/\b([2-6][a-z])\b/g)].map((m) => m[1]));      // any letter: a reference to a sub-step the page does not have is the finding
  assert.ok(refs.size >= 10, `only ${refs.size} sub-step references found: the reading is broken`);
  for (const ref of refs) assert.ok(titles.some((t) => t.startsWith(`${ref} · `)), `the page points at ${ref}, which it has no heading for`);
  for (const n of new Set([...prose.matchAll(/\bStep (\d+)\b/g)].map((m) => m[1]))) {
    assert.ok(titles.some((t) => t.startsWith(`Step ${n} · `)), `the page points at Step ${n}, which it has no heading for`);
  }
  // A section named in quotation marks is a heading, or a bold lead-in such as "Add another instance".
  const named = new Set([...prose.matchAll(/"([A-Z][A-Za-z' ]{3,50})"/g)].map((m) => m[1]));
  assert.ok(named.size >= 8, `only ${named.size} quoted section names found: the reading is broken`);
  for (const name of named) assert.ok(titles.includes(name) || page.includes(`**${name}.**`), `the page sends the reader to "${name}", which is no section of it`);
  // A repository path the page names is a file of the repository (a folder of the install, such as .local/ or vendor/, is the reader's own).
  for (const m of prose.matchAll(/(?<![\w/.-])((?:docs|scripts|tools|packages|governance)\/[A-Za-z0-9._/-]*[A-Za-z0-9])/g)) assert.ok(existsSync(join(root, m[1])), `the page names ${m[1]}, which is not in the repository`);
});

test('ARC-09-C300 — every command block holds exactly one command', () => {
  assert.ok(runs.length >= 40, `only ${runs.length} command blocks found: the parser lost some`);
  const bad = runs.filter((b) => b.lines.filter((l) => l.trim() !== '').length !== 1);
  assert.deepEqual(bad.map((b) => `${b.heading}: ${b.lines.join(' / ')}`), [],
    'a pasted block of several lines arrived broken on the first end-to-end install on Windows, and the shell asked a question nobody expected');
});

// ───────────────────────────── no administrator, nothing outside the home folder ─────────────────────────────

/** The one command that may ask a Mac user for an administrator: Apple's Command Line Tools, in 2a. Everything else the page installs goes into the home folder. */
const ADMIN_ONLY = /^xcode-select --install$/;
/** The only forms of the commands that open a disk image, copy an app out of it and close it: the mount point is a folder of the download folder. */
const HDIUTIL_ATTACH = /^hdiutil attach -nobrowse -mountpoint ~\/snowarch-dl\/(mnt-[a-z]+) ~\/snowarch-dl\/([a-z]+\.dmg) > \/dev\/null$/;
const HDIUTIL_DETACH = /^hdiutil detach ~\/snowarch-dl\/(mnt-[a-z]+) > \/dev\/null$/;
const COPY_APP = /^cp -R ~\/snowarch-dl\/(mnt-[a-z]+)\/([A-Za-z.]+\.app) ~\/Applications\/$/;
const COPY_LICENCE = 'cp ~/Downloads/LIC-*.json .local/licence.json';
/** The two small commands that make `drawio` and `soffice` in the folder 2d puts on PATH, each starting the app 2f or 2g copied into ~/Applications. */
const WRAPPER = /^printf '#!\/bin\/sh\\nexec "\$HOME\/Applications\/([A-Za-z.]+\.app)\/Contents\/MacOS\/([A-Za-z.]+)" "\$@"\\n' > ~\/\.local\/bin\/(drawio|soffice) && chmod \+x ~\/\.local\/bin\/\3$/;

test('ARC-09-C300 — no command needs an administrator but Apple\'s tools in 2a, and everything else the page writes goes into the home folder', () => {
  for (const { line, heading } of commands) {
    assert.doesNotMatch(line, /\b(?:sudo|brew|softwareupdate|chown|chsh|xattr|spctl|launchctl)\b|\bdefaults\s+write\b/, `${heading}: ${line}`);
    // The page deletes nothing by command: the Uninstall step moves the folders to the Trash in Finder, which can be undone.
    assert.doesNotMatch(line, /\b(?:rm|rmdir|mv)\b/, `${heading}: a command that deletes or moves: ${line}`);
    if (ADMIN_ONLY.test(line)) assert.ok(heading.startsWith('2a · '), `${heading}: ${line} may ask for an administrator's password and belongs to 2a`);
    // An absolute path starts after a space, a quote or an equals sign: `$HOME/…` and `~/…` do not, and a shebang or a URL has a character before its slash.
    // `/dev/null` is where the two disk-image commands send what they print; it is no place the page writes a file to.
    assert.doesNotMatch(line.replace(/ > \/dev\/null$/, ''), /(?:^|[\s"'=])\/[A-Za-z]/, `${heading}: this names a place outside the home folder (no /Applications, /usr or /opt): ${line}`);
    if (/^cp\b/.test(line)) assert.ok(line === COPY_LICENCE || COPY_APP.test(line), `${heading}: a copy that is neither the licence nor an app into ~/Applications: ${line}`);
    if (/^hdiutil\b/.test(line)) assert.ok(HDIUTIL_ATTACH.test(line) || HDIUTIL_DETACH.test(line), `${heading}: a disk-image command in neither of the two forms the page allows: ${line}`);
    if (/\bchmod\b/.test(line)) assert.match(line, WRAPPER, `${heading}: chmod belongs to the two small commands of 2f and 2g, and nothing else: ${line}`);
    if (/^mkdir\b/.test(line)) assert.match(line, /^mkdir -p (?:~\/[A-Za-z.\-/]+|\.local)$/, `${heading}: a folder made outside the home folder: ${line}`);
    if (/^tar\b/.test(line)) assert.match(line, / -C ~\/\.local\/node /, `${heading}: an archive unpacked outside ~/.local/node: ${line}`);
  }
  // The allowance is not vacuous: Apple's tools are on the page once, in 2a.
  assert.equal(commands.filter((c) => ADMIN_ONLY.test(c.line)).length, 1, 'expected exactly one command that may ask for an administrator');
  // The disk-image steps come as triples on one mount point and one image: attach, copy the app, detach. One triple for draw.io, one for LibreOffice.
  const triples = [];
  commands.forEach((c, i) => {
    const attach = HDIUTIL_ATTACH.exec(c.line);
    if (!attach) return;
    const copy = COPY_APP.exec(commands[i + 1]?.line ?? '');
    const detach = HDIUTIL_DETACH.exec(commands[i + 2]?.line ?? '');
    assert.ok(copy && detach, `${c.heading}: the attach command is not followed by the copy of the app and by the detach: ${commands[i + 1]?.line} / ${commands[i + 2]?.line}`);
    assert.deepEqual([copy[1], detach[1]], [attach[1], attach[1]], `${c.heading}: the copy or the detach names another mount point than the attach: ${attach[1]}`);
    triples.push({ mount: attach[1], image: attach[2], app: copy[2] });
  });
  assert.deepEqual(triples, [{ mount: 'mnt-drawio', image: DOWNLOADS.drawio.file, app: 'draw.io.app' }, { mount: 'mnt-libreoffice', image: DOWNLOADS.libreoffice.file, app: 'LibreOffice.app' }],
    'the disk images the page opens are not the two it downloads, one app out of each');
  // `~/Applications` is made once, before the first copy.
  assert.ok(at((c) => c.line === 'mkdir -p ~/Applications') >= 0 && at((c) => c.line === 'mkdir -p ~/Applications') < at((c) => COPY_APP.test(c.line)), 'the Applications folder of the home folder is not made before the first app is copied into it');
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
/**
 * The one shape of a line that changes the user's PATH, and the page has it once per shell: it puts the two folders of the user's own in front, Claude Code's
 * (`.local/bin`) and Node.js's (`.local/node/bin`, where 2b unpacks it), in that order, in the file their shell reads, and applies the change to the window.
 */
const PATH_LINE = /^echo 'export PATH="\$HOME\/\.local\/bin:\$HOME\/\.local\/node\/bin:\$PATH"' >> ~\/\.(zshrc|bash_profile) && source ~\/\.(zshrc|bash_profile)$/;

test('ARC-09-C300 — a PATH change is the user\'s, in one shape for both folders, and every zsh line has its bash line', () => {
  const changes = commands.filter((c) => c.line.includes('>>'));
  assert.equal(changes.length, 2, `${changes.length} commands append to a file: one PATH line for zsh and its twin for bash are the whole of it`);
  for (const { line, heading } of changes) {
    const m = PATH_LINE.exec(line);
    assert.ok(m, `${heading}: this appends something other than the export PATH line that puts Claude Code's folder and Node.js's in front, in that order: ${line}`);
    assert.equal(m[1], m[2], `${heading}: the file appended to is not the file that is sourced: ${line}`);
    assert.ok(heading.startsWith('2d · '), `${heading}: the PATH line is the one of 2d, and 2b adds no second one`);
  }
  // Every redirect on the page writes one of three places: the zsh file or the bash file by appending, and the `drawio` and `soffice` commands by creating them.
  const WRITES = { '>>': ['~/.zshrc', '~/.bash_profile'], '>': ['~/.local/bin/drawio', '~/.local/bin/soffice'] };
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
  assert.equal(changes.filter((c) => /~\/\.zshrc\b/.test(c.line)).length, 1, 'the page does not change PATH under zsh exactly once');
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

test('ARC-09-C300 — step 2d is the product\'s line for Claude Code with the folder of Node.js added, and says what the installer prints instead', () => {
  // ARC-09-C270: when `claude` is not on PATH and the native installer's file is there, B00 prints the fix for the platform, and the fix ends the line. It
  // names one folder, Claude Code's. After 2b and 2c two programs are off PATH (Node.js is unpacked into ~/.local/node, which nothing else puts there), so
  // 2d is the product's command with the second folder after the first: the same file, the same `source`, once for zsh and once for bash.
  const fix = JSON.parse(read('tools/snowarch/lib/remedies.json')).claudeCode.offPath.darwin;
  const product = fix.slice(fix.indexOf('echo \''));
  assert.ok(product.startsWith('echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.zshrc && source ~/.zshrc'), `the product's fix no longer ends in the zsh line: ${fix}`);
  assert.ok(fix.includes('bash on macOS: ~/.bash_profile instead'), `the product's fix no longer says which file bash reads: ${fix}`);
  const command = product.replace('$HOME/.local/bin:', '$HOME/.local/bin:$HOME/.local/node/bin:');
  const found = commands.filter((c) => c.line === command);
  assert.equal(found.length, 1, 'the page does not give the product\'s command with the Node.js folder added, once');
  assert.ok(found[0].heading.startsWith('2d · ') && found[0].label.startsWith('**zsh**'), 'the command is the zsh one of step 2d');
  assert.equal(commands.filter((c) => c.line === command.replaceAll('~/.zshrc', '~/.bash_profile')).length, 1, 'the page does not give the bash twin of the command, once');
  // The folder added is the one 2b unpacks Node.js into, and it comes after Claude Code's, which the installer's own line has first.
  const unpacked = /^tar -xzf \S+ -C ~\/(\.local\/node) --strip-components=1$/.exec(commands.find((c) => /^tar\b/.test(c.line))?.line ?? '')?.[1];
  assert.ok(unpacked && command.includes(`:$HOME/${unpacked}/bin:`), `the PATH line does not name the folder 2b unpacks Node.js into (${unpacked})`);
  assert.ok(command.indexOf('$HOME/.local/bin:') < command.indexOf(`$HOME/${unpacked}/bin:`), 'the folder of Node.js comes before the folder of Claude Code');
  // What the reader is told about the installer's own line, which is the shorter one.
  assert.ok(prose.includes('If the AI Architect\'s installer ever finds Claude Code installed but its folder not on PATH, it prints a shorter command for that one folder; use the one below instead, which has both.'),
    'the page does not say that the installer prints a shorter command for the one folder');
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
  // The renderer of the PDF check says the same when no `soffice` is on PATH, and suggests brew, which the page's table tells the reader to leave alone.
  ['scripts/render-pdf.sh', 'ERROR: LibreOffice (soffice) not found'],
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
/**
 * THE SIZE AND THE SHA-256 OF EACH DOWNLOAD, by program and release: what `shasum -a 256` must answer for the file, and what "about N MB" the page says of it.
 * The product holds none of it, so the page is held to these constants, and a new release is looked up and added here before its page is right. Each was
 * read on 2026-11-18 from the publisher's own listing, not computed from a download:
 *   node         SHASUMS256.txt of Node.js v26.13.1 (nodejs.org/dist/v26.13.1/), the line for node-v26.13.1-darwin-arm64.tar.gz
 *   drawio       the asset list of the draw.io 32.7.4 release on GitHub (jgraph/drawio-desktop, the API's `digest`), draw.io-arm64-32.7.4.dmg, 158,930,055 bytes
 *   libreoffice  the listing of The Document Foundation for 26.8.3 (download.documentfoundation.org/libreoffice/stable/26.8.3/mac/aarch64/), 299,927,705 bytes
 *   node         the Content-Length that nodejs.org answers to a HEAD of node-v26.13.1-darwin-arm64.tar.gz, 58,340,590 bytes (read on 2026-11-19; the first run on a Mac
 *                saw curl end its table at 55.6M, which is this size in curl's units)
 * The size the page rounds to the nearest 10 MB (decimal, as the page and the product count them).
 */
const SHA256 = {
  node: { '26.13.1': 'aec2514ea1ceb2ba52455e9ec65986f6749a06dd759e5db2a72e6889668c9735' },
  drawio: { '32.7.4': 'b0ba01224cdc4817ebf218d73b2a45ff3569f8c9135ad422c5157655062900b3' },
  libreoffice: { '26.8.3': 'de943203795e5057785f65515063e2db5eb60b0bb6d8e2534fec59e5cc5fb988' },
};
const BYTES = { node: { '26.13.1': 58340590 }, drawio: { '32.7.4': 158930055 }, libreoffice: { '26.8.3': 299927705 } };
/** The word of the architecture that Step 1 asks `uname -m` to answer, and what The Document Foundation calls the same chip in the name of its file. */
const ARCH = 'arm64';
const ARCH_OF_LIBREOFFICE = 'aarch64';

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

test('ARC-09-C300 — each program the page downloads is one version and a file for Apple silicon: in the downloads, on the check screens and in the closing paragraph', () => {
  // Every download of the page: the three files of Step 2, saved in the download folder, and Claude Code's own installer, which is no file of ours.
  const curls = commands.filter((c) => /^curl\b/.test(c.line));
  assert.equal(curls.length, 4, `the page has ${curls.length} downloads: expected the three files of Step 2 and the installer of Claude Code`);
  assert.ok(curls.some((c) => c.line === 'curl -fsSL https://claude.ai/install.sh | bash' && c.heading.startsWith('2c · ')), 'the installer of Claude Code is not what 2c runs');
  const release = {};
  for (const [name, step] of [['node', '2b · '], ['drawio', '2f · '], ['libreoffice', '2g · ']]) {
    const found = commands.filter((c) => DOWNLOADS[name].re.test(c.line));
    assert.equal(found.length, 1, `${name}: expected one download of the file made for Apple silicon, found ${found.length}`);
    const m = DOWNLOADS[name].re.exec(found[0].line);
    assert.equal(m[1], m[2], `${name}: the folder and the file name are different versions: ${found[0].line}`);
    assert.ok(found[0].heading.startsWith(step), `${name}: the download is not under ${step.trim()}: ${found[0].heading}`);
    release[name] = m[1];
  }
  // The word of the chip that Step 1 asks for is the word in the file names; The Document Foundation's name for the same chip is the one of its own listing.
  assert.ok(commands.some((c) => c.line.includes(`darwin-${ARCH}.tar.gz`)) && commands.some((c) => c.line.includes(`/draw.io-${ARCH}-`)), `the downloads of Node.js and draw.io do not name ${ARCH}`);
  assert.ok(commands.some((c) => c.line.includes(`/mac/${ARCH_OF_LIBREOFFICE}/`) && c.line.includes(`_MacOS_${ARCH_OF_LIBREOFFICE}.dmg`)), `the download of LibreOffice does not name ${ARCH_OF_LIBREOFFICE}`);
  // ONLY those files: nothing for an Intel Mac, no universal image, no installer package, no download that decides by itself which file to fetch.
  for (const { line, heading } of commands) {
    assert.doesNotMatch(line, /x64|x86|amd64|i386|universal|\.pkg\b|intel|\.zip\b/i, `${heading}: a command that names a file for another chip or another format: ${line}`);
    if (/^curl\b/.test(line)) assert.doesNotMatch(line, /\buname\b|\$\(|`/, `${heading}: a download that works out for itself which file to fetch: ${line}`);
  }
  assert.doesNotMatch(page, /draw\.io-(?:x64|universal)|x86-64|darwin-x64|\.pkg\b|-windows\.zip/, 'the page names a file that is not for Apple silicon');
  assert.equal(release.node, node);
  // Where each release is shown to the reader: the check of 2e, the checks of 6a, the closing paragraph; the sample of LibreOffice's own version line.
  assert.ok(screens.some((b) => b.lines.includes(`v${node}`)), `the check in 2e does not show v${node}`);
  assert.ok(screens.some((b) => b.lines.some((l) => l.startsWith(`ok B00 node: ${node} · npm `))), `the checks of 6a do not show Node.js ${node}`);
  assert.ok(closing.includes(`Node.js ${release.node},`), `the closing paragraph does not name Node.js ${release.node}`);
  assert.ok(closing.includes(`draw.io ${release.drawio},`), `the closing paragraph does not name draw.io ${release.drawio}`);
  assert.ok(closing.includes(`LibreOffice ${release.libreoffice},`), `the closing paragraph does not name LibreOffice ${release.libreoffice}`);
  const version = new RegExp(`^LibreOffice ${release.libreoffice.replaceAll('.', '\\.')}\\.\\d+ [0-9a-f]{40}$`);
  const soffice = screens.filter((b) => b.lines.some((l) => version.test(l)));
  assert.equal(soffice.length, 1, `the page shows no sample of "LibreOffice ${release.libreoffice}.<build> <40 letters and digits>", or shows it twice`);
  assert.equal(soffice[0].lines.filter((l) => l.trim() !== '').length, 1, 'the sample of the LibreOffice version is not one line');
  assert.ok(soffice[0].heading.startsWith('2g · '), 'the sample of the LibreOffice version is not in 2g');
  // The archive goes into the folder 2d puts on PATH, and the download folder exists before the first download and is where Step 3 starts.
  assert.ok(lines.includes('tar -xzf ~/snowarch-dl/node.tar.gz -C ~/.local/node --strip-components=1'), 'the archive is not unpacked into ~/.local/node');
  assert.ok(lines.includes('mkdir -p ~/.local/node'), 'the folder the archive goes into is not made');
  assert.ok(lines.indexOf('mkdir -p ~/.local/node') < lines.indexOf('tar -xzf ~/snowarch-dl/node.tar.gz -C ~/.local/node --strip-components=1'), 'the archive is unpacked before its folder is made');
  assert.ok(lines.indexOf('mkdir -p ~/snowarch-dl') >= 0 && lines.indexOf('mkdir -p ~/snowarch-dl') < at((c) => /^curl -fL -o ~\/snowarch-dl\//.test(c.line)), 'the download folder is made after the first download');
  assert.ok(lines.includes('cd ~/snowarch-dl'), 'Step 3 does not start in the download folder');

  // The macOS the release needs: the page states it everywhere it states a floor, and the product holds only Claude Code's.
  assert.ok(node in MACOS_FLOOR_OF_NODE, `read BUILDING.md of Node.js ${node} for the macOS it needs and add it to MACOS_FLOOR_OF_NODE`);
  const floor = MACOS_FLOOR_OF_NODE[node];
  const major = node.split('.')[0];
  assert.ok(page.split('\n')[2].startsWith(`AI ServiceNow Architect · macOS ${floor} or later `), 'the title line does not state the macOS floor');
  const need = page.split('\n').find((l) => l.startsWith('- **macOS '));
  assert.ok(need?.includes(`**macOS ${floor} or later**`) && need.includes(`Claude Code needs 13.0, Node.js ${major} needs ${floor}`), `"What you need" does not state the floor, and whose it is: ${need}`);
  assert.ok(prose.includes(`this guide needs ${floor} or later`), 'the dyld row does not name the floor');
  assert.ok(prose.includes(`macOS ${floor} to 15`), 'the list of what has not been tested does not start at the floor');
  for (const m of prose.matchAll(/macOS (\d+(?:\.\d+)?) or later/g)) assert.ok([floor, '10.15'].includes(m[1]), `the page states a macOS floor of ${m[1]}: only ${floor} and the zsh default of 10.15 belong to it`);

  // The size of each image, as the page says it: the nearest ten megabytes of what the publisher lists.
  for (const name of ['node', 'drawio', 'libreoffice']) {
    assert.ok(release[name] in BYTES[name], `read the size of the ${name} ${release[name]} download in the publisher's listing and add it to BYTES`);
    assert.ok(prose.includes(`It is about ${Math.round(BYTES[name][release[name]] / 1e7) * 10} MB`), `the page does not give the size of the ${name} download as about ${Math.round(BYTES[name][release[name]] / 1e7) * 10} MB`);
  }
});

test('ARC-09-C300 — the three optional checksums are the publishers\' own: each screen holds the pinned SHA-256 and names the file its command checks', async (t) => {
  // `shasum -a 256 <file>` answers `<64 letters and digits>  <path>`, two spaces between them. The page shows what the publisher lists for the file it
  // downloaded one step before; the values are pinned above, with where each was read, and are the page's alone: a new release is a new line there.
  const checks = commands.map((c, i) => ({ ...c, i })).filter((c) => /^shasum\b/.test(c.line));
  assert.deepEqual(checks.map((c) => c.line), ['node', 'drawio', 'libreoffice'].map((n) => `shasum -a 256 ~/snowarch-dl/${DOWNLOADS[n].file}`), 'the checksum commands are not the three, one for each download, in the order of the downloads');
  for (const [n, name] of ['node', 'drawio', 'libreoffice'].entries()) {
    const check = checks[n];
    const release = versionOf(name);
    assert.ok(release in SHA256[name], `read the SHA-256 of the ${name} ${release} download in the publisher's listing and add it to SHA256`);
    // The check comes after the download of the same file and before anything that uses it.
    const download = at((c) => DOWNLOADS[name].re.test(c.line));
    assert.ok(download >= 0 && download < check.i, `${name}: the checksum is asked before the download`);
    const block = blocks.findIndex((b) => b.kind === 'run' && b.lines.includes(check.line));
    const shown = blocks.slice(block + 1).find((b) => b.kind === 'screen');
    assert.deepEqual(shown?.lines.filter((l) => l.trim() !== ''), [`${SHA256[name][release]}  /Users/you/snowarch-dl/${DOWNLOADS[name].file}`], `${name}: the screen after the checksum is not the pinned SHA-256 of ${release}, two spaces, and the file the command checks`);
    assert.ok(check.label.startsWith('**Optional.**'), `${name}: the checksum is not marked optional`);
  }
  // A shasum on a Mac prints exactly that shape; the page's screen is the shape of a real run, with the home folder written out.
  if (process.platform === 'win32' || spawnSync('bash', ['-c', 'command -v shasum'], { stdio: 'ignore' }).status !== 0) return t.skip('shasum runs where bash and shasum are');
  const home = tempDir('install-macos-guide-', t);
  mkdirSync(join(home, 'snowarch-dl'));
  writeFileSync(join(home, 'snowarch-dl', 'node.tar.gz'), 'a stand-in for the archive\n');
  const ran = bash(checks[0].line, { home });
  assert.equal(ran.status, 0, ran.stderr);
  assert.match(ran.stdout.replace(home, '/Users/you'), /^[0-9a-f]{64}  \/Users\/you\/snowarch-dl\/node\.tar\.gz\n$/, 'shasum does not answer in the shape the page shows');
});

/** True when version `a` is the same as or later than `b`, compared number by number (`3.10.1` is later than `3.9`). */
function atLeast(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

test('ARC-09-C300 — the page ends with the record of the run it has had on a Mac (Step 1 and Step 2), and still says that no Mac has run all of it', () => {
  // The Windows page ends with a record of the one end-to-end run it was written from (tests/install-windows-guide.test.mjs, ARC-09-C271): the machine, the user,
  // the version of each program. The first run on a Mac (19 November 2026) went through Step 1 and Step 2 only, so this page's closing paragraph is that record and
  // the statement that Steps 3 to 8 have not yet run on a Mac. When they have, "Not yet tested end to end on a Mac." becomes "Tested end to end on …", and this
  // case becomes the Windows twin's record check for the whole run.
  assert.ok(closing.startsWith('Not yet tested end to end on a Mac. '), `the closing line no longer says that no Mac has run all of the page: ${closing}`);
  assert.ok(page.split('\n')[2].includes('not yet tested end to end on a Mac (see "What has not been tested")'), 'the title line no longer says that no Mac has run all of the page');
  assert.doesNotMatch(page, /^Tested end to end on /m, 'a record of a whole run is on the page: the closing line and this case change together');
  assert.ok(titles.includes('What has not been tested'));
  for (const s of ['were run on 19 November 2026 by a person on a company MacBook with Apple silicon', 'as a Standard user without administrator rights',
    '2b, 2c, 2d, 2f and 2g asked for no password', 'the draw.io and LibreOffice checksums matched the ones in this guide', 'Steps 3 to 8 have not yet run on a Mac']) {
    assert.ok(closing.includes(s), `the record lacks: ${s}`);
  }
  // What the run installed, in the words of the record. Each program the page downloads is the version the record names (the Windows twin's rule), and the three
  // the reader checks in 2e are at or above the floors the page states.
  const ran = /That run installed (.+?)\. Steps 3 to 8/.exec(closing)?.[1] ?? '';
  const installed = Object.fromEntries([...ran.matchAll(/(Node\.js|Claude Code|draw\.io|LibreOffice|Git|python3) (\d+(?:\.\d+)+)/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(Object.keys(installed), ['Node.js', 'Claude Code', 'draw.io', 'LibreOffice', 'Git', 'python3'], `the record does not name the six programs of the run: ${ran}`);
  assert.equal(installed['Node.js'], versionOf('node'));
  assert.equal(installed['draw.io'], versionOf('drawio'));
  // LibreOffice writes a build number after the release (`26.8.3.1`): the release the page downloads is the start of it.
  assert.ok(installed.LibreOffice.startsWith(`${versionOf('libreoffice')}.`), `the record names LibreOffice ${installed.LibreOffice}, not a build of the release the page downloads`);
  assert.ok(ran.includes('Git 2.50.1 (Apple Git-155)'), 'the record does not say which build of Git it was');
  const { floors } = JSON.parse(read('engine.config.json'));
  assert.ok(atLeast(installed['Claude Code'], floors.claudeCode) && atLeast(installed.Git, floors.git) && atLeast(installed.python3, '3.9'), 'a program of the record is below the floor the page states for it');
  // The record names no person, no host and no address.
  assert.doesNotMatch(closing, /@|https?:|\.service-now\.com/);
});

test('ARC-09-C300 — the page is linked from where a Mac reader starts, and carries a release tag the release writes', () => {
  assert.match(read('README.md'), /\]\(docs\/INSTALL-MACOS\.md\)/);
  assert.match(read('docs/INSTALL.md'), /\]\(INSTALL-MACOS\.md\)/);
  // The paragraph that sends a reader there says whose Mac it is for: the page stops an Intel Mac in Step 1, so the link does not offer it to one.
  for (const [rel, link] of [['README.md', '](docs/INSTALL-MACOS.md)'], ['docs/INSTALL.md', '](INSTALL-MACOS.md)']]) {
    const paragraph = read(rel).split('\n').find((l) => l.includes(link));
    assert.ok(paragraph?.startsWith('**On a Mac with Apple silicon'), `${rel}: the paragraph that links the macOS page does not say that it is for Apple silicon: ${paragraph?.slice(0, 120)}`);
  }
  // One clone command, pinned to a release; the release's writer owns the tag (scripts/lib/release/writers.mjs).
  const clones = commands.filter((c) => /^git -c advice\.detachedHead=false clone --branch v\d+\.\d+\.\d+ https:\/\/github\.com\/farstic\/snowarch\.git AI-Arch$/.test(c.line));
  assert.equal(clones.length, 1);
  // The folder the clone makes is the folder every later command goes to.
  assert.ok(lines.includes('cd AI-Arch') && lines.filter((l) => l === 'cd ~/AI-Arch').length >= 2, 'the folder of the clone is not the folder the page goes back to');
  // No other release number is written on the page by hand outside the examples the page says are examples.
  assert.match(page, /The screens in this guide are examples\./);
});

/** The text of a section of the page, fenced blocks included: from its heading to the next heading of the same level or a higher one. */
function sectionOf(title) {
  const all = page.split('\n');
  const start = all.findIndex((l) => /^#{1,4} /.test(l) && l.replace(/^#+ /, '') === title);
  assert.ok(start >= 0, `no section "${title}"`);
  const level = /^#+/.exec(all[start])[0].length;
  let fenced = false;
  const out = [];
  for (const l of all.slice(start + 1)) {
    if (l.startsWith('```')) fenced = !fenced;
    else if (!fenced && /^#+ /.test(l) && /^#+/.exec(l)[0].length <= level) break;
    out.push(l);
  }
  return out.join('\n');
}

/** Every line of the page with the heading it sits under, and whether it is inside a fenced block. */
const pageLines = (() => {
  let heading = '';
  let fenced = false;
  return page.split('\n').map((line) => {
    if (line.startsWith('```')) fenced = !fenced;
    else if (!fenced && /^#{1,4} /.test(line)) heading = line.replace(/^#+ /, '');
    return { line, heading, fenced };
  });
})();

/** The screen a command is followed by: the first block that shows what the reader sees, after the block that holds the command. */
const screenAfter = (line) => {
  const at = blocks.findIndex((b) => b.kind === 'run' && b.lines.includes(line));
  return at < 0 ? null : blocks.slice(at + 1).find((b) => b.kind === 'screen') ?? null;
};

test('ARC-09-C300 — the guide is for Apple silicon only: Step 1 asks `uname -m` for arm64, says what an Intel Mac does and how Rosetta is undone, and the rest of the page does not speak of Intel', () => {
  const asks = commands.filter((c) => c.line === 'uname -m');
  assert.equal(asks.length, 1, 'the page does not ask `uname -m` exactly once');
  assert.equal(asks[0].heading, 'Check that your Mac has Apple silicon');
  assert.ok(commands.indexOf(asks[0]) < at((c) => c.line === 'xcode-select --install'), 'the chip is checked after something was installed');
  // The answer it must give is one word, and it is the word in the names of the files the page downloads.
  assert.deepEqual(screenAfter('uname -m')?.lines.filter((l) => l.trim() !== ''), [ARCH], 'the screen after `uname -m` is not the one word the downloads are made for');
  const step = sectionOf('Check that your Mac has Apple silicon');
  assert.ok(step.includes('It must answer `arm64`. If it answers `x86_64`, your Mac has an Intel processor (About This Mac shows **Processor**, not **Chip**), and this guide is not for it: stop here and ask whoever helps you with the AI Architect.'), 'the stop text for an Intel Mac is gone or changed');
  // A Mac with Apple silicon whose Terminal opens under Rosetta answers x86_64 too: the page says where the setting is, and sends the reader back to the command.
  assert.ok(step.includes('If About This Mac shows a **Chip** that starts with *Apple M* but the command answers `x86_64`, Terminal is set to open using Rosetta'), 'the Rosetta case is gone or changed');
  assert.ok(step.includes('press **Command+I**, untick **Open using Rosetta**, quit Terminal (**Terminal › Quit Terminal**), open it again as above and run the command again.'), 'the way to undo Rosetta is gone or changed');
  assert.ok(prose.includes('see the Rosetta setting in Step 1'), 'the row for a Node.js that does not start no longer sends the reader to the Rosetta setting');
  // Intel is named in the item of "What you need" that says this guide is not for it, and in this section, and nowhere else: not in a command, a screen, a label
  // or a row of the table. (Rosetta is named in the row above and in the list of what has not been tested, which is not naming a chip.)
  const named = pageLines.filter((l) => /\bIntel\b|\bx86|\bx64\b|amd64|i386|\buniversal\b/i.test(l.line));
  assert.ok(named.length >= 3, `only ${named.length} lines name the chip that is not supported: the reading is broken`);
  for (const l of named) {
    const allowed = l.heading === 'Check that your Mac has Apple silicon' || (l.heading === 'What you need' && l.line.startsWith('- A Mac with **Apple silicon**'));
    assert.ok(allowed, `${l.heading}: the page speaks of the chip it is not for outside Step 1 and the first item of "What you need": ${l.line.slice(0, 160)}`);
  }
  assert.ok(prose.includes('A Mac with an Intel processor shows **Processor** instead, and this guide is not for it. Step 1 checks it again with a command.'), 'the first item of "What you need" does not send the reader to Step 1');
  assert.ok(prose.includes('on a Mac with Apple silicon (M1 or later)'), 'the title line does not say that the guide is for Apple silicon');
});

test('ARC-09-C300 — exactly four commands are optional, each says so in the line before its Run:, and every checksum and every opening of an app is one of them', () => {
  const optional = commands.filter((c) => c.label.startsWith('**Optional.**'));
  assert.deepEqual(optional.map((c) => c.line), [
    `shasum -a 256 ~/snowarch-dl/${DOWNLOADS.node.file}`, `shasum -a 256 ~/snowarch-dl/${DOWNLOADS.drawio.file}`,
    'open ~/Applications/draw.io.app', `shasum -a 256 ~/snowarch-dl/${DOWNLOADS.libreoffice.file}`,
  ], 'the optional commands are not the three checksums and the one opening of draw.io, in the order of the page');
  for (const c of optional) assert.match(c.label, /^\*\*Optional\.\*\* .*Run:$/, `${c.heading}: the label of an optional command is not "**Optional.** … Run:": ${c.label}`);
  for (const c of commands.filter((x) => /^(?:shasum|open)\b/.test(x.line))) assert.ok(c.label.startsWith('**Optional.**'), `${c.heading}: ${c.line} is not marked optional, and nothing after it depends on it`);
  // The one `open` starts the app the reader has just installed, so that macOS's questions come up while they watch; it is the app the `drawio` command starts.
  const app = /\$HOME\/Applications\/(draw\.io\.app)\//.exec(commands.find((c) => WRAPPER.test(c.line) && /drawio$/.test(c.line))?.line ?? '')?.[1];
  assert.equal(optional.find((c) => c.line.startsWith('open '))?.line, `open ~/Applications/${app}`);
  assert.match(page, /A command marked \*\*Optional\*\* can be skipped\./);
});

test('ARC-09-C300 — the page says what the install takes: about 45 minutes, 6 GB to start with, and the 1.5 GB the installer checks; and Uninstall names what Step 2 made', () => {
  assert.ok(prose.includes('Plan about 45 minutes, more if your Mac first has to download Apple\'s Command Line Tools; most of it is waiting for downloads.'), 'the page does not say how long to plan');
  assert.ok(prose.includes('On a company Mac, add the time your IT team needs for 2a.'), 'the page does not say that a company Mac adds the time of 2a');
  assert.ok(prose.includes('- At least **6 GB of free disk space** before you start.'), 'the page does not ask for 6 GB of free disk space');
  // The 1.5 GB is the installer's own floor for the whole corpus (B00's DISK_FULL), which the page quotes for Step 6a.
  const floor = /export const DISK_FULL = ([\d.]+) \* GB;/.exec(read('tools/snowarch/lib/steps/B00.mjs'))?.[1];
  assert.ok(floor && prose.includes(`the installer checks for ${floor} GB in Step 6a`), `the page does not say that the installer checks for ${floor} GB`);

  // Uninstall step 4 names everything Step 2 makes in the home folder: the two apps, the two small commands, the Node.js folder and the download folder.
  const uninstall = sectionOf('Uninstall');
  const apps = commands.filter((c) => COPY_APP.test(c.line)).map((c) => COPY_APP.exec(c.line)[2].replace(/\.app$/, ''));
  const small = commands.filter((c) => WRAPPER.test(c.line)).map((c) => WRAPPER.exec(c.line)[3]);
  const unpacked = /-C ~\/(\.local)\/(node) /.exec(commands.find((c) => /^tar\b/.test(c.line))?.line ?? '');
  assert.deepEqual([apps, small], [['draw.io', 'LibreOffice'], ['drawio', 'soffice']], 'the apps and small commands the page makes are not the two and two the Uninstall step is written for');
  assert.ok(unpacked, 'the page does not unpack Node.js into ~/.local/node');
  assert.ok(uninstall.includes('~/Applications') && apps.every((a) => uninstall.includes(`**${a}**`)), 'Uninstall does not say where the two apps are and name both');
  assert.ok(uninstall.includes('~/.local/bin') && small.every((s) => uninstall.includes(`\`${s}\``)), 'Uninstall does not name the two small commands and the folder they are in');
  assert.ok(uninstall.includes(`\`~/${unpacked[1]}\``) && uninstall.includes(`the folder \`${unpacked[2]}\``), 'Uninstall does not name the folder Node.js was unpacked into');
  assert.ok(uninstall.includes('the folder `snowarch-dl` of your home folder'), 'Uninstall does not name the download folder');
  assert.ok(uninstall.includes('The PATH line that 2d added to `.zshrc` (or `.bash_profile`) can stay'), 'Uninstall does not say what becomes of the PATH line');
  assert.ok(uninstall.includes('The programs from Step 2 stay on your Mac unless you remove them as in step 4.'), 'the sentence under the Uninstall command does not point at step 4');
});

// ───────────────────────────── draw.io and LibreOffice: the two small commands, and the renderers' side ─────────────────────────────

test('ARC-09-C300 — the two small commands of 2f and 2g start the apps the page copied, from the folder 2d puts on PATH, in the bundle layout the product knows', async () => {
  const made = commands.filter((c) => WRAPPER.test(c.line)).map((c) => ({ ...c, m: WRAPPER.exec(c.line) }));
  assert.deepEqual(made.map((c) => [c.m[3], c.heading.slice(0, 2)]), [['drawio', '2f'], ['soffice', '2g']], 'the page does not make `drawio` in 2f and `soffice` in 2g, and nothing else');
  // Each starts the app its step copies out of the disk image.
  assert.deepEqual(made.map((c) => c.m[1]), commands.filter((c) => COPY_APP.test(c.line)).map((c) => COPY_APP.exec(c.line)[2]), 'a small command does not start the app that the step before it copied');
  // The folder they go into is Claude Code's, the first folder of the PATH line of 2d, and the product's own line for Claude Code puts the same folder on PATH.
  const offPath = JSON.parse(read('tools/snowarch/lib/remedies.json')).claudeCode.offPath.darwin;
  assert.ok(offPath.includes('export PATH="$HOME/.local/bin:$PATH"'), 'the product no longer puts ~/.local/bin on PATH when it finds Claude Code off it');
  assert.ok(commands.find((c) => PATH_LINE.test(c.line)).line.includes('export PATH="$HOME/.local/bin:'), 'the folder of the small commands is not the first folder of the PATH line of 2d');
  // The product looks for a bundle with this layout in /Applications, and the page keeps the apps in the home folder: the layout inside the bundle is the same.
  const { DRAWIO_CANDIDATES, SOFFICE_CANDIDATES } = await import(href('tools/snowarch/lib/doctor/checks/engine-prereqs.mjs'));
  const inside = (path) => path.replace(/^\/Applications\//, '');
  const drawioSh = read('scripts/render-drawio.sh');
  const pdfSh = read('scripts/render-pdf.sh');
  const [drawio, soffice] = made;
  assert.equal(inside(DRAWIO_CANDIDATES.posix[0]), `${drawio.m[1]}/Contents/MacOS/${drawio.m[2]}`, 'the doctor\'s first place for draw.io on a Mac is not the layout the page starts');
  assert.equal(inside(/^\s+mac\)\s*\n\s+pick "([^"]+)"/m.exec(drawioSh)?.[1] ?? ''), `${drawio.m[1]}/Contents/MacOS/${drawio.m[2]}`, 'the renderer\'s first place for draw.io on a Mac is not the layout the page starts');
  assert.equal(inside(SOFFICE_CANDIDATES[0]), `${soffice.m[1]}/Contents/MacOS/${soffice.m[2]}`, 'the doctor\'s place for LibreOffice on a Mac is not the layout the page starts');
  assert.ok(pdfSh.includes(`/Applications/${soffice.m[1]}/Contents/MacOS/${soffice.m[2]}`), 'the PDF renderer\'s place for LibreOffice on a Mac is not the layout the page starts');
  // Both renderers look on PATH FIRST, under the names the page gives the commands, and only then in /Applications: that is why the page makes the commands.
  assert.match(drawioSh, /for n in drawio draw\.io draw\.io\.exe; do/, 'the renderer no longer looks for a command called drawio on PATH');
  const pdfCode = pdfSh.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');           // the script's header comment names both places, in the other order
  assert.ok(pdfCode.includes('command -v soffice') && pdfCode.indexOf('command -v soffice') < pdfCode.indexOf('/Applications/LibreOffice.app'), 'the PDF renderer no longer looks for soffice on PATH before it looks in /Applications');
  // The check of 2f: the app and the command, and the order in which `ls` prints two paths (byte order puts the dot first), as the screen shows them.
  const ls = commands.find((c) => /^ls ~\/Applications\//.test(c.line));
  assert.equal(ls?.heading.slice(0, 2), '2f', 'the check of draw.io is not in 2f');
  const paths = ls.line.slice('ls '.length).split(' ');
  assert.deepEqual([...paths].sort(), [`~/Applications/${drawio.m[1]}/Contents/MacOS/${drawio.m[2]}`, '~/.local/bin/drawio'].sort(), 'the check of 2f does not name the app and the command that 2f makes');
  assert.deepEqual(screenAfter(ls.line)?.lines.filter((l) => l.trim() !== ''), paths.map((p) => p.replace('~', '/Users/you')).sort(), 'the screen of the check is not the two paths, home folder written out, in the order `ls` prints them');
  assert.ok(lines.includes('soffice --version') && commands.find((c) => c.line === 'soffice --version').heading.startsWith('2g · '), 'the check of 2g is not `soffice --version`');
  // Each check comes after the command it checks.
  assert.ok(at((c) => c.line === 'soffice --version') > at((c) => c.line === soffice.line), 'the check of LibreOffice comes before the command that makes `soffice`');
  assert.ok(at((c) => c.line === ls.line) > at((c) => c.line === drawio.line), 'the check of draw.io comes before the command that makes `drawio`');
});

test('ARC-09-C300 — the Word converter on a Mac is python3, and the doctor says so in the words the page quotes', async (t) => {
  assert.equal(read('scripts/md-to-docx.py').split('\n')[0], '#!/usr/bin/env python3');
  assert.match(read('scripts/README.md'), /python3 scripts\/md-to-docx\.py/);
  assert.ok(lines.includes('python3 --version'), 'the page no longer lets the reader check python3');
  assert.ok(prose.includes('On a Mac the AI Architect makes its Word documents with python3.'));
  // The check is the fifth of 2e, once. Optional tools keeps python3's row and the sentence, and says where the check is: it has no box of its own.
  assert.equal(commands.filter((c) => c.line === 'python3 --version').length, 1, 'python3 is checked in more than one box');
  assert.ok(commands.find((c) => c.line === 'python3 --version').heading.startsWith('2e · '), 'the check of python3 is not in 2e');
  assert.ok(prose.includes('| python3 | Makes the Word documents on a Mac. It is usually already there; its check is in 2e. |'), 'the row of python3 in Optional tools does not say that its check is in 2e');
  assert.ok(prose.includes('Its check is the fifth command of 2e, and the table there gives the version it needs.'), 'the Word documents section does not say where the check of python3 is');
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

test('ARC-09-C300 — the PATH line writes the line it says, and a window that reads it finds Claude Code and Node.js, with Claude Code\'s folder first', BASH, (t) => {
  const changes = commands.filter((c) => c.line.includes('>>'));
  assert.equal(changes.length, 2);
  for (const { line, heading } of changes) {
    const home = tempDir('install-macos-guide-', t);
    const [, file] = PATH_LINE.exec(line);
    const r = bash(line, { home });
    assert.equal(r.status, 0, `${heading}: ${line} failed: ${r.stderr}`);
    assert.equal(r.stdout + r.stderr, '', `${heading}: the page says the command normally prints nothing: ${r.stdout}${r.stderr}`);
    assert.equal(readFileSync(join(home, `.${file}`), 'utf8'), 'export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"\n', `${heading}: the file holds something other than the one PATH line`);
    // Stand-ins for the two programs, where 2c and 2b put them. A window of the shell that reads the file finds both, Claude Code's folder first, and what
    // was on PATH before is still there after them.
    for (const stand of ['.local/bin/claude', '.local/node/bin/node']) {
      mkdirSync(dirname(join(home, stand)), { recursive: true });
      writeFileSync(join(home, stand), '#!/bin/sh\n', { mode: 0o755 });
    }
    const next = spawnSync('bash', ['-c', `. "$HOME/.${file}" && printf '%s\\n' "$PATH" && command -v claude && command -v node`], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home } });
    assert.equal(next.stdout, `${home}/.local/bin:${home}/.local/node/bin:/usr/bin:/bin\n${home}/.local/bin/claude\n${home}/.local/node/bin/node\n`, `${heading}: a window that reads the file does not find both programs, Claude Code's folder first`);
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

test('ARC-09-C300 — the small commands make `drawio` and `soffice` that pass their arguments on to the app, and the doctor and both renderers find them on PATH', BASH, async (t) => {
  const home = tempDir('install-macos-guide-', t);
  const bin = join(home, '.local', 'bin');
  mkdirSync(bin, { recursive: true });                          // Claude Code's installer makes this folder; 2d puts it on PATH
  const made = commands.filter((c) => WRAPPER.test(c.line)).map((c) => ({ line: c.line, m: WRAPPER.exec(c.line) }));
  assert.equal(made.length, 2);
  for (const { line, m } of made) {
    // The stand-in for the app: where the step before copied the real one. It says how it was started and exits with 3, so a command that does not
    // pass the arguments on, or the exit code, or does not start the app at all, is seen. The real draw.io and LibreOffice are never started here.
    const exe = join(home, 'Applications', m[1], 'Contents', 'MacOS', m[2]);
    mkdirSync(dirname(exe), { recursive: true });
    writeFileSync(exe, '#!/bin/sh\nprintf "%s|%s|%s" "$0" "$1" "$2"\nexit 3\n', { mode: 0o755 });
    const ran = bash(line, { home });
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(ran.stdout + ran.stderr, '', `${m[3]}: the page says the command prints nothing when it works`);
    const wrapper = join(bin, m[3]);
    assert.ok((statSync(wrapper).mode & 0o111) !== 0, `${m[3]} is not executable`);
    assert.equal(readFileSync(wrapper, 'utf8'), `#!/bin/sh\nexec "$HOME/Applications/${m[1]}/Contents/MacOS/${m[2]}" "$@"\n`, `${m[3]}: the file is not the two lines the page means to write`);
    // unlicensed start: the command is the small command the page makes, which starts a stand-in app this case wrote; it reads no licence and starts no product
    const started = spawnSync(wrapper, ['one', 'two words'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home } });
    assert.equal(started.stdout, `${exe}|one|two words`, `${m[3]} does not pass its arguments to the app, or does not start it`);
    assert.equal(started.status, 3, `${m[3]} does not hand the app's exit code back`);
  }
  // The check of 2f, as it prints on a Mac: `ls` of the app and the command, in the order the page shows (byte order, the dot first).
  const ls = commands.find((c) => /^ls ~\/Applications\//.test(c.line)).line;
  const listed = bash(ls, { home });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(listed.stdout.trimEnd().split('\n').map((l) => l.replace(home, '/Users/you')), screenAfter(ls).lines.filter((l) => l.trim() !== ''), 'the screen of the check is not what `ls` prints for the two paths');

  // E-04 looks for `drawio` and for `soffice` on PATH first: a Mac whose PATH has the folder of 2d finds both apps through the two commands.
  const { capabilityPacks } = await import(href('tools/snowarch/lib/doctor/checks/engine-prereqs.mjs'));
  const packs = capabilityPacks({ env: { PATH: bin }, platform: 'darwin', exists: () => false });
  assert.equal(packs.drawio.how, join(bin, 'drawio'), 'the doctor does not find draw.io through the command of 2f');
  assert.equal(packs.pdf.how, join(bin, 'soffice'), 'the doctor does not find LibreOffice through the command of 2g');

  // The renderers. The one of the diagrams is SOURCED, which defines `find_drawio` and runs nothing, and asked where it would look: it only looks. The
  // one of the PDFs cannot be sourced, so the one line of it that looks is run, and nothing else of it. The folder of PATH leads with the home folder's own.
  const empty = join(home, 'empty');
  mkdirSync(empty);
  const onPath = { PATH: `${bin}:/usr/bin:/bin`, HOME: home };
  // unlicensed start: the case sources the diagram renderer, which only looks for draw.io (find_drawio) and starts nothing
  const sourced = spawnSync('bash', ['-c', 'source "$1" "$2" && find_drawio > /dev/null && printf %s "$DRAWIO"', 'bash', join(root, 'scripts', 'render-drawio.sh'), empty], { encoding: 'utf8', env: onPath });
  assert.equal(sourced.stdout, join(bin, 'drawio'), `the diagram renderer does not choose the command of 2f: ${sourced.stderr}`);
  const lookup = /^SOFFICE="\$\(command -v soffice \|\| true\)"$/m.exec(read('scripts/render-pdf.sh'));
  assert.ok(lookup, 'the PDF renderer\'s line that looks for soffice on PATH is not the one this case runs');
  // unlicensed start: the case runs the one line of the PDF renderer that looks for soffice on PATH, and starts nothing
  const looked = spawnSync('bash', ['-c', `${lookup[0]}; printf %s "$SOFFICE"`], { encoding: 'utf8', env: onPath });
  assert.equal(looked.stdout, join(bin, 'soffice'), 'the PDF renderer does not choose the command of 2g');
});

const DARWIN = { skip: process.platform === 'darwin' ? false : 'disk images are opened on a Mac' };

test('ARC-09-C300 — on a Mac the disk-image steps do what the page says, and the messages of its table are the tools\' own', DARWIN, async (t) => {
  // The commands are the page's, run as the reader runs them, against a synthetic image that holds a stand-in for each app: attach with no folder made for
  // it, copy the app into ~/Applications, detach. The real draw.io and LibreOffice are not touched and nothing is downloaded. The mount point is a folder
  // of the temporary home, and a case that fails still lets go of it (`-force` is the test's, never the page's). One image is made (a Mac takes a few
  // seconds for each) and saved under both names the page downloads.
  // The hook that lets go of the mounts is registered BEFORE the temporary home, so that it runs before the home is removed, never after.
  const mounts = [];
  t.after(() => { for (const mount of mounts) spawnSync('hdiutil', ['detach', '-force', mount], { stdio: 'ignore' }); });
  const home = tempDir('install-macos-guide-', t);
  const dl = join(home, 'snowarch-dl');
  mkdirSync(dl, { recursive: true });
  mkdirSync(join(home, 'Applications'));                        // the page makes it, one step earlier
  const steps = commands.map((c, i) => ({ i, m: HDIUTIL_ATTACH.exec(c.line) })).filter((s) => s.m)
    .map(({ i, m }) => ({ attach: commands[i].line, copy: commands[i + 1].line, detach: commands[i + 2].line, mount: m[1], image: m[2], app: COPY_APP.exec(commands[i + 1].line)[2] }));
  assert.equal(steps.length, 2);
  const src = join(home, 'stand-in');
  for (const { app } of steps) {
    mkdirSync(join(src, app, 'Contents', 'MacOS'), { recursive: true });
    writeFileSync(join(src, app, 'Contents', 'MacOS', 'stand-in'), '#!/bin/sh\necho stand-in\n', { mode: 0o755 });
  }
  const created = spawnSync('hdiutil', ['create', '-quiet', '-volname', 'Stand-in', '-fs', 'APFS', '-srcfolder', src, '-format', 'UDZO', join(dl, steps[0].image)], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  copyFileSync(join(dl, steps[0].image), join(dl, steps[1].image));
  for (const { attach, copy, detach, mount, app } of steps) {
    mounts.push(join(dl, mount));
    const attached = bash(attach, { home });
    assert.equal(attached.status, 0, `${attach}: ${attached.stderr}`);
    assert.equal(attached.stdout + attached.stderr, '', 'the page says the attach prints nothing when it works');
    assert.ok(existsSync(join(dl, mount, app)), 'the app is not in the image at the mount point the page names');
    const copied = bash(copy, { home });
    assert.equal(copied.status, 0, `${copy}: ${copied.stderr}`);
    assert.equal(copied.stdout + copied.stderr, '', 'the page says the copy prints nothing when it works');
    assert.ok((statSync(join(home, 'Applications', app, 'Contents', 'MacOS', 'stand-in')).mode & 0o111) !== 0, 'the app was copied without its executable');
    // The detach can be told "resource busy" while the system is still looking at the image: it is tried again, and said so if it needed to be.
    let detached;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      detached = bash(detach, { home });
      if (detached.status === 0) { if (attempt > 1) t.diagnostic(`${detach} needed ${attempt} tries: ${detached.stderr}`); break; }
      await new Promise((resolveWait) => { setTimeout(resolveWait, 500); });
    }
    assert.equal(detached.status, 0, `${detach}: ${detached.stderr}`);
    assert.equal(detached.stdout + detached.stderr, '', 'the page says the detach prints nothing when it works');
    assert.equal(existsSync(join(dl, mount)), false, 'the mount folder is still there after the detach');
  }
  // The three messages of "If something goes wrong" that come from these tools are what the tools print. Nothing is attached now.
  writeFileSync(join(dl, steps[0].image), 'a web page, saved in place of the image\n');
  const notAnImage = bash(steps[0].attach, { home });
  assert.ok(notAnImage.status !== 0 && notAnImage.stderr.includes('hdiutil: attach failed - image not recognized'), `hdiutil does not answer a file that is no image as the table says: ${notAnImage.stderr}`);
  assert.ok(prose.includes('| hdiutil: attach failed - image not recognized |'), 'the table has no row for an image that is not recognised');
  const notOpen = bash(steps[0].detach, { home });
  assert.ok(notOpen.status !== 0 && notOpen.stderr.includes('hdiutil: detach failed - No such file or directory'), `hdiutil does not answer a detach of an image that is not open as the table says: ${notOpen.stderr}`);
  assert.ok(prose.includes('| hdiutil: detach failed - No such file or directory |'), 'the table has no row for a detach of an image that is not open');
  const noImage = bash(steps[0].copy, { home });
  assert.ok(noImage.status !== 0 && noImage.stderr.replace(`${home}/snowarch-dl`, '…').includes('cp: …/mnt-drawio/draw.io.app: No such file or directory'), `cp does not answer a copy from an image that is not open as the table says: ${noImage.stderr}`);
  assert.ok(prose.includes('| cp: …/mnt-drawio/draw.io.app: No such file or directory (or …/mnt-libreoffice/LibreOffice.app) |'), 'the table has no row for a copy from an image that is not open');
  // The row for a download that did not finish: the three commands that use the file say "No such file or directory" when it is not there (the first run on a Mac met it with draw.io).
  const gone = [['shasum -a 256 ~/snowarch-dl/nothing.dmg', 'No such file or directory'],
    ['tar -xzf ~/snowarch-dl/nothing.tar.gz -C ~/snowarch-dl --strip-components=1', 'No such file or directory'],
    ['hdiutil attach -nobrowse -mountpoint ~/snowarch-dl/mnt-nothing ~/snowarch-dl/nothing.dmg > /dev/null', 'hdiutil: attach failed - No such file or directory']];
  for (const [command, words] of gone) {
    const ran = bash(command, { home });
    assert.ok(ran.status !== 0 && ran.stderr.includes(words), `${command.split(' ')[0]} does not answer a download that is not there with "${words}": ${ran.stderr}`);
  }
  assert.ok(prose.includes('| shasum, tar or hdiutil attach answers No such file or directory |'), 'the table has no row for a download that did not finish');
});

// ───────────────────────────── the first run on a Mac (19 November 2026): Step 1 and Step 2 ─────────────────────────────
// A person ran Step 1 and Step 2 on a company MacBook with Apple silicon, as a Standard user. What that run found is held below: a long command that broke in two at a
// paste, the installer's own screen and its two suggestions, five checks in 2e (python3 joins them), the size of each download and the end of curl's table, and
// the rows of "If something goes wrong" that follow. The record itself is the closing paragraph, held above.

test('ARC-09-C300 — every box is one complete command on its own: none sets a variable, a value or a part for another box', () => {
  // The first run on a Mac pasted a long download line and it broke in two. The repair is to copy the whole box again, which only works if the box is the whole
  // command. A first answer, the address in a variable that the next box used, was withdrawn: a reader merged the two boxes into one line, and a broken line went
  // into ~/.zshrc and left PATH unset.
  const sets = commands.filter((c) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(c.line));
  assert.deepEqual(sets.map((c) => `${c.heading}: ${c.line}`), [], 'a box sets a variable that another box would have to use');
  // The one value that outlives its box is the company proxy of "If something goes wrong", and the page says that it lasts for that window only.
  assert.deepEqual(commands.filter((c) => /^export\b/.test(c.line)).map((c) => c.line.split('=')[0]), ['export HTTPS_PROXY']);
  assert.ok(prose.includes('This lasts only as long as this window'), 'the page does not say that the proxy lasts for one window');
  // Every download carries its whole address in its own box.
  for (const c of commands.filter((x) => /^curl\b/.test(x.line))) assert.match(c.line, / https:\/\/[^\s$"'`]+( \| bash)?$/, `${c.heading}: a download whose address is not in the box: ${c.line}`);
});

test('ARC-09-C300 — 2a says what Apple\'s Command Line Tools are for and that the reader need not wait for them: 2b to 2d, 2f and 2g meanwhile, 2e and Step 4 after', () => {
  const part = fold(sectionOf('2a · Git (Apple\'s Command Line Tools)'));
  for (const s of ['Apple\'s free developer tools for Terminal. Besides Git, which Step 4 needs, they bring python3, which the Word documents need.',
    'The install can take a while, and you need not wait for it: do 2b, 2c, 2d, 2f and 2g meanwhile. 2e and Step 4 need it finished. When the window says that the software was installed, click **Done**.',
    'It is the only step of this guide that needs an administrator.']) {
    assert.ok(part.includes(s), `2a lacks: ${s}`);
  }
  // What it says is true of the page: the programs that come with the tools are used in 2e (checked) and Step 4 (git), and in none of the steps it says to do meanwhile.
  const used = (heading) => commands.filter((c) => c.heading.startsWith(heading)).map((c) => c.line);
  for (const h of ['2b · ', '2c · ', '2d · ', '2f · ', '2g · ']) {
    for (const line of used(h)) assert.doesNotMatch(line, /^(?:git|python3|xcode-select)\b/, `${h}: ${line} needs the Command Line Tools, and 2a says that the reader need not wait for them`);
  }
  assert.ok(used('2e · ').includes('git --version') && used('2e · ').includes('python3 --version'), '2e is where git and python3 are checked');
  assert.ok(used('Step 4 · ').some((l) => l.startsWith('git ')), 'Step 4 is where git is used');
});

test('ARC-09-C300 — 2c shows the installer\'s own screen, with its setup note, and says to skip both of its suggestions because 2d comes next', () => {
  const install = 'curl -fsSL https://claude.ai/install.sh | bash';
  const shown = screenAfter(install);
  assert.ok(shown?.heading.startsWith('2c · '), 'the install of Claude Code has no screen under 2c');
  const screen = shown.lines.map((l) => l.trim());
  assert.ok(shown.label.startsWith('On screen (an example; your version number may differ)'), `the label of the screen of 2c: ${shown.label}`);
  // The installer's note and its line are the ones the product knows for Claude Code off PATH (B00, ARC-09-C270): one folder, Claude Code's.
  const fix = JSON.parse(read('tools/snowarch/lib/remedies.json')).claudeCode.offPath.darwin;
  const installerLine = fix.slice(fix.indexOf('echo \''));
  assert.ok(screen.includes(installerLine), `the screen of 2c does not show the installer's line: ${installerLine}`);
  assert.ok(screen.some((l) => l.includes('Native installation exists but ~/.local/bin is not in your PATH. Run:')), 'the screen of 2c lacks the installer\'s note');
  assert.ok(screen.includes('⚠ Setup notes:') && screen.includes('✅ Installation complete!') && screen.includes('✔ Claude Code successfully installed!'), 'the screen of 2c lacks a line of the installer\'s');
  // ...and 2d's line is not that one: it has the second folder, which is why the installer's line must not be run.
  const second = commands.filter((c) => PATH_LINE.test(c.line) && c.line.includes('~/.zshrc'));
  assert.equal(second.length, 1);
  assert.notEqual(second[0].line, installerLine);
  assert.ok(second[0].line.includes('$HOME/.local/node/bin') && !installerLine.includes('$HOME/.local/node/bin'), 'the installer\'s line adds as many folders as 2d\'s does');
  // The version on the screen is a Claude Code at or above the floor, and the number of 2e is the same release.
  const { floors } = JSON.parse(read('engine.config.json'));
  const version = /^Version: (\d+\.\d+\.\d+)$/.exec(screen.find((l) => l.startsWith('Version: ')) ?? '')?.[1];
  assert.ok(version && atLeast(version, floors.claudeCode), `the version on the screen of 2c is below the floor of ${floors.claudeCode}: ${version}`);
  assert.ok(screens.some((b) => b.lines.includes(`${version} (Claude Code)`)), `the check of 2e does not show Claude Code ${version}, the version 2c shows`);
  // The words: both suggestions are skipped, and what comes next.
  const part = fold(sectionOf('2c · Claude Code'));
  for (const s of ['**Skip both of the installer\'s suggestions.**',
    'Do not run the line under *Setup notes*: it adds only Claude Code\'s folder to PATH, and Node.js would stay off it, while the line of 2d adds both folders, Claude Code\'s and Node.js\'s.',
    'And do not run `claude --help` yet: Terminal does not know `claude` until 2d has been done. 2d comes next, then 2e.']) {
    assert.ok(part.includes(s), `2c lacks: ${s}`);
  }
  // The first command that uses `claude` comes after 2d's line, not before it.
  assert.ok(at((c) => c.line === 'claude --version') > at((c) => PATH_LINE.test(c.line)), 'Claude Code is run before 2d has put it on PATH');
});

test('ARC-09-C300 — 2e checks five programs, one box each, and the table, the example screen and the floors agree: the engine\'s three, and python3\'s 3.9', () => {
  const part = sectionOf('2e · Open a fresh window and check');
  assert.deepEqual(commands.filter((c) => c.heading.startsWith('2e · ')).map((c) => c.line),
    ['claude --version', 'git --version', 'node --version', 'npm --version', 'python3 --version'], 'the five checks of 2e, in the order of the table');
  assert.ok(fold(part).includes('Then run these five commands, one at a time.'));
  const { floors } = JSON.parse(read('engine.config.json'));
  const rows = [...part.matchAll(/^\| (.+?) \| (.+) \|$/gm)].map((m) => [m[1], m[2]]).filter(([k]) => k !== 'Program');
  assert.deepEqual(rows.map(([k]) => k), ['Claude Code', 'Git', 'Node.js', 'npm', 'python3'], 'the table has a row for each of the five programs, in the order of the checks');
  const cell = Object.fromEntries(rows);
  assert.equal(cell['Claude Code'], floors.claudeCode);
  assert.equal(cell.Git, floors.git);
  assert.ok(cell['Node.js'].startsWith(`v${parseInt(floors.node, 10)}. `), 'the Node.js row does not state the engine\'s major version');
  assert.ok(cell.python3.startsWith('3.9. Apple\'s own python3, which comes with the Command Line Tools of 2a, is 3.9.6 and works.'), `the python3 row: ${cell.python3}`);
  // The example screen: today's answers of a Mac (the first run), each at or above the floor of its row; npm's answer is left out and the page says so.
  const shown = screenAfter('python3 --version');
  assert.ok(shown?.heading.startsWith('2e · '), 'the checks of 2e have no screen');
  assert.deepEqual(shown.lines.filter((l) => l.trim() !== ''), ['2.1.328 (Claude Code)', 'git version 2.50.1 (Apple Git-155)', 'v26.13.1', 'Python 3.9.6']);
  const answer = (re) => re.exec(shown.lines.join('\n'))?.[1] ?? '0';
  assert.ok(atLeast(answer(/^(\d+\.\d+\.\d+) \(Claude Code\)$/m), floors.claudeCode), 'the Claude Code on the screen is below its floor');
  assert.ok(atLeast(answer(/^git version (\d+\.\d+\.\d+)/m), floors.git), 'the Git on the screen is below its floor');
  assert.ok(parseInt(answer(/^v(\d+)\./m), 10) >= parseInt(floors.node, 10), 'the Node.js on the screen is below its floor');
  assert.ok(atLeast(answer(/^Python (\d+\.\d+\.\d+)$/m), '3.9'), 'the python3 on the screen is below its floor');
  assert.ok(fold(part).includes('The screen leaves out the answer of `npm --version`, which is npm\'s own version number.'));
  // Without Apple's tools git and python3 open one window instead of answering: the page says what to do, and that a number below the table means old tools.
  assert.ok(fold(part).includes('If `git --version` or `python3 --version` opens the window of 2a instead of answering, the Command Line Tools are not installed yet: finish 2a, then run that command again.'));
  assert.ok(fold(part).includes('do not continue: ask for help, and send these five answers. For git or python3, a number below the table\'s means that Apple\'s Command Line Tools on this Mac are old;'));
});

test('ARC-09-C300 — the 3.9 of the python3 row holds: the Word converter is valid for Python 3.9\'s grammar, and the check can tell a newer grammar', (t) => {
  // `ast.parse(..., feature_version=(3, 9))` refuses what Python 3.9 does not know (a `match` statement, 3.10). It is not a run on 3.9, and a Python older than 3.9 is no
  // reader of this page; it is the part of the claim a test can hold: nobody adds newer syntax to scripts/md-to-docx.py without changing the floor in 2e.
  const parse = (source) => spawnSync('python3', ['-I', '-c', 'import ast, sys; ast.parse(sys.stdin.read(), feature_version=(3, 9))'], { input: source, encoding: 'utf8' });
  const probe = spawnSync('python3', ['-I', '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return t.skip('a python3 that knows feature_version (3.8 or later) is needed to read the converter\'s grammar');
  const converter = parse(read('scripts/md-to-docx.py'));
  assert.equal(converter.status, 0, `scripts/md-to-docx.py is not valid for Python 3.9's grammar, and 2e says 3.9 is enough: ${converter.stderr}`);
  const newer = parse('match 1:\n    case 1:\n        pass\n');
  assert.notEqual(newer.status, 0, 'the check accepts a match statement, which Python 3.9 does not know: it proves nothing about the converter');
  assert.match(newer.stderr, /SyntaxError/);
});

/** How curl's progress table writes a size: in units of 1,048,576 bytes, cut and not rounded. `55.6M` below 100 MiB, `151M` from there on (curl's max5data). */
function curlSize(bytes) {
  const KiB = 1024;
  const MiB = 1024 * KiB;
  if (bytes < 100000) return String(bytes);
  if (bytes < 10000 * KiB) return `${Math.floor(bytes / KiB)}k`;
  if (bytes < 100 * MiB) return `${Math.floor(bytes / MiB)}.${Math.floor(((bytes % MiB) * 10) / MiB)}M`;
  return `${Math.floor(bytes / MiB)}M`;
}

test('ARC-09-C300 — each download says how many bytes the file has and where curl\'s table must end, in words and on the screen: the 100 and the size curl writes for that many bytes', () => {
  for (const name of ['node', 'drawio', 'libreoffice']) {
    const bytes = BYTES[name][versionOf(name)];
    assert.ok(Number.isInteger(bytes), `${name}: add the size of the download to BYTES`);
    const command = commands.find((c) => DOWNLOADS[name].re.test(c.line));
    const size = curlSize(bytes);
    const part = fold(sectionOf(command.heading));
    assert.ok(part.includes(`The file is ${bytes.toLocaleString('en-US')} bytes. When all of it has arrived, the last line of the table starts with \`100\` and shows \`${size}\` twice: the table counts in units of 1,048,576 bytes.`),
      `${name}: the words do not give ${bytes.toLocaleString('en-US')} bytes and ${size}`);
    assert.ok(part.includes('The speed and time columns differ from Mac to Mac; only the `100` and the size must match. If the table stops before `100`, or a message appears, the download did not finish: run the same command again.'),
      `${name}: the words do not say that only the 100 and the size must match, and what to do otherwise`);
    // The screen is the one straight after the download (before its checksum), the table's header is two lines, and its last line is the end of the table for this size.
    const shown = screenAfter(command.line);
    assert.ok(shown?.label.startsWith('On screen (an example; the speed and the times differ)'), `${name}: the label of the screen of the download: ${shown?.label}`);
    assert.ok(blocks.indexOf(shown) < blocks.findIndex((b) => b.kind === 'run' && b.lines.some((l) => l.startsWith('shasum') && l.includes(DOWNLOADS[name].file))), `${name}: the screen of the download comes after its checksum`);
    const rows = shown.lines.filter((l) => l.trim() !== '');
    assert.match(rows[0], /^ {2}% Total {4}% Received % Xferd {2}Average Speed {3}Time {4}Time {5}Time {2}Current$/);
    assert.match(rows[1], /^ {33}Dload {2}Upload {3}Total {3}Spent {4}Left {2}Speed$/);
    assert.match(rows.at(-1), new RegExp(`^100 +${size} +100 +${size} +0 +0 `), `${name}: the last line of the table does not end at ${size}`);
  }
  // curl cuts a size, it does not round it: 158,930,055 bytes are 151.57 MiB, and its table writes 151M, not 152M.
  assert.equal(curlSize(158930055), '151M');
  assert.doesNotMatch(page, /\b152M\b/, 'a size that curl does not write');
});

test('ARC-09-C300 — on a Mac the table on each download screen is the real curl\'s: its two header lines, and the size it writes for a file of exactly that many bytes', DARWIN, (t) => {
  // The system curl of the Mac (/usr/bin/curl) is the one a reader without Homebrew runs, and the one the screens show. A Linux runner's curl is newer and writes the table's
  // header with narrower columns, so the case is a Mac's: asking another curl would test that curl, not the guide.
  const dir = tempDir('install-macos-guide-', t);
  for (const name of ['node', 'drawio', 'libreoffice']) {
    const bytes = BYTES[name][versionOf(name)];
    const file = join(dir, `${name}.bin`);
    writeFileSync(file, '');
    truncateSync(file, bytes);                                        // a sparse file of exactly that many bytes: nothing is written, nothing is downloaded
    const ran = spawnSync('/usr/bin/curl', ['-fL', '-o', '/dev/null', `file://${file}`], { encoding: 'utf8' });
    if (ran.error?.code === 'ENOENT') return t.skip('curl is needed to read its table');
    assert.equal(ran.status, 0, ran.stderr);
    const rows = ran.stderr.split(/[\r\n]+/).filter((l) => l.trim() !== '');
    const screen = screenAfter(commands.find((c) => DOWNLOADS[name].re.test(c.line)).line).lines.filter((l) => l.trim() !== '');
    // The header's WORDS and their order are every curl's; the width of its columns is not (the curl of a newer Ubuntu spaces them closer than macOS's 8.7.1, which the
    // screen shows exactly: the guide's own test holds that spacing). So the real curl is asked for the words, and for the size, which is the point.
    const words = (lines) => lines.map((l) => l.trim().replace(/\s+/g, ' '));
    assert.deepEqual(words(screen.slice(0, 2)), words(rows.slice(0, 2)), `${name}: the header of the table on the screen does not say what curl's says`);
    const real = (/^100 +(\S+) +100 +(\S+) /.exec(rows.at(-1)) ?? []).slice(1);
    assert.deepEqual(real, [curlSize(bytes), curlSize(bytes)], `${name}: curl does not write ${bytes} bytes as the formula of this test does: ${rows.at(-1)}`);
    assert.deepEqual((/^100 +(\S+) +100 +(\S+) /.exec(screen.at(-1)) ?? []).slice(1), real, `${name}: the last line of the table on the screen does not end where curl's does`);
  }
});

test('ARC-09-C300 — "If something goes wrong" has the rows the first run on a Mac added: a download broken at a paste, a PATH line that was not written, a download that did not finish', (t) => {
  const rows = sectionOf('If something goes wrong').split('\n').filter((l) => /^\| .+ \| .+ \|$/.test(l)).map((l) => /^\| (.+?) \| (.+) \|$/.exec(l).slice(1));
  const row = (start) => rows.find(([symptom]) => symptom.startsWith(start));
  // T1: the command broke into two lines at a paste; copy the whole box again and paste it once.
  const pasted = row('curl: (2) no URL specified');
  assert.ok(pasted, 'no row for a download command that broke at a paste');
  assert.ok(pasted[0].includes('zsh: no such file or directory: https://…'));
  assert.ok(pasted[1].includes('The command broke into two lines when it was pasted, so curl got no address, and nothing was downloaded. Copy the whole grey box again with its Copy button, which copies it as one line, and paste it once.'));
  // T4: a fresh window after 2d still says command not found: the check reads the file, and the repair deletes only the broken line.
  const unset = row('command not found: claude (or node, or npm) in a fresh window');
  assert.ok(unset, 'no row for a PATH that stayed unset after 2d');
  for (const s of ['grep -n \'local/node/bin\' ~/.zshrc', 'If it prints nothing, run the PATH command of 2d again.', 'open -e ~/.zshrc', 'delete that line only and type nothing else, save the file, close it, run the PATH command of 2d, and open a fresh window as in 2e.']) {
    assert.ok(unset[1].includes(s), `the row of the unset PATH lacks: ${s}`);
  }
  // ...and the check does what the row says: it prints the line of 2d where 2d wrote it, and nothing where it did not.
  if (process.platform !== 'win32') {
    const home = tempDir('install-macos-guide-', t);
    const other = tempDir('install-macos-guide-', t);
    const line = commands.find((c) => PATH_LINE.test(c.line) && c.line.includes('~/.zshrc')).line;
    assert.equal(bash(line, { home }).status, 0);
    const check = 'grep -n \'local/node/bin\' ~/.zshrc';
    assert.equal(bash(check, { home }).stdout, '1:export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"\n', 'the check does not print the line of 2d');
    writeFileSync(join(other, '.zshrc'), '');
    assert.equal(bash(check, { home: other }).stdout, '', 'the check prints something where 2d wrote nothing');
  }
  // T7: the download before it did not finish (the messages themselves are held where the tools run, in the case that opens disk images).
  const gone = row('shasum, tar or hdiutil attach answers No such file or directory');
  assert.ok(gone, 'no row for a download that did not finish');
  assert.ok(gone[1].includes('The download before it did not finish, or did not happen. Run that step\'s download command again, wait until the table of numbers reaches 100 and the line that ends in `%` comes back, then go on from the line after the download command.'));
  // The rows are in the table once each, and none holds a pipe (a pipe in a cell cuts the row on GitHub).
  assert.equal(new Set(rows.map(([s]) => s)).size, rows.length, 'two rows share a symptom');
});
