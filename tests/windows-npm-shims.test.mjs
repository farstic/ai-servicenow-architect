// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C310 — no Windows PowerShell command of the three guides runs a bare `npm`, `npx` or a tool that npm installed.
 *
 * A reader who followed docs/INSTALL-WINDOWS.md in Windows PowerShell 5.1 got `npm.ps1 cannot be loaded because running scripts is disabled on this
 * system` at step 2e. The Node.js zip puts `npm.ps1` beside `npm.cmd`; PowerShell takes the script for the bare name; the default policy blocks every
 * script. `npm install -g` does the same for the tools it installs (`now-sdk.ps1` beside `now-sdk.cmd` in `%APPDATA%\npm`). CI's Windows runners allow
 * scripts, so nothing saw it, and the product is not affected (its launchers start PowerShell with `-ExecutionPolicy Bypass`, and it runs npm as
 * `npm.cmd`). What a reader types is the `.cmd` name, which needs no change to the policy.
 *
 * WHAT IS A COMMAND HERE. docs/INSTALL-WINDOWS.md: every block its page introduces with `Run:`. The Windows install page: every command of its data
 * block. The user guide: every command of its data block for Windows PowerShell (`os` win and not Git Bash, and the ones for both computers), and
 * the PowerShell prompt lines of its no-script fallbacks. The macOS guides are not read: a Mac has no such policy.
 *
 * WHAT IS BARE. The first word of a command, and of each command after `;` `|` `||` `&&` `&` `(` `{` and `$(`, is `npm`, `npx`, `corepack`, `pnpm`
 * or `yarn` (what a Node.js zip or an install puts a script beside), or the command of a package a guide installs globally, or any of them spelled with
 * `.ps1`. The commands of a package come from a table here, because a package's name does not say what it installs: a guide that installs a package this
 * table does not know fails until the table names its commands.
 *
 * THE PARSER IS RUN AGAINST PLANTED FORMS first: a guard that has never been shown to fail says nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const NPM_TOOLS = ['npm', 'npx', 'corepack', 'pnpm', 'yarn'];
/** The commands each package a guide installs globally puts on PATH. */
const GLOBAL_COMMANDS = { '@servicenow/sdk': ['now-sdk'] };
const INSTALL_GLOBAL = /\bnpm(?:\.cmd)?\s+(?:install|i)\s+(?:-g|--global)\s+(\S+)/g;

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };
const decode = (s) => s.replace(/&(?:lt|gt|amp|quot|#39);/g, (e) => ENTITIES[e]);

/** The first word of each command a line holds. */
function commandWords(line) {
  return line
    .split(/;|\|\||&&|\||&|\$\(|\(|\{|\r?\n/)
    .map((part) => part.trim().replace(/^[&.]\s*/, '').replace(/^['"]/, ''))
    .map((part) => part.split(/\s+/)[0].replace(/['"]$/, ''))
    .filter(Boolean);
}

/** The words of a line that a Windows PowerShell would resolve to a script (a name with no `.cmd`), given the names to look for. */
function bareScripts(line, names) {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  return commandWords(line).map((w) => w.toLowerCase()).filter((w) => lower.has(w) || (w.endsWith('.ps1') && lower.has(w.slice(0, -4))));
}

/** The packages a command line installs globally, without a version. */
const installedBy = (line) => [...line.matchAll(INSTALL_GLOBAL)].map((m) => m[1].replace(/^(@?[^@]+)@.*$/, '$1'));

// ── the three guides, taken apart ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** docs/INSTALL-WINDOWS.md: the lines of every block introduced by `Run:`. */
function guideCommands() {
  const out = []; let label = ''; let open = null;
  for (const line of read('docs/INSTALL-WINDOWS.md').split('\n')) {
    if (line.startsWith('```')) { if (open) { out.push(...open.lines.filter((l) => l.trim() !== '')); open = null; } else open = { run: /(^|\s)Run:$/.test(label), lines: [] }; continue; }
    if (open) { if (open.run) open.lines.push(line); continue; }
    if (line.trim() !== '') label = line.trim();
  }
  return out;
}
const dataOf = (rel) => JSON.parse(/<script type="application\/json" id="guide-data">([\s\S]*?)<\/script>/.exec(read(rel))[1]);
/** The Windows install page: its data block holds every command. */
const pageCommands = () => dataOf('docs/AI-Architect-Windows-Install-Guide.html').commands.map((c) => c.code);
/** The user guide: the commands for Windows PowerShell and the ones for both computers, and the fallbacks it shows when no script runs. */
function userGuideCommands() {
  const html = read('docs/AI-Architect-User-Guide.html');
  const fromData = dataOf('docs/AI-Architect-User-Guide.html').commands
    .filter((c) => (c.os === 'win' && c.shell !== 'gitbash') || (!c.os && !c.shell)).map((c) => c.code);
  const fallbacks = [...html.matchAll(/<span class="cbox-ps">PS&gt; <\/span>([\s\S]*?)<\/code>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, '')));
  return { fromData, fallbacks };
}

const GUIDES = () => {
  const ug = userGuideCommands();
  return [
    ['docs/INSTALL-WINDOWS.md', guideCommands(), 40],
    ['docs/AI-Architect-Windows-Install-Guide.html', pageCommands(), 40],
    ['docs/AI-Architect-User-Guide.html (data)', ug.fromData, 60],
    ['docs/AI-Architect-User-Guide.html (no-script fallbacks)', ug.fallbacks, 40],
  ];
};

// ── the parser, shown to fail ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C310 — the guard sees a bare npm, npx or installed tool in every place a command can start, and passes the .cmd names and a PATH entry', () => {
  const names = [...NPM_TOOLS, 'now-sdk'];
  const bad = [
    ['npm --version', ['npm']],
    ['npx foo', ['npx']],
    ['cd x; npm ci', ['npm']],
    ['& npx y', ['npx']],
    ['echo hi && npm ci', ['npm']],
    ['echo hi || npm ci', ['npm']],
    ['(npm root -g)', ['npm']],
    ['$root = $(npm root -g)', ['npm']],
    ['Get-Date | npm', ['npm']],
    ['{ npm ci }', ['npm']],
    ['"npm" --version', ['npm']],
    ['NPM --version', ['npm']],
    ['now-sdk --version', ['now-sdk']],
    ['npm.ps1 --version', ['npm.ps1']],
    ['corepack enable; pnpm install; yarn', ['corepack', 'pnpm', 'yarn']],
  ];
  for (const [line, want] of bad) assert.deepEqual(bareScripts(line, names), want, `not seen: ${line}`);
  const good = [
    'npm.cmd --version', 'npx.cmd foo', 'now-sdk.cmd --version', 'cd x; npm.cmd ci', 'claude --version', 'cd npm', 'Write-Output npm',
    'Get-ChildItem $env:APPDATA\\npm',
    '[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:LOCALAPPDATA\\Programs\\node-v26.13.0-win-x64;$env:APPDATA\\npm", "User")',
  ];
  for (const line of good) assert.deepEqual(bareScripts(line, names), [], `a good line was flagged: ${line}`);
  // The install command names its package, with or without a version, and with the .cmd or without it.
  assert.deepEqual(installedBy('npm install -g @servicenow/sdk'), ['@servicenow/sdk']);
  assert.deepEqual(installedBy('npm.cmd i --global @servicenow/sdk@latest'), ['@servicenow/sdk']);
  assert.deepEqual(installedBy('npm.cmd install -g left-pad@1.3.0'), ['left-pad']);
  assert.deepEqual(installedBy('npm.cmd ci'), []);
});

// ── the guides ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C310 — a package a guide installs globally has its commands named here, and the guides install the SDK', () => {
  const installed = new Set(GUIDES().flatMap(([, commands]) => commands.flatMap(installedBy)));
  assert.ok(installed.has('@servicenow/sdk'), 'no guide installs the SDK any more: the derivation of the commands found nothing to derive from');
  for (const pkg of installed) assert.ok(pkg in GLOBAL_COMMANDS, `a guide installs ${pkg}: name the commands it puts on PATH in GLOBAL_COMMANDS, so that the guard can look for them`);
});

test('ARC-09-C310 — no Windows PowerShell command of the three guides runs a bare npm, npx or a tool npm installed', () => {
  const installed = new Set(GUIDES().flatMap(([, commands]) => commands.flatMap(installedBy)));
  const names = [...NPM_TOOLS, ...[...installed].flatMap((p) => GLOBAL_COMMANDS[p] ?? [])];
  assert.ok(names.includes('now-sdk'), 'the commands of the SDK are not among the names looked for');
  const found = [];
  for (const [file, commands, atLeast] of GUIDES()) {
    assert.ok(commands.length >= atLeast, `${file}: only ${commands.length} commands found, so the parser lost some`);
    for (const line of commands) {
      const bare = bareScripts(line, names);
      if (bare.length > 0) found.push(`${file}: ${line}   (bare: ${bare.join(', ')})`);
    }
  }
  assert.deepEqual(found, [],
    'Windows PowerShell takes npm.ps1 for the bare name npm, and the default policy blocks every script: type npm.cmd, npx.cmd and the .cmd of a tool npm installed (now-sdk.cmd)');
});
