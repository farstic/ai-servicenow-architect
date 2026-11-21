// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C306 — docs/AI-Architect-User-Guide.html is the end-user guide as the third page, and what it shows agrees with the product.
 *
 * The page is the third of its kind, after the Windows and the macOS install guides (tests/install-windows-guide-html.test.mjs, tests/install-macos-guide-html.test.mjs):
 * one self-contained file whose data is one JSON block and whose script builds every element itself, with a switch between the two computers and a Copy button on
 * each command. It is the one page for the reader who has installed the AI Architect and now uses it, and its words are the architect's; this file does not hold them.
 * It holds what a page can get wrong without anybody reading it twice:
 *
 *   - THE FILE: one page, nothing fetched, nothing the reader types made into markup, every access to storage in a try, under a prefix of its own.
 *   - THE DATA: the block parses, the boxes in the markup are the commands in the data, and the steps, the contents, the troubleshooting rows and the checks point at what exists.
 *   - THE COMMANDS: every `snowarch` command on the page is in the product's own help tables, with arguments its own parser takes, in the spelling of the computer it is shown for.
 *     Both computers show the same commands. No command is the owner's (the licence issuer's), and no licence number is any but the placeholder.
 *   - THE PRODUCT'S WORDS: the permission flags, their dependencies and the presets, and the licence words, are the product's, and the page's own reading of a licence line
 *     agrees with the line the product prints.
 *   - THE RELEASE: the clone tag and the release the page names are one, the release writer owns them, and the page ships with the product.
 *
 * The behaviour a browser decides (the scroll, the clipboard, the layout) is checked in one, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const href = (rel) => pathToFileURL(join(root, rel)).href;
const PAGE = 'docs/AI-Architect-User-Guide.html';
const html = read(PAGE);
const fold = (s) => s.replace(/\s+/g, ' ').trim();

// The launchers the page types are the product's own spelling of them, never a copy kept here.
const { cliSpelling } = await import(href('packages/snowarch/dist/cli/tty.js'));
const { spellings } = await import(href('tools/snowarch/lib/launcher-spelling.mjs'));
const WHERE = { mac: { platform: 'darwin', env: { SHELL: '/bin/zsh' } }, win: { platform: 'win32', env: {} } };
const CLI = { mac: cliSpelling('darwin', { SHELL: '/bin/zsh' }), win: cliSpelling('win32', {}) };
const BOOT = { mac: spellings(WHERE.mac).bootstrap, win: spellings(WHERE.win).bootstrap };

// ── the page, taken apart ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], body: m[2] }));
const dataScript = scripts.find((s) => /type="application\/json"/.test(s.attrs));
const data = dataScript ? JSON.parse(dataScript.body) : { commands: [], terminals: {}, steps: [], nav: [], need: [], trouble: [], stepTrouble: {}, checks: {}, flags: [], presets: {}, licence: { states: {} } };
const codeScript = scripts.find((s) => !/type=|src=/.test(s.attrs));
const code = codeScript ? codeScript.body : '';
const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(html);
const style = styleMatch ? styleMatch[1] : '';
const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s) => s.replace(/&(?:lt|gt|amp|quot|#39|nbsp);/g, (e) => ENTITIES[e]);
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
/** Every word a reader can see: the markup without its tags and every string of the data block. */
const pageText = fold(`${decode(markup.replace(/<[^>]+>/g, ' '))} ${strings(data).join(' ')}`);
/** A page's page-only commands: the one the page composes from the reader's clicks, and the ones that carry no computer. */
const idsOf = (re, text = markup) => [...text.matchAll(re)].map((m) => m[1]);
const sectionIds = idsOf(/<section\b[^>]*\sid="([^"]+)"/g);

/** A comment may say what the page is not: the script without its comments. */
const bare = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

/** The page's own functions, as they stand: the block between two markers needs the data (`D`), the flag list (`FL`) and the launcher it is asked for (`cli`). */
function pureFunctions() {
  const a = code.indexOf('/* @pure-begin'); const b = code.indexOf('/* @pure-end */');
  assert.ok(a > 0 && b > a, 'the markers around the page\'s pure functions are gone');
  const names = [...code.slice(a, b).matchAll(/^\s*function (\w+)\(/gm)].map((m) => m[1]);
  return new Function('D', 'FL', 'cli', `${code.slice(a, b)}\nreturn { ${names.join(', ')} };`)(data, data.flags, () => CLI.mac);
}
// Read when a case first uses it, so that a page without the block fails the cases that need it and not the whole file.
let pureCache;
const P = new Proxy({}, { get: (_, name) => (pureCache ??= pureFunctions())[name] });

// ── one file, nothing fetched, nothing built from what the reader types ──────────────────────────────────────────────────────────────────────────
test('ARC-09-C306 — one self-contained file: one data block, one script, one font link, and nothing that leaves the page', () => {
  assert.equal(scripts.length, 2, 'the page has the data block and one script, and no other');
  assert.equal(scripts.filter((s) => /src=/.test(s.attrs)).length, 0, 'a script is loaded from somewhere');
  assert.match(dataScript?.attrs ?? '', /id="guide-data"/, 'the data block is not the one the script reads');
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 1, `one link is allowed, the fonts: ${links.join(' ')}`);
  assert.match(links[0], /^<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Archivo[^"]*family=IBM\+Plex\+Mono[^"]*">$/);
  assert.doesNotMatch(markup.replace(links[0], ''), /<(?:img|iframe|object|embed|video|audio|source|form|base)\b|\b(?:src|srcset)\s*=/i, 'the page loads something');
  assert.equal([...html.matchAll(/<style\b/g)].length, 1, 'one style block: the contrast checks read the first and would not see a second');
  assert.doesNotMatch(style, /@import|url\(/, 'the style loads something');
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts)\b|\bimport\s*\(/, 'the script talks to the network');
  assert.match(html, /<html lang="en" data-theme="light">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<title>AI Architect — user guide<\/title>/);
  assert.match(markup, /<noscript>[\s\S]*?\S[\s\S]*?<\/noscript>/, 'the page without a script says so, and what it still shows');
  // Every link of the markup stays on the page, except the font sheet: the page is read from a disk, with nothing to follow to.
  const hrefs = idsOf(/\shref="([^"]*)"/g);
  assert.ok(hrefs.length >= 100, `${hrefs.length} links: the page lost its contents`);
  assert.deepEqual(hrefs.filter((h) => !h.startsWith('#') && !h.startsWith('https://fonts.googleapis.com/')), [], 'a link leaves the page');
});

test('ARC-09-C306 — nothing the reader types or pastes is ever made into markup', () => {
  assert.doesNotMatch(code, /\.(?:innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|\.html\(/);
  assert.doesNotMatch(code, /set(?:Timeout|Interval)\(\s*['"`]/, 'a timer is given a string to run');
  assert.doesNotMatch(markup, /\son[a-z]+\s*=/i, 'a handler sits in the markup');
});

test('ARC-09-C306 — the saved state: the keys of this page under its own prefix, and every access to storage in a try', () => {
  // Three pages opened from disk can share one storage (Chrome keeps one for file pages in some versions): the Windows page writes `aiarch.…`, the macOS page `aiarch-mac.…`.
  assert.match(code, /var P = 'aiarch-guide\.';/, 'the prefix of this page is not aiarch-guide.');
  const suffixes = new Set([...code.matchAll(/\bP \+ '([\w.]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...suffixes].sort(), ['chk', 'client', 'cmd.', 'label', 'lic', 'mode', 'need', 'os', 'reached', 'theme', 'url', 'view']);
  assert.doesNotMatch(code, /['"`]aiarch(?:-mac)?\./, 'a key of the Windows page or the macOS page: its marks would be read, and cleared, as this page\'s');
  const outside = code.split('\n').filter((l) => /localStorage/.test(l) && !/\btry\b/.test(l));
  assert.deepEqual(outside, [], 'storage is read or written outside a try: the page must work when it is blocked');
});

// ── the data and the markup ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A command the page composes from what the reader clicks, so that no box in the markup holds it. */
const COMPOSED = ['c-builder'];

test('ARC-09-C306 — the data block parses, and the boxes in the markup are the commands in the data', () => {
  assert.deepEqual(Object.keys(data).sort(), ['checks', 'commands', 'endTarget', 'flags', 'gl', 'licence', 'nav', 'need', 'presets', 'release', 'sim', 'stepTrouble', 'steps', 'terminals', 'timed', 'trouble']);
  const ids = data.commands.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'two commands share an id, and the id is the saved state');
  for (const c of data.commands) {
    assert.equal(typeof c.code, 'string', `${c.id}: no code`);
    assert.ok(c.code.trim() !== '' && !c.code.includes('\n'), `${c.id}: a box holds one command on one line`);
    assert.ok([undefined, 'mac', 'win'].includes(c.os), `${c.id}: a computer the page does not have: ${c.os}`);
    assert.deepEqual([...c.code.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((t) => !['lic', 'label', 'client', 'base'].includes(t)), [], `${c.id}: a token the page does not fill`);
  }
  const boxes = idsOf(/\sdata-cmd="([^"]+)"/g);
  assert.equal(new Set(boxes).size, boxes.length, 'two boxes show the same command');
  assert.deepEqual([...boxes].sort(), ids.filter((id) => !COMPOSED.includes(id)).sort(), 'the boxes in the markup and the commands in the data differ');
  // Every example screen the markup asks for is in the data, and every screen of the data is asked for, in the markup or in the script.
  const screens = idsOf(/\sdata-term="([^"]+)"/g);
  assert.deepEqual(screens.filter((id) => !(id in data.terminals)), [], 'a screen the data does not have');
  // The design-only form of a screen (`<name>-design`) is asked for by the script, in the mode that has no instance, when its plain form is on the page.
  const designForm = (id) => id.endsWith('-design') && screens.includes(id.slice(0, -'-design'.length)) && code.includes("'-design'");
  const unused = Object.keys(data.terminals).filter((id) => !screens.includes(id) && !designForm(id) && !code.includes(`'${id}'`));
  assert.deepEqual(unused, [], 'a screen nothing asks for');
});

test('ARC-09-C306 — the steps, the contents, the troubleshooting rows and the checks point at what exists', () => {
  const ids = new Set(data.commands.map((c) => c.id));
  assert.ok(sectionIds.length >= 20, `${sectionIds.length} sections`);
  for (const s of data.steps) {
    assert.ok(sectionIds.includes(s.id), `step ${s.id}: no such section`);
    for (const [cid] of s.cmds) assert.ok(ids.has(cid), `step ${s.id}: no command ${cid}`);
  }
  const inSteps = data.steps.flatMap((s) => s.cmds.map((c) => c[0]));
  assert.equal(new Set(inSteps).size, inSteps.length, 'a command is counted in two steps');
  const navIds = data.nav.filter((n) => n.id).map((n) => n.id);
  assert.deepEqual(navIds.filter((id) => !sectionIds.includes(id)), [], 'the contents name a section that is not there');
  assert.deepEqual(sectionIds.filter((id) => !navIds.includes(id)), [], 'a section is missing from the contents');
  const allIds = new Set(idsOf(/\sid="([^"]+)"/g));
  assert.equal(allIds.size, idsOf(/\sid="([^"]+)"/g).length, 'two elements share an id');
  const rows = data.trouble.map((r) => r.id);
  assert.equal(new Set(rows).size, rows.length, 'two troubleshooting rows share an id');
  for (const r of data.trouble) {
    assert.ok(r.see && r.do, `${r.id}: a row with no symptom or no remedy`);
    if (r.href !== undefined) assert.ok(r.href.startsWith('#') && allIds.has(r.href.slice(1)), `${r.id}: the row points at ${r.href}, which is not on the page`);
  }
  for (const [step, list] of Object.entries(data.stepTrouble)) {
    assert.ok(sectionIds.includes(step), `stepTrouble: no section ${step}`);
    for (const id of list) assert.ok(rows.includes(id), `stepTrouble ${step}: no row ${id}`);
  }
  assert.deepEqual(Object.keys(data.checks).sort(), idsOf(/\sdata-chk="([^"]+)"/g).sort(), 'the checks of the data and the check boxes of the markup differ');
  for (const [step, q] of Object.entries(data.checks)) assert.ok(sectionIds.includes(step) && q.q && q.yes, `check ${step}`);
  // The glossary words the markup uses are in the data, and the other way round.
  // (the script keys a word by its letters alone: `Git Bash` is `gitbash`, `AI-Arch folder` is `aiarchfolder`)
  const glossary = new Set(data.gl.map((g) => g[0].toLowerCase().replace(/[^a-z]/g, '')));
  assert.deepEqual(idsOf(/\sdata-gl="([^"]+)"/g).filter((k) => !glossary.has(k)), [], 'a glossary word the data does not define');
});

// ── the commands ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const { COMMANDS, helpText } = await import(href('tools/snowarch/lib/cli.mjs'));
const { SUB_COMMANDS, STORE_SUB_COMMANDS } = await import(href('packages/snowarch/dist/cli/help-tables.js'));
const { parseManageArgs } = await import(href('packages/snowarch/dist/cli/instance-command.js'));
const { parseAddArgs, addHelp } = await import(href('packages/snowarch/dist/cli/instance.js'));
const { runDocs } = await import(href('tools/snowarch/lib/docs/cli.mjs'));

const usageOf = (verb, where = WHERE.mac) => { const u = COMMANDS[verb].usage; return typeof u === 'function' ? u(where) : String(u); };
const docsUsage = (() => { const lines = []; const was = console.error; console.error = (...a) => lines.push(a.join(' ')); try { runDocs([]); } finally { console.error = was; } return lines.join('\n'); })();
const flagsIn = (text) => new Set([...text.matchAll(/--[a-z][a-z-]*/g)].map((m) => m[0]));
/** What every command understands, from the help the CLI prints itself. */
const UNIVERSAL = flagsIn(/every command understands: ([^\n]+)/.exec(helpText(WHERE.mac))?.[1] ?? '');

/** The licence help, split at the line that says what is the owner's: the sub-commands above it are the reader's, the ones below are the licence issuer's. */
const licenceUsage = usageOf('licence');
const OWNER_AT = licenceUsage.indexOf('the owner\'s');
const subCommandsOf = (text) => [...text.matchAll(/^ {2}([a-z][a-z-]*)\b/gm)].map((m) => m[1]);
const READER_LICENCE = subCommandsOf(licenceUsage.slice(0, OWNER_AT));
const OWNER_LICENCE = subCommandsOf(licenceUsage.slice(OWNER_AT));

const PLACEHOLDERS = [['{lic}', 'LIC-2026-0000.json'], ['{label}', 'pdi'], ['{client}', 'acme'], ['{base}', 'https://yourinstance.service-now.com'], ['<environment>', 'pdi'], ['<prod-label>', 'prod']];
const filled = (code) => PLACEHOLDERS.reduce((s, [k, v]) => s.replaceAll(k, v), code);
const words = (s) => [...s.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);

/**
 * What a `snowarch` command on the page is: the launcher it is typed with, and the words after it. A page-only command (the one the builder composes) has no launcher.
 * The launcher a command is shown with, an environment variable put before it, and the Windows form of that variable on a line of its own: none of them is a word of the command.
 */
function parse(c) {
  const text = filled(c.code).replace(/^SNOWARCH_MASK=\S+ /, '');
  const launcher = [CLI.mac, CLI.win].find((l) => text.startsWith(`${l} `) || text === l);
  if (launcher) return { launcher, args: words(text.slice(launcher.length)) };
  if (/^(?:instance|licence|docs|doctor|mode|store|status|upgrade|version|help)\b/.test(text)) return { launcher: null, args: words(text) };
  return null;
}

/** Why a command is not the product's, as a list: empty when its verb, its sub-command and its arguments are all in the product's tables and accepted by its parser. */
function refused(os, c) {
  const p = parse(c);
  if (p === null) return [];
  const why = [];
  const want = os === undefined ? [null, CLI.mac, CLI.win] : [CLI[os]];
  if (!want.includes(p.launcher)) why.push(`typed with ${p.launcher}, not with the launcher of ${os}`);
  const [verb, ...rest] = p.args;
  if (verb !== 'help' && !(verb in COMMANDS)) return [...why, `${verb} is not a command of the CLI`];
  const [sub, ...tail] = rest;
  if (verb === 'instance') {
    if (sub === 'add') {
      const r = parseAddArgs(tail);
      if (!r.ok && !r.needsLabel) why.push(`instance add: ${r.message}`);
      for (const f of tail.filter((w) => w.startsWith('--'))) if (!flagsIn(addHelp()).has(f.split('=')[0]) && !UNIVERSAL.has(f)) why.push(`instance add ${f} is in no help`);
    } else if (!(sub in SUB_COMMANDS)) why.push(`instance ${sub} is not a sub-command`);
    else {
      const r = parseManageArgs(sub, tail);
      if (!r.ok) why.push(`instance ${sub}: ${r.message}`);
    }
  } else if (verb === 'store') {
    if (!(sub in STORE_SUB_COMMANDS)) why.push(`store ${sub} is not a sub-command`);
    else for (const f of tail.filter((w) => w.startsWith('--'))) if (!flagsIn(STORE_SUB_COMMANDS[sub].usage).has(f)) why.push(`store ${sub} ${f} is in no help`);
  } else if (verb === 'licence') {
    if (!READER_LICENCE.includes(sub)) why.push(`licence ${sub} is not a sub-command for the reader (${READER_LICENCE.join(', ')})`);
    else {
      const line = licenceUsage.split('\n').find((l) => new RegExp(`^ {2}${sub}\\b`).test(l)) ?? '';
      for (const f of tail.filter((w) => w.startsWith('--'))) if (!flagsIn(line).has(f) && !UNIVERSAL.has(f)) why.push(`licence ${sub} ${f} is in no help`);
    }
  } else if (verb === 'docs') {
    if (!['sync', 'verify', 'status', 'lookup', 'family'].includes(sub) || !new RegExp(`\\b${sub}\\b`).test(docsUsage)) why.push(`docs ${sub} is not a sub-command`);
    for (const f of tail.filter((w) => w.startsWith('--'))) if (!flagsIn(docsUsage).has(f) && !UNIVERSAL.has(f)) why.push(`docs ${f} is in no help`);
    if (tail.includes('--mode')) {
      const mode = tail[tail.indexOf('--mode') + 1];
      const named = /--mode ([a-z|]+)/.exec(docsUsage)?.[1].split('|') ?? [];
      if (!named.includes(mode)) why.push(`docs --mode ${mode}: the product's modes are ${named.join(' and ')}`);
    }
  } else if (verb === 'mode') {
    if (sub !== undefined && !sub.startsWith('--') && !['live', 'design'].includes(sub)) why.push(`mode ${sub}: the table has live and design`);
    for (const f of rest.filter((w) => w.startsWith('--'))) if (!flagsIn(usageOf('mode')).has(f) && !UNIVERSAL.has(f)) why.push(`mode ${f} is in no help`);
    const at = rest.indexOf('--register');
    if (at >= 0 && !['project', 'local', 'user'].includes(rest[at + 1])) why.push(`mode --register ${rest[at + 1]}`);
  } else if (verb !== 'help') {
    for (const f of rest.filter((w) => w.startsWith('--'))) if (!flagsIn(usageOf(verb)).has(f) && !UNIVERSAL.has(f)) why.push(`${verb} ${f} is in no help`);
    if (verb === 'doctor' && rest.includes('--section')) {
      const sections = /--section <a,b>\s+only these sections: ([^\n]+?)(?: \(|\n|$)/.exec(usageOf('doctor'))?.[1].split(/,\s*/) ?? [];
      const name = rest[rest.indexOf('--section') + 1];
      if (!sections.includes(name)) why.push(`doctor --section ${name}: the sections are ${sections.join(', ')}`);
    }
    if (['status', 'version', 'help'].includes(verb) && rest.some((w) => !w.startsWith('--'))) why.push(`${verb} takes no argument`);
  }
  return why;
}

const shown = data.commands.map((c) => ({ c, p: parse(c) })).filter((x) => x.p !== null);

test('ARC-09-C306 — every command on the page is in the product\'s help tables, with arguments its own parser takes, typed with the launcher of the computer it is shown for', () => {
  assert.ok(shown.length >= 70, `${shown.length} snowarch commands read: the reader found too few`);
  const problems = shown.flatMap(({ c }) => refused(c.os, c).map((why) => `${c.id}: ${why}`));
  assert.deepEqual(problems, []);
  // The verbs a reader of this guide meets are the ones the CLI has; none of the product's commands for the reader goes unmentioned except bootstrap, which has its own page.
  const used = new Set(shown.map((x) => x.p.args[0]));
  for (const verb of ['version', 'docs', 'mode', 'doctor', 'instance', 'store', 'status', 'upgrade', 'licence']) assert.ok(used.has(verb), `the page no longer shows ${verb}`);
  for (const sub of READER_LICENCE) assert.ok(shown.some((x) => x.p.args[0] === 'licence' && x.p.args[1] === sub), `the page no longer shows licence ${sub}`);
  // `snowarch help` is not a row of the CLI's table, and the CLI answers it all the same, as it does --help: it is the one verb allowed past the table.
  assert.ok(!('help' in COMMANDS));
  assert.ok(shown.some((x) => x.p.args[0] === 'help'), 'the page no longer shows help');
});

test('ARC-09-C306 — the check can fail: a verb, a sub-command, an argument, a flag and a launcher the product does not have are each refused', () => {
  const at = (rest, launcher = CLI.mac) => refused('mac', { id: 'planted', code: `${launcher} ${rest}` });
  assert.deepEqual(at('version'), []);
  assert.deepEqual(at('instance list --all'), []);
  assert.deepEqual(at('instance set-preset pdi pdi-developer'), []);
  assert.deepEqual(at('doctor --section host'), []);
  assert.match(at('frobnicate')[0], /not a command of the CLI/);
  assert.match(at('instance frobnicate')[0], /not a sub-command/);
  assert.match(at('instance set-preset pdi')[0], /instance set-preset: /, 'a missing argument is the parser\'s refusal');
  assert.match(at('instance list --nonsense')[0], /unknown option/);
  assert.deepEqual(at('store migrate --dry-run'), []);
  assert.deepEqual(at('store backups'), []);
  assert.match(at('store migrate --nonsense')[0], /in no help/);
  assert.match(at('licence frobnicate')[0], /not a sub-command for the reader/);
  assert.match(at('docs sync --bogus')[0], /in no help/);
  assert.match(at('doctor --section nowhere')[0], /the sections are/);
  assert.match(at('mode sideways')[0], /live and design/);
  assert.match(at('upgrade --nonsense')[0], /in no help/);
  assert.match(at('version', CLI.win)[0], /not with the launcher of mac/, 'the launcher of the other computer is a defect on this one');
});

/** The two commands one computer shows and the other does not: the Git Bash folder change of Windows, and the second of its two forms of the masked wizard. */
const LONE = ['e-gbcd-win', 'i-mask2-win'];

test('ARC-09-C306 — both computers show the same commands: each snowarch command of a Mac has its twin for Windows, and the other way round', () => {
  // A path is spelled as its computer spells it (`~/Downloads/x` and `$HOME\Downloads\x`): the twin has the same arguments, with one separator.
  const spelled = (a) => a.replaceAll('\\', '/').replaceAll('$HOME/', '~/');
  const args = (os) => shown.filter((x) => x.c.os === os && x.p.launcher !== null).map((x) => spelled(x.p.args.join(' '))).sort();
  assert.deepEqual(args('win'), args('mac'), 'the two computers do not show the same snowarch commands');
  assert.ok(args('mac').length >= 35);
  // And the same set of boxes: an id that ends in -mac has its -win beside it, and the other way round, but for the steps one computer has and the other has not.
  const ids = data.commands.map((c) => c.id);
  const twin = (id) => (id.endsWith('-mac') ? id.replace(/-mac$/, '-win') : id.endsWith('-win') ? id.replace(/-win$/, '-mac') : null);
  const lone = ids.filter((id) => twin(id) !== null && !ids.includes(twin(id)));
  assert.deepEqual(lone, LONE, 'a command has no twin on the other computer, or one that had none has one now');
});

// ── no owner-only command, no licence number but the placeholder ──────────────────────────────────────────────────────────────────────────────────
/** The owner's licence commands in a text, as `licence <word>`, and the owner's words with no other use: the key a licence is signed with and the list it is revoked on. */
function ownerOnly(text) {
  const found = [];
  for (const sub of OWNER_LICENCE) for (const m of text.matchAll(new RegExp(`licence\\s+${sub}\\b`, 'gi'))) found.push(m[0]);
  for (const m of text.matchAll(/\b(?:keygen|sign-release|init-list|recovery-out)\b|--key\s+\S+\.(?:key|pem|json)\b/gi)) found.push(m[0]);
  return found;
}

test('ARC-09-C306 — the page shows no command that is the owner\'s: not the licence issuer\'s, not the release\'s', () => {
  assert.deepEqual(READER_LICENCE, ['show', 'verify', 'check'], 'the product\'s licence commands for the reader changed: say here which of them this page may show');
  assert.deepEqual(OWNER_LICENCE, ['keygen', 'issue', 'init-list', 'revoke', 'sign-release'], 'the product has another owner command: the page must not show it');
  // The whole file, every place a command could hide: the markup, the data, the script, and the page as the reader reads it.
  for (const [where, text] of [['the markup', markup], ['the data', JSON.stringify(data)], ['the script', code], ['the page as read', pageText]]) {
    assert.deepEqual(ownerOnly(text), [], `${where} shows an owner command`);
  }
  assert.doesNotMatch(html, /scripts\/(?:release|docs-bump|sign)[\w.-]*\.mjs|npm run (?:release|sign|gen)\b/, 'the page tells the reader to run a maintainer\'s script');
  // The instrument: it finds each spelling when one is planted, in either launcher.
  for (const sub of OWNER_LICENCE) {
    for (const l of [CLI.mac, CLI.win]) assert.ok(ownerOnly(`${l} licence ${sub} --out x`).length >= 1, `${sub}: not found`);
  }
  assert.ok(ownerOnly('keep the recovery-out file safe').length === 1);
  assert.deepEqual(ownerOnly(`${CLI.mac} licence check --refresh and ${CLI.mac} licence show`), [], 'a command the reader may run was reported');
});

const ID = /LIC-\d{4}-\d{4}/gi;
const foreign = (text) => (text.match(ID) ?? []).filter((id) => id.toUpperCase() !== 'LIC-2026-0000');

test('ARC-09-C306 — the only licence number on the page is the placeholder, LIC-2026-0000', () => {
  assert.deepEqual(foreign(html), [], 'a licence number that is not the placeholder is on the page');
  assert.ok((html.match(ID) ?? []).length >= 5, 'the pattern sees the placeholder fewer times than the page shows it');
  assert.match(code, /SAMPLE_LIC = 'LIC-2026-0000\.json'/);
  // The instrument: another year, another case, a number in the data and a number in a screen are each seen; the placeholder in any case is not.
  assert.deepEqual(foreign('lic-2026-0000 and LIC-2026-0000 and Lic-2026-0000'), []);
  assert.deepEqual(foreign('"licence": "LIC-2026-9014.json" and lic-2027-0000'), ['LIC-2026-9014', 'lic-2027-0000']);
});

// ── the product's own words ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C306 — the permission flags, their dependencies and the presets are the product\'s', async () => {
  const { FLAG_NAMES, PRESETS, DEPENDENCIES } = await import(href('packages/snowarch/dist/utils/permissions.js'));
  assert.deepEqual(data.flags.map((f) => `${f.k}_ENABLED`), [...FLAG_NAMES]);
  for (const f of data.flags) assert.deepEqual(f.dep ? [`${f.dep}_ENABLED`] : [], [...DEPENDENCIES[`${f.k}_ENABLED`]], `${f.k} needs another set of flags in the product`);
  assert.deepEqual(Object.keys(data.presets).sort(), Object.keys(PRESETS).sort());
  for (const [name, flags] of Object.entries(PRESETS)) {
    assert.deepEqual(data.flags.filter((f) => flags[`${f.k}_ENABLED`] === 'true').map((f) => f.k), data.presets[name], `preset ${name}`);
    assert.equal(P.presetOf(P.presetFlags(name)), name);
  }
  // The rules of the wizard, as the page applies them: WRITE off takes the two that need it with it, and prod is read-only.
  const off = P.norm({ ...P.presetFlags('full'), WRITE: false }, 'pdi');
  assert.deepEqual([off.WRITE, off.CMDB_WRITE, off.SCRIPTING, off.ATF], [false, false, false, true]);
  assert.equal(P.presetOf(P.norm(P.presetFlags('full'), 'prod')), 'read-only');
  // The command the builder writes is the product's: the launcher of the computer chosen, and the verb the CLI has.
  assert.ok(Object.keys(SUB_COMMANDS).includes('set-preset'), 'the product has no instance set-preset');
  const built = data.commands.find((c) => c.id === 'c-builder');
  assert.ok(built && parse(built)?.args[0] === 'instance' && refused(undefined, built).length === 0, 'the builder\'s command is not one the CLI takes');
});

test('ARC-09-C306 — the licence: the product\'s words, and the page\'s reading of the product\'s line', async () => {
  const core = read('packages/snowarch/src/licence/core.ts');
  const states = /export type LicenceState = ([^;]+);/.exec(core)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(Object.keys(data.licence.states).sort(), states.sort(), 'the page knows other licence words than the product has');
  assert.deepEqual(Object.fromEntries(Object.entries(data.licence.states).map(([w, v]) => [w, v[0]])),
    { ok: 'ok', expiring: 'warn', expired: 'bad', revoked: 'bad', invalid: 'bad', missing: 'bad' });
  const { bannerLine, daysLeftPhrase } = await import(href('tools/snowarch/lib/licence/line.mjs'));
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const line = (s) => bannerLine({ id: 'LIC-2026-0000', scope: 'live', perpetual: false, ...s });
  const severities = (text, mode = 'live') => P.checkLic(text, mode).items.map((i) => i.cls.replace('oci ', ''));
  for (const w of states) assert.equal(severities(bannerLine({ state: w }))[0], data.licence.states[w][0], w);
  assert.deepEqual(severities(line({ state: 'ok', validUntil: day(120) })), ['ok', 'ok']);
  for (const n of [0, 1, 7]) {
    const until = P.checkLic(line({ state: 'expiring', validUntil: day(n) }), 'live').items[1];
    assert.match(until.cls, /warn$/, `${n} days`);
    assert.ok(until.t.includes(daysLeftPhrase(n)), `the page says "${until.t}", the product says "${daysLeftPhrase(n)}"`);
  }
  assert.match(P.checkLic(line({ state: 'ok', validUntil: day(-3) }), 'live').items[1].t, /ended 3 days ago/);
  assert.match(P.checkLic(line({ state: 'ok', perpetual: true }), 'live').items[1].t, /no end date/);
  // A licence for design-only mode: a warning in live mode, which it cannot serve, and nothing to say in design-only.
  assert.equal(P.checkLic(line({ state: 'ok', scope: 'design-only', validUntil: day(90) }), 'live').items.find((i) => i.k === 'Scope').cls, 'oci warn');
  assert.equal(P.checkLic(line({ state: 'ok', scope: 'design-only', validUntil: day(90) }), 'design').items.find((i) => i.k === 'Scope').cls, 'oci ok');
  // No line to read is said as a warning, with the command to run, as the launcher of the page's computer spells it.
  const none = P.checkLic('nothing here', 'live').items[0];
  assert.equal(none.cls, 'oci warn');
  assert.ok(none.t.includes(`${CLI.mac} licence check`), 'the page does not name the command that prints the line');
});

test('ARC-09-C306 — the page spells the launchers as the product does', () => {
  const src = bare(code);
  assert.ok(src.includes(`'${CLI.mac}'`) && src.includes(`'${CLI.win.replaceAll('\\', '\\\\')}'`), 'the script does not spell the launcher of each computer as the product does');
  assert.ok(src.includes(`'${BOOT.mac}'`) && src.includes(`'${BOOT.win.replaceAll('\\', '\\\\')}'`), 'the script does not spell the installer of each computer as the product does');
});

// ── the release, and the shipping ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C306 — the release tag is one: every clone on the page and the release it names agree, and the release writer owns them', async () => {
  const tags = [...html.matchAll(/--branch (v\d+\.\d+\.\d+)(?:-[0-9A-Za-z.]+)? /g)].map((m) => m[1]);
  assert.ok(tags.length >= 2, 'the page clones no release');
  assert.equal(new Set(tags).size, 1, `the page clones more than one release: ${[...new Set(tags)].join(', ')}`);
  assert.equal(data.release, tags[0], 'the release the page names is not the one it clones');
  assert.equal([...html.matchAll(/"release": "v\d+\.\d+\.\d+"/g)].length, 1, 'the release is named once in the data, where the writer moves it');
  for (const c of data.commands.filter((x) => /\bclone\b/.test(x.code))) assert.match(c.code, /^git -c advice\.detachedHead=false clone --branch v\d+\.\d+\.\d+ (?:https:\/\/\S+|<[^>]+>) /, `${c.id}: a clone that is not pinned and quiet`);
  const { writeGuideRelease, STAGED } = await import(href('scripts/lib/release/writers.mjs'));
  assert.ok(STAGED.includes(PAGE), 'the release commit does not stage the page the writer rewrote');
  // 9.x, as the other writer tests: the shapes are what matter.
  const moved = writeGuideRelease(html, '9.9.9', PAGE);
  assert.equal(moved.ok, true);
  assert.equal(JSON.parse(/<script type="application\/json" id="guide-data">([\s\S]*?)<\/script>/.exec(moved.text)[1]).release, 'v9.9.9');
  assert.equal([...moved.text.matchAll(/--branch v9\.9\.9 /g)].length, tags.length, 'the writer did not move every clone line');
  assert.equal(moved.text.replaceAll('v9.9.9', tags[0]), html, 'the writer changed more than the clone tags and the release');
  const rc = writeGuideRelease(html, '9.9.9-rc.1', PAGE);
  assert.deepEqual([rc.ok, rc.skipped, rc.text === html], [true, 'prerelease', true], 'a release candidate leaves the page naming the newest final');
  assert.equal(writeGuideRelease(html.replace(/"release": "v[\d.]+"/, '"x": 1'), '9.9.9', PAGE).ok, false, 'a page whose release field is gone must refuse, not pass');
  assert.equal(writeGuideRelease(html.replaceAll(/--branch v[\d.]+/g, '--branch main'), '9.9.9', PAGE).ok, false);
});

test('ARC-09-C306 — the page ships: it is covered by the signed manifest, as the two install guides are', async () => {
  const { COVERAGE } = await import(href('packages/snowarch/dist/licence/integrity.js'));
  assert.ok(COVERAGE.covers.includes(PAGE), 'the page is not in COVERAGE (packages/snowarch/src/licence/integrity.ts, and dist)');
  assert.match(read('packages/snowarch/src/licence/integrity.ts'), /'docs\/AI-Architect-User-Guide\.html'/);
  // What `shippedFiles` keeps of a tree (the files tracked at HEAD that this decides are covered), asked of the page itself, so the answer does not wait for a commit.
  const { isCovered } = await import(href('tools/snowarch/lib/licence/manifest.mjs'));
  assert.equal(isCovered(PAGE, COVERAGE), true, 'the staged distribution tree would not hold the page');
  // The install guides and the operator's guide it sits beside are covered too, so the three pages a reader opens after the install are one set.
  for (const beside of ['docs/AI-Architect-Windows-Install-Guide.html', 'docs/AI-Architect-macOS-Install-Guide.html', 'docs/USER-GUIDE.md']) assert.ok(COVERAGE.covers.includes(beside), beside);
});

test('ARC-09-C306 — the files the page names are in the tree', () => {
  // A path the page names is one the reader is told to open, or run, in the folder the install made. A folder of the reader's own (clients/, .local/) is not in the tree.
  const named = new Set([...pageText.matchAll(/(?<![\w./~-])((?:docs|scripts|templates|governance)\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[a-z]{2,4})\b/g)].map((m) => m[1]));
  for (const rel of ['CLAUDE.md', 'README.md']) if (new RegExp(`(?<![\\w./-])${rel.replace('.', '\\.')}\\b`).test(pageText)) named.add(rel);
  assert.ok(named.size >= 4, `${named.size} paths read: the pattern found too few`);
  assert.deepEqual([...named].filter((rel) => !existsSync(join(root, rel))), [], 'the page names a file that is not in the tree');
});
