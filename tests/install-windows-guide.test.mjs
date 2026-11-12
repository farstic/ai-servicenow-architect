// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C271 — docs/INSTALL-WINDOWS.md is true of the product it describes.
 *
 * The page is for a Windows end user who has nothing installed and follows it from top to bottom, one command at a time. It was written
 * from the first end-to-end install on such a machine (2026-11-12), and a page like that goes wrong in one of two ways: a screen it quotes
 * stops being what the product prints, or a command it tells the reader to type stops being one the product has. This file holds both,
 * and the shape the reader depends on: one command per block, no administrator rights, the licence in place before the installer.
 *
 * WHAT IS DERIVED, AND FROM WHAT. The product's own constants where the product exports them (the plan screen's two orientation lines
 * and its header, the instance sub-command table, the licence file's path); its source text where it does not (the wizard's questions and
 * menus are strings inside functions), so a phrase on the page must occur there verbatim. Nothing here is a copy of the product's text kept
 * for the test: the phrase list names what the PAGE says, and the product is asked whether it still says so.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const href = (rel) => pathToFileURL(join(root, rel)).href;
const PAGE = 'docs/INSTALL-WINDOWS.md';
const page = read(PAGE);

/** Whitespace folded, so a sentence wrapped across two source lines is still one sentence. */
const fold = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * The page's fenced blocks, each with the line that introduces it and the heading it sits under.
 * A line ending `Run:` introduces a command; a line starting `On screen` introduces what the reader sees.
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
const blocks = blocksOf(page);
const runs = blocks.filter((b) => b.kind === 'run');
const screens = blocks.filter((b) => b.kind === 'screen');
/** Every command line the page asks for, in order. */
const commands = runs.flatMap((b) => b.lines.filter((l) => l.trim() !== '').map((line) => ({ line, heading: b.heading })));

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
    ...walk('tools/snowarch/lib', /\.(mjs|json)$/),
  ];
  return fold(files.map(read).join('\n')
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\'/g, "'").replace(/\\"/g, '"')
    // A sentence the source writes as two literals joined with `+` is one sentence on the screen.
    .replace(/['"`]\s*\+\s*['"`]/g, ''));
}

test('ARC-09-C271 — the page has the steps it is read in, and the product points at two of them', () => {
  for (const heading of ['Step 1 · Open PowerShell the normal way', 'Step 2 · Install the programs', '2a · Git for Windows', '2b · Node.js',
    '2c · Claude Code', '2d · Tell Windows where Claude Code is', '2e · Open a fresh window and check', '2f · draw.io Desktop (for the diagrams)',
    'Step 3 · Sign in to Claude Code', 'Step 4 · Download the AI Architect', 'Step 5 · Add your licence', 'Step 6 · Run the installer',
    'Step 7 · Check your licence', 'Step 8 · Start the AI Architect', 'Change settings later', 'Licence renewal', 'New releases',
    'If something goes wrong', 'Uninstall', 'Your data and safety']) {
    assert.match(page, new RegExp(`^#{2,3} ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `no heading "${heading}"`);
  }
  // remedies.json sends a reader whose git or Node.js is missing to "docs/INSTALL-WINDOWS.md, step 2a" and "step 2b".
  const remedies = JSON.parse(read('tools/snowarch/lib/remedies.json'));
  for (const id of ['git', 'node']) {
    const m = /docs\/INSTALL-WINDOWS\.md, step (\d[a-z])/.exec(remedies[id].win32);
    assert.ok(m, `the Windows ${id} remedy no longer names a step of the page: ${remedies[id].win32}`);
    assert.match(page, new RegExp(`^### ${m[1]} · `, 'm'), `the ${id} remedy names step ${m[1]}, which the page does not have`);
  }
});

test('ARC-09-C271 — every command block holds exactly one command', () => {
  assert.ok(runs.length >= 40, `only ${runs.length} command blocks found: the parser lost some`);
  const bad = runs.filter((b) => b.lines.filter((l) => l.trim() !== '').length !== 1);
  assert.deepEqual(bad.map((b) => `${b.heading}: ${b.lines.join(' / ')}`), [],
    'a pasted block of several lines arrived broken on the first end-to-end install, and PowerShell asked a question nobody expected');
});

test('ARC-09-C271 — no command needs administrator rights, changes the machine, or has a hole in it', () => {
  for (const { line, heading } of commands) {
    assert.doesNotMatch(line, /\bwinget\b|msiexec|-Verb\s+RunAs|Set-ExecutionPolicy|\bHKLM\b|\bschtasks\b|\bsc\.exe\b|\bsudo\b/i,
      `${heading}: ${line}`);
    // A PATH change is the user's, never the machine's.
    if (/SetEnvironmentVariable\(/.test(line)) assert.match(line, /, "User"\)$/, `${heading}: this changes more than the user's PATH: ${line}`);
    // Paste-ready: the last time a placeholder was pasted it went into a prompt that stored it.
    assert.doesNotMatch(line, /<[A-Za-z][^>]*>/, `${heading}: a placeholder in a command: ${line}`);
  }
});

test('ARC-09-C271 — a normal window, checked: Win + R, and the one command that reads the integrity level', () => {
  assert.match(page, /Press \*\*Win \+ R\*\*/);
  assert.match(page, /Do not press Ctrl\+Shift\+Enter, and do not choose \*Run as administrator\*/);
  assert.ok(commands.some((c) => c.line === 'whoami /groups | findstr Level'), 'the check of the window\'s level is gone');
  assert.match(page, /`Medium Mandatory Level` means a normal window/);
  assert.match(page, /`High Mandatory Level` means an administrator window/);
});

test('ARC-09-C271 — the licence is in place before the installer, under the name the product reads', async () => {
  const at = (pred) => commands.findIndex(pred);
  const mkdir = at((c) => c.line === 'mkdir .local -Force');
  const copy = at((c) => /^Copy-Item "\$HOME\\Downloads\\LIC-[\d-]+\.json" \.local\\licence\.json$/.test(c.line));
  const boot = at((c) => c.line === '.\\bootstrap.cmd');
  assert.ok(mkdir >= 0 && copy >= 0 && boot >= 0, 'one of the three commands is gone');
  assert.ok(mkdir < copy && copy < boot, 'the folder, then the licence, then the installer');
  // ...and `.local\licence.json` is the file the product reads, spelled the British way.
  const { licencePath } = await import(href('packages/snowarch/dist/licence/state.js'));
  const base = join(root, 'x');
  const rel = licencePath(base).slice(base.length + 1).replaceAll('/', '\\');
  assert.equal(rel, '.local\\licence.json');
  assert.match(page, /spelled with a \*\*c\*\*, the British way/);
  // The renewal puts the new file over the old one with the same command shape.
  assert.ok(commands.filter((c) => /\.local\\licence\.json$/.test(c.line)).length >= 2, 'the renewal command is gone');
});

test('ARC-09-C271 — step 2d is the line the installer prints when it finds Claude Code off PATH', () => {
  // ARC-09-C270: when `claude` is not on PATH and the native installer's file is there, B00 prints the fix for the platform, and the
  // fix ends the line. The page tells the reader the same command in the main steps, so the reader is not sent to a failure to meet it.
  const fix = JSON.parse(read('tools/snowarch/lib/remedies.json')).claudeCode.offPath.win32;
  const command = fix.slice(fix.indexOf('[Environment]::'));
  assert.ok(command.startsWith('[Environment]::SetEnvironmentVariable('), `the product's fix no longer ends in the PowerShell line: ${fix}`);
  assert.equal(commands.filter((c) => c.line === command).length, 1, 'the page does not give the command the installer prints, once');
  assert.match(page, /The installer prints this same command if it ever finds Claude Code installed but its folder not on PATH\./);
});

test('ARC-09-C271 — the plan screen is the product\'s: its two lines, its header, its keys', async () => {
  const { ORIENTATION, HEADER, ackLine } = await import(href('tools/snowarch/lib/plan.mjs'));
  const text = fold(screens.flatMap((b) => b.lines).join('\n'));
  for (const line of [...ORIENTATION, HEADER]) assert.ok(text.includes(fold(line)), `the plan screen on the page lacks: ${line}`);
  // Type 1, Enter; type 2, Enter; Enter. The acknowledgement after the second key is the product's sentence for it.
  assert.ok(text.includes(fold(ackLine({ label: 'Mode', to: 'live', key: '1' }))), 'the screen after choosing live is not the product\'s');
  assert.match(page, /1\. Type `1` and press \*\*Enter\*\*\./);
  assert.match(page, /2\. Type `2` and press \*\*Enter\*\*\./);
  assert.match(page, /3\. Press \*\*Enter\*\* once more\./);
});

/**
 * What the page says on a screen and the product must still say. One phrase per line of a screen that the product writes whole; the
 * lines it assembles from parts (a step number, a count, a path) are matched by their fixed part. Each must be on the page AND in the
 * product's source, so changing either side without the other fails here.
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
  // The plan screen's menus.
  'works from the ServiceNow docs and the specialist skills; no instance',
  'also connects one ServiceNow instance (the wizard asks for URL and login)',
  'live needs a ServiceNow instance (wizard runs in this terminal)',
  'full = whole corpus · skip = none (the doctor will report FAIL)',
  // The end of the install.
  'Health check (quick):',
  'more run with',
  'Next: run',
  // The wizard's line when the store could not be locked (ARC-09-C272); the troubleshooting table quotes its start.
  'Its permissions could not be restricted',
];

test('ARC-09-C271 — the words on the screens are the product\'s, in both directions', () => {
  const product = productText();
  const onPage = fold(page);
  for (const entry of SCREEN_PHRASES) {
    const [shown, written] = Array.isArray(entry) ? entry : [entry, entry];
    assert.ok(onPage.includes(fold(shown)), `the page lacks: ${shown}`);
    assert.ok(product.includes(fold(written)), `the product no longer says (the page still does): ${written}`);
  }
});

test('ARC-09-C271 — the store line of question 7 is the one `storeLine` builds, and the doctor has the check and the repair the page names', async () => {
  // ARC-09-C272: on Windows the wizard says who can read the store from what the save DID, and `storeLine` builds that sentence. The screen of
  // question 7 quotes it, so the page is asked of the function and not of a copy of its words. The store is the checkout's own
  // (`.local\instances.json` in the folder the install runs in), which is where this guide puts it. `{}` is the environment: the second line of
  // a failed lock is spelled for the shell, and an empty one is Windows PowerShell whatever runs the test.
  const { storeLine } = await import(href('packages/snowarch/dist/cli/instance.js'));
  const store = 'C:\\Users\\you\\AI-Arch\\.local\\instances.json';
  const lineOf = (acl) => storeLine(store, 'win32', store, acl, {});
  const screen = fold(screens.flatMap((b) => b.lines).join('\n'));
  const private_ = lineOf({ state: 'created' }).split('\n')[0];
  assert.equal(private_, 'Saved to .local\\instances.json in this folder — readable only by you.');
  assert.ok(screen.includes(fold(private_)), `the screen of question 7 on the page lacks the product's line: ${private_}`);
  // The three ways a save ends with a store only the account can read begin with that sentence; the last adds a line saying what it changed,
  // which Step 4 of the page explains in words.
  for (const acl of [{ state: 'private' }, { state: 'locked', was: null }]) assert.equal(lineOf(acl).split('\n')[0], private_, acl.state);
  assert.match(page, /the wizard adds a line saying who could, and that the permissions were changed just now/);
  // A lock that failed does not say "readable only by you", and it names the repair that the troubleshooting table gives.
  const failed = fold(lineOf({ state: 'failed', reason: 'Access is denied.' }));
  assert.ok(!failed.includes('readable only by you'), 'a lock that failed was reported as private');
  assert.ok(failed.includes('.\\snowarch.cmd doctor --fix tries again'), `the failed line no longer names the doctor's repair: ${failed}`);
  assert.match(page, /Run \.\\snowarch\.cmd doctor --fix\. It shows what it will change and changes it when you press Enter\./);
  assert.match(page, /`\.\\snowarch\.cmd doctor --fix` repairs it after showing what it will change/);
  // ...and the doctor has what the page names: SV-02 reads the store's permissions, `--fix` is its flag, F9 is the repair that locks the folder.
  assert.match(read('packages/snowarch/src/doctor/checks.ts'), /id: 'SV-02',\s*title: 'store'/);
  const { COMMANDS } = await import(href('tools/snowarch/lib/cli.mjs'));
  assert.match(String(COMMANDS.doctor.usage({})), /\[--fix\]/);
  assert.match(read('tools/snowarch/lib/doctor/fix.mjs'), /id: 'F9', kind: 'store-acl'/);
  // The lock is to the account and SYSTEM; the doctor also accepts the administrators, because they can take a file over, and the page says both.
  assert.match(page, /so that only your account and the system can read them \(the computer's administrators can always take a file over\)/);
  assert.match(read('packages/snowarch/src/doctor/checks.ts'), /readable only by you \(and SYSTEM and Administrators\)/);
});

test('ARC-09-C271 — the settings commands are the product\'s: each sub-command, with the arguments it takes', async () => {
  const { SUB_COMMANDS } = await import(href('packages/snowarch/dist/cli/help-tables.js'));
  const seen = new Set();
  for (const { line } of commands.filter((c) => c.line.startsWith('.\\snowarch.cmd instance '))) {
    const words = line.split(/\s+/).slice(2);          // after `.\snowarch.cmd instance`
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
  // The permission names the page uses are the six the wizard lists.
  for (const flag of ['WRITE', 'CMDB_WRITE', 'SCRIPTING', 'ATF', 'NOW_ASSIST', 'FLUENT']) assert.match(page, new RegExp(`\\| ${flag} \\|`));
});

test('ARC-09-C271 — the other commands exist: mode, doctor, licence check, upgrade, version', async () => {
  const lines = commands.map((c) => c.line);
  for (const expected of ['.\\snowarch.cmd mode design', '.\\snowarch.cmd mode live', '.\\snowarch.cmd doctor', '.\\snowarch.cmd licence check',
    '.\\snowarch.cmd upgrade --check', '.\\snowarch.cmd upgrade', '.\\snowarch.cmd version']) {
    assert.ok(lines.includes(expected), `the page lacks: ${expected}`);
  }
  // Every `.\snowarch.cmd <verb>` on the page is a verb of the CLI's own table.
  const { COMMANDS } = await import(href('tools/snowarch/lib/cli.mjs'));
  const used = new Set(commands.filter((c) => c.line.startsWith('.\\snowarch.cmd ')).map((c) => c.line.split(/\s+/)[1]));
  for (const verb of used) assert.ok(verb in COMMANDS, `the page uses "${verb}", which the CLI does not have`);
  for (const verb of ['version', 'mode', 'doctor', 'instance', 'upgrade', 'licence']) assert.ok(used.has(verb), `the page no longer uses ${verb}`);
  // The arguments: `upgrade --check` is upgrade's own flag; `mode live|design` are mode's; `licence check` is a licence sub-command.
  assert.match(String(COMMANDS.upgrade.usage({})), /--check/);
  assert.match(String(COMMANDS.mode.usage({})), /\[live\|design\]/);
  assert.match(read('tools/snowarch/lib/commands/licence.mjs'), /check/);
  // The licence states the page explains are the product's, no more and no fewer: the table under Step 7 has one row for each.
  const union = /export type LicenceState = ([^;]+);/.exec(read('packages/snowarch/src/licence/core.ts'));
  assert.ok(union, 'the product no longer declares LicenceState where it did');
  const states = [...union[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const rows = [...page.matchAll(/^\| (ok|expiring|expired|missing|invalid|revoked) \| /gm)].map((m) => m[1]);
  assert.deepEqual([...rows].sort(), [...states].sort(), 'the licence table on the page and the product\'s states disagree');
});

test('ARC-09-C271 — what a reader is told about Node.js is what CI runs', () => {
  const node = /\| Node\.js \| ([^|]*) \|/.exec(page);
  assert.ok(node, 'the version table has no Node.js row');
  assert.match(node[1], /tested with Node\.js 20, 22 and 24 on Windows, macOS and Linux, and with 26 on Windows and Linux/);
  const ci = JSON.parse(read('tests/fixtures/required-contexts.json')).contexts;
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) for (const v of [20, 22, 24]) assert.ok(ci.includes(`test (${os}, node ${v})`));
  assert.ok(ci.includes('test (ubuntu-latest, node 26)') && ci.includes('test (windows-latest, node 26)'));
  assert.equal(ci.includes('test (macos-latest, node 26)'), false);
  // ...and the README and the install page say the same, in the same words.
  for (const rel of ['README.md', 'docs/INSTALL.md']) {
    assert.match(read(rel), /Node\.js ≥ \*\*20\*\* \(22 LTS recommended; 20, 22 and 24 tested on Linux, macOS and Windows, 26 on Linux and Windows\)/, rel);
  }
});

test('ARC-09-C271 — the page is linked from where a Windows reader starts, and carries a release tag the release writes', () => {
  assert.match(read('README.md'), /\]\(docs\/INSTALL-WINDOWS\.md\)/);
  assert.match(read('docs/INSTALL.md'), /\]\(INSTALL-WINDOWS\.md\)/);
  // One clone command, pinned to a release; the release's writer owns the tag (scripts/lib/release/writers.mjs).
  assert.equal(commands.filter((c) => /^git -c advice\.detachedHead=false clone --branch v\d+\.\d+\.\d+ https:\/\/github\.com\/farstic\/snowarch\.git AI-Arch$/.test(c.line)).length, 1);
  // No other release number is written on the page by hand outside the examples the page says are examples.
  assert.match(page, /The screens in this guide are examples\./);
});

test('ARC-09-C271 — the three no-administrator messages are on the page and on the troubleshooting page, in the same words', () => {
  const troubleshooting = read('docs/TROUBLESHOOTING.md');
  for (const message of ['0x8a15000f : Data required by the source is missing', 'The operation was canceled by the user', 'is not recognized']) {
    assert.ok(page.includes(message), `the page lacks: ${message}`);
    assert.ok(troubleshooting.includes(message), `the troubleshooting page lacks: ${message}`);
  }
  // ...and the one command that reloads PATH in the current window is the same on both.
  const reload = '$env:Path = [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")';
  assert.ok(commands.some((c) => c.line === reload), 'the page lacks the command that reloads PATH');
  assert.ok(troubleshooting.includes(reload), 'the troubleshooting page lacks the command that reloads PATH');
});

test('ARC-09-C271 — now-sdk needs npm\'s global folder on PATH: the page puts it there and the modes page says why', () => {
  assert.ok(commands.some((c) => /^\[Environment\]::SetEnvironmentVariable\("Path", .* \+ ";[^"]*;\$env:APPDATA\\npm", "User"\)$/.test(c.line)),
    'step 2b no longer adds %APPDATA%\\npm to the user PATH');
  assert.match(read('docs/MODES-AND-PRESETS.md'), /On Windows npm puts a global tool in `%APPDATA%\\npm`/);
});

test('ARC-09-C271 — the Word converter is run under the PowerShell every Windows has, in every example', () => {
  for (const rel of ['scripts/README.md', 'scripts/md-to-docx.ps1']) {
    const text = read(rel);
    assert.equal(/^\s*pwsh\s+scripts/m.test(text), false, `${rel} still runs a script under pwsh`);
    assert.match(text, /powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\md-to-docx\.ps1 /, `${rel} lacks the Windows PowerShell form`);
  }
  assert.match(read('scripts/README.md'), /`render-pdf-pages\.ps1` needs Word and has not been tested under 5\.1 yet/);
});
