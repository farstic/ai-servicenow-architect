// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C300 — docs/AI-Architect-macOS-Install-Guide.html is the same guide as docs/INSTALL-MACOS.md, and what it computes agrees with the product.
 *
 * The page is the interactive form of the macOS guide, the twin of the Windows page (tests/install-windows-guide-html.test.mjs): the same steps, with a
 * Copy button on each command and helpers that read what the reader pastes back. A second copy of a guide is a second place to go wrong, so this file
 * makes the two one. Every command on the page equals the Markdown guide's, in the same order. The sentences the reviews put on the guide are on both.
 * The sample screens are the guide's. The version floors, the permission presets, the licence words, the label rule and the installer's check keys are
 * the product's own, and the page's helpers run here, as they stand, on lines the product prints (`checkLine`, `bannerLine`), because a helper that
 * reads a line the product does not print is a helper that says "all good" to somebody it should stop.
 *
 * WHAT THE MAC PAGE ADDS to the Windows page's design: the reader chooses a path (A, with the Mac's administrator password, or B, without it) and, on
 * path B, the kind of Mac (Apple silicon or Intel). A command shows only for the choices it belongs to; the bash form of a zsh command sits under it and
 * never counts; the counts a reader sees are 25 commands on path A and 30 on path B. Those rules are functions of the state, in the pure block, so this
 * file runs them.
 *
 * THE PAGE'S DATA IS ONE JSON BLOCK, so this file reads it without a browser; its pure functions sit between two markers and run here without a DOM.
 * The behaviour a browser decides (the scroll, the clipboard, the layout) is checked in one, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const href = (rel) => pathToFileURL(join(root, rel)).href;
const PAGE = 'docs/AI-Architect-macOS-Install-Guide.html';
const html = read(PAGE);
const md = read('docs/INSTALL-MACOS.md');
const fold = (s) => s.replace(/\s+/g, ' ').trim();
// The launcher the page types in Terminal is the product's own spelling of it, not a copy kept here.
const { cliSpelling } = await import(href('packages/snowarch/dist/cli/tty.js'));
const { spellings } = await import(href('tools/snowarch/lib/launcher-spelling.mjs'));
const CLI = cliSpelling('darwin', { SHELL: '/bin/zsh' });
const BOOT = spellings({ platform: 'darwin', env: { SHELL: '/bin/zsh' } }).bootstrap;
/**
 * The launcher a page sentence names, read out from between the words before it and the words after it (each a regex source).
 * The sentence is asserted without the launcher and the launcher is compared with the product's spelling on its own, never written into a string next to prose:
 * the launcher audit looks for the product line that prints such a sentence, and a page sentence has none.
 */
const named = (text, before, after) => new RegExp(`${before}(\\S+)${after}`).exec(text)?.[1];

// ── the page, taken apart ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], body: m[2] }));
const dataScript = scripts.find((s) => /type="application\/json"/.test(s.attrs));
const data = dataScript ? JSON.parse(dataScript.body) : { commands: [], steps: [], nav: [], need: [], trouble: [], stepTrouble: {}, terminals: {}, timed: {}, flags: [], presets: {}, gl: [], preflight: {}, licence: { states: {} }, choices: {} };
const codeScript = scripts.find((s) => !/type=|src=/.test(s.attrs));
const code = codeScript ? codeScript.body : '';
const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(html);
const style = styleMatch ? styleMatch[1] : '';
const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s) => s.replace(/&(?:lt|gt|amp|quot|#39|nbsp);/g, (e) => ENTITIES[e]);
/** Text with the markup that carries no words taken out: backticks, emphasis, quotes and blockquote marks. */
const plain = (s) => fold(s.replace(/[“”"`*]/g, '').replace(/^>\s?/gm, ''));
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const pageText = plain(`${decode(markup.replace(/<[^>]+>/g, ''))} ${strings(data).join(' ')}`);
const mdText = plain(md);

/** The Markdown guide's fenced blocks: the commands it asks for (introduced by `Run:`) in order, and every line any block holds. */
function mdBlocks() {
  const out = []; let label = ''; let open = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) { if (open) { out.push(open); open = null; } else open = { run: /(^|\s)Run:$/.test(label), lines: [] }; continue; }
    if (open) { open.lines.push(line); continue; }
    if (line.trim() !== '') label = line.trim();
  }
  return out;
}
const blocks = mdBlocks();
const mdCommands = blocks.filter((b) => b.run).flatMap((b) => b.lines.filter((l) => l.trim() !== ''));
const mdLines = new Set(blocks.flatMap((b) => b.lines.map((l) => l.trim())));

/** The page's own functions, as they stand: the block between two markers needs only the data (`D`) and the flag list (`FL`). */
const PURE = ['checkUrl', 'checkVersions', 'checkPre', 'checkLic', 'norm', 'presetOf', 'presetFlags', 'labelMessage', 'choiceReady', 'cmdShown', 'isCounted', 'doneKeyOf',
  'navModel', 'nextModel', 'resetState', 'resetKeys', 'resetLabel', 'resetWords', 'resetFlow'];
function pureFunctions() {
  const a = code.indexOf('/* @pure-begin'); const b = code.indexOf('/* @pure-end */');
  assert.ok(a > 0 && b > a, 'the markers around the page\'s pure functions are gone');
  return new Function('D', 'FL', `${code.slice(a, b)}\nreturn { ${PURE.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ')} };`)(data, data.flags);
}
// Read when a case first uses it, so that a page without the block fails the cases that need it and not the whole file.
let pureCache;
const P = new Proxy({}, { get: (_, name) => (pureCache ??= pureFunctions())[name] });

// ── one file, nothing fetched, nothing built from what the reader types ──────────────────────────────────────────────────────────────────────────
test('ARC-09-C300 — one self-contained file: one data block, one script, one font link, and nothing that leaves the page', () => {
  assert.equal(scripts.length, 2, 'the page has the data block and one script, and no other');
  assert.equal(scripts.filter((s) => /src=/.test(s.attrs)).length, 0, 'a script is loaded from somewhere');
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 1, `one link is allowed, the fonts: ${links.join(' ')}`);
  assert.match(links[0], /^<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Archivo[^"]*family=IBM\+Plex\+Mono[^"]*">$/);
  assert.doesNotMatch(markup.replace(links[0], ''), /<(?:img|iframe|object|embed|video|audio|source|form|base)\b|\b(?:src|srcset)\s*=/i, 'the page loads something');
  assert.equal([...html.matchAll(/<style\b/g)].length, 1, 'one style block: the contrast cases read the first and would not see a second');
  assert.doesNotMatch(style, /@import|url\(/, 'the style loads something');
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts)\b|\bimport\s*\(/, 'the script talks to the network');
  assert.match(html, /<html lang="en" data-theme="light">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<title>AI Architect — install guide for macOS<\/title>/);
  assert.match(markup, /<noscript>[\s\S]*docs\/INSTALL-MACOS\.md[\s\S]*<\/noscript>/, 'the page without a script points to the Markdown guide of the Mac');
});

test('ARC-09-C300 — nothing the reader types or pastes is ever made into markup', () => {
  assert.doesNotMatch(code, /\.(?:innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|\.html\(/);
  assert.doesNotMatch(code, /set(?:Timeout|Interval)\(\s*['"`]/, 'a timer is given a string to run');
  assert.doesNotMatch(markup, /\son[a-z]+\s*=/i, 'a handler sits in the markup');
});

test('ARC-09-C300 — the saved state: the keys of the handoff under this page\'s own prefix, and every access to storage in a try', () => {
  // Two pages opened from disk can share one storage (Chrome keeps one for file pages in some versions), and both would read `aiarch.cmd.s2c`: so this page has its own prefix.
  const keys = new Set([...code.matchAll(/'(aiarch-mac\.[a-z.]*)'/g)].map((m) => m[1]));
  assert.deepEqual([...keys].sort(), ['aiarch-mac.chip', 'aiarch-mac.chk', 'aiarch-mac.cmd.', 'aiarch-mac.label', 'aiarch-mac.lic', 'aiarch-mac.mode', 'aiarch-mac.need', 'aiarch-mac.path', 'aiarch-mac.reached', 'aiarch-mac.theme', 'aiarch-mac.url', 'aiarch-mac.view']);
  assert.doesNotMatch(code, /['"`]aiarch\./, 'a key of the Windows page: its marks would be read, and cleared, as this page\'s');
  const bare = code.split('\n').filter((l) => /localStorage/.test(l) && !/\btry\b/.test(l));
  assert.deepEqual(bare, [], 'storage is read or written outside a try: the page must work when it is blocked');
});

// ── the commands ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The command the permissions builder writes is made by the page from what the reader clicks, so the Markdown guide has no line for it.
const PAGE_ONLY = ['c-builder'];
const sub = (c) => c.replaceAll('{lic}', 'LIC-2026-0000.json').replaceAll('{label}', 'pdi');
const pageCommands = data.commands.filter((c) => !PAGE_ONLY.includes(c.id));
const stepOf = (id) => data.steps.find((s) => s.cmds.some((c) => c[0] === id))?.id ?? null;

test('ARC-09-C300 — every command on the page is the Markdown guide\'s, in the same order', () => {
  assert.deepEqual(pageCommands.map((c) => sub(c.code)), mdCommands);
  assert.equal(new Set(data.commands.map((c) => c.id)).size, data.commands.length, 'two commands share an id, and the id is the saved state');
  for (const c of data.commands) assert.deepEqual([...c.code.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((t) => !['lic', 'label'].includes(t)), [], `${c.id}: a token the page does not fill`);
  // The Markdown guide's defaults are the page's: the licence file and the label a reader who types nothing gets.
  assert.match(md, /`LIC-2026-0000\.json`/);
  assert.match(code, /SAMPLE_LIC = 'LIC-2026-0000\.json'/);
  assert.match(code, /\|\| 'pdi'/);
});

test('ARC-09-C300 — the boxes in the markup are the commands in the data, and the steps and helpers point at what exists', () => {
  assert.deepEqual([...markup.matchAll(/data-cmd="([^"]+)"/g)].map((m) => m[1]), pageCommands.map((c) => c.id));
  for (const id of PAGE_ONLY) assert.ok(code.includes(`'data-cmd': '${id}'`), `${id} is not made by the script`);
  const steps = data.steps.flatMap((s) => s.cmds.map((c) => c[0]));
  assert.deepEqual(steps, pageCommands.slice(0, pageCommands.findIndex((c) => c.id === 's8') + 1).map((c) => c.id), 'the steps list the commands of Steps 1 to 8, all of them, every variant included');
  assert.equal(steps.length, 39);
  for (const id of Object.keys(data.timed)) assert.ok(steps.includes(id), `a timer for ${id}, which is not a command of the steps`);
  assert.deepEqual(Object.keys(data.timed).sort(), ['s2c', 's4-clone', 's6']);
  assert.deepEqual([...markup.matchAll(/data-timer="([^"]+)"/g)].map((m) => m[1]).sort(), Object.keys(data.timed).sort());
  const termIds = [...markup.matchAll(/data-term="([^"]+)"/g)].map((m) => m[1]);
  for (const id of termIds) assert.ok(id in data.terminals, `a screen without text: ${id}`);
  assert.deepEqual(Object.keys(data.terminals).filter((id) => !termIds.includes(id)), [], 'a screen nothing shows');
  assert.deepEqual([...markup.matchAll(/data-chk="([^"]+)"/g)].map((m) => m[1]), Object.keys(data.stepTrouble), 'a step with a "did it work" question has its problems, and the other way round');
  // Problems are found by id, so a new row cannot move a link: every id is one row, and every id a step names exists.
  const ids = data.trouble.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [step, rows] of Object.entries(data.stepTrouble)) for (const r of rows) assert.ok(typeof r === 'object' || ids.includes(r), `${step} names a problem that is not there: ${r}`);
  const anchors = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const x of [...data.nav.filter((n) => n.id), ...data.trouble.filter((r) => r.href).map((r) => ({ id: r.href.slice(1) }))]) assert.ok(anchors.has(x.id), `a link to #${x.id}, which the page does not have`);
  for (const m of markup.matchAll(/href="#([^"]+)"/g)) assert.ok(anchors.has(m[1]), `the markup links to #${m[1]}, which the page does not have`);
  assert.ok(data.nav.some((n) => n.id === 'untested') && data.nav.findIndex((n) => n.id === 'untested') === data.nav.findIndex((n) => n.id === 'glossary') - 1, 'the section of what has not been tested has its entry before the glossary');
  // The words with a dotted line show the glossary's own text: each names a term the glossary has.
  const terms = new Set(data.gl.map((g) => g[0].toLowerCase().replace(/[^a-z]/g, '')));
  for (const m of markup.matchAll(/data-gl="([^"]+)"/g)) assert.ok(terms.has(m[1]), `a tooltip for a term the glossary lacks: ${m[1]}`);
  assert.match(markup, /<section class="sec live-only" id="step-6d">/, 'the wizard is for live mode only');
  assert.deepEqual(data.nav.filter((n) => n.live).map((n) => n.id), ['step-6d']);
});

// ── the choices: path, chip, shell ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C300 — the choices: a path, and on path B a chip; the reader must choose, and every attribute a command carries is one the page knows', () => {
  assert.deepEqual(data.choices.path?.options.map((o) => o.v), ['A', 'B']);
  assert.deepEqual(data.choices.chip?.options.map((o) => o.v), ['arm64', 'x64']);
  // "default": null on both: a preselected path A and Apple silicon hid the other commands from a reader who did not notice the choice.
  assert.equal(data.choices.path?.default, null);
  assert.equal(data.choices.chip?.default, null);
  assert.equal(data.choices.chip?.path, 'B', 'the chip is asked on path B only');
  assert.equal(data.choices.path?.path, undefined);
  for (const o of [...(data.choices.path?.options ?? []), ...(data.choices.chip?.options ?? [])]) assert.ok(o.t && o.hint, `the option ${o.v} has no text`);
  assert.match(data.choicePrompt, /Choose your path/);
  assert.match(data.choicePrompt, /path B/);
  for (const c of data.commands) {
    if ('path' in c) assert.ok(['A', 'B'].includes(c.path), `${c.id}: path ${c.path}`);
    if ('chip' in c) { assert.ok(['arm64', 'x64'].includes(c.chip), `${c.id}: chip ${c.chip}`); assert.equal(c.path, 'B', `${c.id}: a chip command belongs to path B`); }
    if ('shell' in c) assert.ok(['zsh', 'bash'].includes(c.shell), `${c.id}: shell ${c.shell}`);
    if (c.path || c.chip) assert.equal(stepOf(c.id), 'step-2', `${c.id}: only Step 2 depends on the path or the chip`);
  }
  for (const n of data.need) if ('path' in n) assert.ok(['A', 'B'].includes(n.path), `${n.id}: path ${n.path}`);
  assert.deepEqual(data.need.filter((n) => n.path).map((n) => [n.id, n.path]), [['n-admin', 'A'], ['n-it', 'B']], 'one item for each path');
  assert.equal(data.need.filter((n) => !n.live).filter((n) => n.path === 'A' || !n.path).length, 5, 'five items for a reader on path A in design-only mode');
  // Each chip command has its twin for the other chip right next to it, the same but for the file's name.
  data.commands.forEach((c, i) => {
    if (!c.chip) return;
    const twin = [data.commands[i - 1], data.commands[i + 1]].find((o) => o && o.chip && o.chip !== c.chip && o.path === c.path);
    assert.ok(twin, `${c.id}: no twin for the other chip next to it`);
    assert.equal(c.code.replace(`darwin-${c.chip}`, 'darwin-X'), twin.code.replace(`darwin-${twin.chip}`, 'darwin-X'), `${c.id}: the twin differs by more than the chip`);
  });
  assert.deepEqual(data.commands.filter((c) => c.chip).map((c) => c.id), ['s2b-dl-arm64', 's2b-dl-x64']);
  // The bash form of a zsh command is right under it, for the same path and in the same step; it never counts, and copying it marks the zsh command.
  data.commands.forEach((c, i) => {
    if (!c.altOf) return;
    const before = data.commands[i - 1];
    assert.equal(before?.id, c.altOf, `${c.id}: altOf names ${c.altOf}, and the command just before it is ${before?.id}`);
    assert.equal(c.path, before.path, `${c.id}: not the path of the command it is the form of`);
    assert.equal(stepOf(c.id), stepOf(before.id), `${c.id}: not in the step of the command it is the form of`);
    assert.deepEqual([before.shell, c.shell], ['zsh', 'bash'], `${c.id}: the zsh command comes first and the bash form second`);
    assert.equal(P.isCounted(c), false, `${c.id} counts`);
    assert.equal(P.doneKeyOf(c.id), before.id, `${c.id}: copying it does not mark ${before.id}`);
    assert.equal(P.isCounted(before), true, `${before.id} does not count`);
  });
  assert.deepEqual(data.commands.filter((c) => c.altOf).map((c) => c.id), ['s2b-path-bash', 's2d-bash', 't-path-bash']);
  // A bash command without a zsh twin is a check for a bash reader only: shown to everybody under its label, never counted, never required.
  const bashOnly = data.commands.filter((c) => c.shell === 'bash' && !c.altOf);
  assert.deepEqual(bashOnly.map((c) => c.id), ['s1-bash']);
  for (const c of bashOnly) assert.equal(P.isCounted(c), false);
  for (const c of data.commands.filter((x) => x.shell !== 'bash')) assert.equal(P.isCounted(c), true, `${c.id} does not count`);
  assert.equal(P.doneKeyOf('s1-bash'), 's1-bash');
  assert.equal(P.doneKeyOf('s2d'), 's2d');
  // The four buttons are in the markup with the ids a harness finds them by, and the script fills their words from the data.
  for (const [group, o] of [['path', 'A'], ['path', 'B'], ['chip', 'arm64'], ['chip', 'x64']]) {
    const id = `${group}-${o.toLowerCase()}`;
    assert.match(markup, new RegExp(`<button type="button" id="${id}" data-choice="${group}" data-v="${o}" aria-pressed="false">`), `the button ${id}`);
  }
  assert.match(markup, /id="choice"/, 'the place the Next button takes a reader who has not chosen');
  assert.match(code, /D\.choices/);
});

test('ARC-09-C300 — what a reader sees: a command shows for its path and chip only, Step 2 waits for the choice, and the counts are 25 on path A and 30 on path B', () => {
  const state = (path, chip, done = {}) => ({ path, chip, done, chk: {}, need: {}, active: 'need', reached: 'need' });
  const entry = (id) => ({ ...data.commands.find((c) => c.id === id), step: stepOf(id) });
  const shown = (st) => data.steps.flatMap((s) => s.cmds.map((c) => c[0])).filter((id) => P.cmdShown(entry(id), st));
  const counted = (st) => shown(st).filter((id) => P.isCounted(data.commands.find((c) => c.id === id)));
  for (const [path, chip, n] of [['A', null, 25], ['A', 'arm64', 25], ['A', 'x64', 25], ['B', 'arm64', 30], ['B', 'x64', 30]]) {
    const st = state(path, chip);
    assert.equal(counted(st).length, n, `${path} ${chip}: the commands a reader counts`);
    for (const live of [true, false]) {
      const m = P.nextModel(st, live);
      assert.equal(m.total, n, `${path} ${chip}: the total of the Next button`);
      const perStep = P.navModel(st, live).items.filter((i) => data.steps.some((s) => s.id === i.id)).reduce((sum, i) => sum + (i.count ? Number(i.count.split('/')[1]) : 0), 0);
      assert.equal(perStep, n, `${path} ${chip}: the counts of Contents add up to the total`);
    }
  }
  // Path A: the Command Line Tools, the Node.js installer, the disk image into Applications. Never a path B command, never a chip command.
  const a = shown(state('A', null));
  for (const id of ['s2a-clt', 's2b-pkg', 's2b-pkg-open', 's2f-open', 's2f-test', 's2b-dir', 's2c', 's2d', 's2d-bash', 's2f-dl']) assert.ok(a.includes(id), `path A lacks ${id}`);
  for (const id of ['s2a-check', 's2b-dl-arm64', 's2b-dl-x64', 's2b-mkdir', 's2b-unz', 's2b-path', 's2b-path-bash', 's2f-appdir', 's2f-open-b', 's2f-appdir-open', 's2f-test-b', 's2f-cmd']) assert.equal(a.includes(id), false, `path A shows ${id}`);
  // Path B: the check, the archive for the chip chosen, the home folder; and exactly one of the two downloads.
  const bArm = shown(state('B', 'arm64')); const bX = shown(state('B', 'x64'));
  for (const id of ['s2a-check', 's2b-mkdir', 's2b-unz', 's2b-path', 's2b-path-bash', 's2f-appdir', 's2f-open-b', 's2f-appdir-open', 's2f-test-b', 's2f-cmd']) assert.ok(bArm.includes(id) && bX.includes(id), `path B lacks ${id}`);
  for (const id of ['s2a-clt', 's2b-pkg', 's2b-pkg-open', 's2f-open', 's2f-test']) assert.ok(!bArm.includes(id) && !bX.includes(id), `path B shows ${id}`);
  assert.deepEqual([bArm.includes('s2b-dl-arm64'), bArm.includes('s2b-dl-x64'), bX.includes('s2b-dl-arm64'), bX.includes('s2b-dl-x64')], [true, false, false, true]);
  // Everything outside Step 2 is the same for every reader, and the bash-only check of Step 1 is shown to all.
  for (const st of [state('A', null), state('B', 'x64'), state(null, null)]) {
    for (const id of ['s1-shell', 's1-bash', 's3-cd', 's3', 's4-cd', 's4-clone', 's4-cd2', 's5a', 's5b', 's5c', 's6', 's7', 's8']) assert.ok(P.cmdShown(entry(id), st), `${id} is hidden`);
  }
  // Until the choices are made, Step 2 has no commands: the page shows the prompt instead. Path B needs its chip too.
  for (const st of [state(null, null), state(null, 'arm64'), state('B', null), state('B', undefined)]) {
    assert.equal(P.choiceReady(st), false);
    assert.deepEqual(shown(st).filter((id) => stepOf(id) === 'step-2'), [], 'Step 2 shows a command before the choices are made');
  }
  assert.deepEqual([state('A', null), state('B', 'arm64'), state('B', 'x64')].map((st) => P.choiceReady(st)), [true, true, true]);
  assert.equal(P.choiceReady({ path: 'C', chip: 'arm64' }), false, 'a saved value that is not an option is not a choice');
  // Next command stops at Step 2: before the choice it names the choice, after Step 1, and no later command is offered first.
  const rest = data.steps.filter((s) => s.id !== 'step-2').flatMap((s) => s.cmds.map((c) => c[0])).filter((id) => P.isCounted(data.commands.find((c) => c.id === id)));
  assert.equal(P.nextModel(state(null, null), true).total, rest.length, 'the total before the choice counts what every reader sees');
  assert.equal(P.nextModel(state(null, null), true).next.cid, 's1-shell');
  const gated = P.nextModel(state(null, null, { 's1-shell': true }), true);
  assert.deepEqual([gated.done, gated.next.gate, gated.next.cid], [1, true, null]);
  assert.match(gated.text, /choose your path/i);
  const ahead = P.nextModel(state('B', null, Object.fromEntries(['s1-shell', 's3-cd', 's3', 's8'].map((c) => [c, true]))), true);
  assert.equal(ahead.next.gate, true, 'a command of a later step must not be offered while the choice is open');
  assert.equal(ahead.done, 4);
  const first = P.nextModel(state('A', null, { 's1-shell': true }), true);
  assert.deepEqual([first.next.cid, first.next.gate], ['s2a-clt', undefined]);
  assert.equal(P.nextModel(state('B', 'x64', { 's1-shell': true }), true).next.cid, 's2a-check');
  // The Contents row of Step 2 does not claim a total it cannot know, and does not call itself complete.
  const waiting = P.navModel(state(null, null), true).items.find((i) => i.id === 'step-2');
  assert.deepEqual([waiting.count, waiting.complete, waiting.passed], ['?', false, false]);
  assert.equal(P.navModel(state('A', null), true).items.find((i) => i.id === 'step-2').count, '0/13');
  assert.equal(P.navModel(state('B', 'arm64'), true).items.find((i) => i.id === 'step-2').count, '0/18');
  // The bash form never counts, and copying it marks the zsh command, so a reader on bash finishes with the same totals; the bash-only check is never required.
  const bash = P.nextModel(state('B', 'x64', { 's1-bash': true, 's2b-path-bash': true, 's2d-bash': true }), true);
  assert.equal(bash.done, 0, 'a bash form was counted');
  const viaZsh = P.nextModel(state('B', 'x64', { 's2b-path': true, 's2d': true }), true);
  assert.equal(viaZsh.done, 2);
  // The checklist has six items per path (five in design-only mode): the item of the path chosen, and none before.
  for (const [path, ids] of [['A', ['n-admin']], ['B', ['n-it']]]) {
    const live = P.navModel(state(path, null), true); const design = P.navModel(state(path, null), false);
    assert.deepEqual([live.needTotal, design.needTotal], [6, 5], `path ${path}`);
    assert.ok(data.need.filter((n) => n.path === path).every((n) => ids.includes(n.id)));
  }
  assert.deepEqual([P.navModel(state(null, null), true).needTotal, P.navModel(state(null, null), false).needTotal], [5, 4], 'before the choice the checklist has no item for a path');
});

// ── the numbers the product owns ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C300 — the version floors are the engine\'s, on the page and in the check', () => {
  const { floors } = JSON.parse(read('engine.config.json'));
  assert.deepEqual(data.floors, floors);
  for (const [name, key] of [['Claude Code', 'claudeCode'], ['Git', 'git']]) assert.match(markup, new RegExp(`<tr><td>${name}</td><td>${floors[key].replaceAll('.', '\\.')}</td></tr>`), `the table of floors shows another ${name} version`);
  assert.match(markup, new RegExp(`<td>v${parseInt(floors.node, 10)}\\. Step 2b installs v26\\.13\\.1\\. The AI Architect is tested with Node\\.js 20, 22, 24 and 26 on Windows, macOS and Linux\\.</td>`));
  // The Node row is true because CI has the cells: Node.js 26 on macOS, for the test suite and for the installer.
  const { contexts } = JSON.parse(read('tests/fixtures/required-contexts.json'));
  for (const cell of ['test (macos-latest, node 26)', 'bootstrap (macos-latest, node 26)']) assert.ok(contexts.includes(cell), `the table says Node.js 26 is tested on macOS, and CI has no cell: ${cell}`);
  // One Node.js version in the downloads, in the table and on the screen of 2e.
  const wanted = [...new Set(data.commands.flatMap((c) => [...c.code.matchAll(/node-v(\d+\.\d+\.\d+)/g)].map((m) => m[1])))];
  assert.deepEqual(wanted, ['26.13.1'], 'the downloads name more than one Node.js version');
  assert.ok(data.terminals.versions.includes('v26.13.1'));
  assert.ok(data.commands.filter((c) => /nodejs\.org/.test(c.code)).length === 3, 'the .pkg and the two archives');
  // The check, on each side of each floor, as a Mac prints them (Apple's own build of git names its build).
  const below = (v) => { const [a, b, c] = v.split('.').map(Number); return c > 0 ? `${a}.${b}.${c - 1}` : b > 0 ? `${a}.${b - 1}.99` : `${a - 1}.99.99`; };
  const cases = { claudeCode: (v) => `${v} (Claude Code)`, git: (v) => `git version ${v} (Apple Git-146)`, node: (v) => `v${v}` };
  const label = { claudeCode: 'Claude Code', git: 'Git', node: 'Node.js' };
  for (const [key, line] of Object.entries(cases)) {
    const rowOf = (v) => P.checkVersions(`${line(v)}\n`).items.find((i) => i.k === label[key]);
    const bad = key === 'node' ? `${parseInt(floors.node, 10) - 1}.9.9` : below(floors[key]);
    assert.match(rowOf(floors[key]).cls, /\bok$/, `${key} at its floor`);
    assert.match(rowOf(bad).cls, /\bbad$/, `${key} below its floor`);
  }
  assert.doesNotMatch(JSON.stringify(P.checkVersions('v20.1.0')), /recommended/);
});

test('ARC-09-C300 — the versions check reads what Terminal prints: the four programs, "command not found" in zsh and in bash, and the prompt of either', () => {
  const full = '2.1.322 (Claude Code)\ngit version 2.39.5 (Apple Git-146)\nv26.13.1\n11.20.0\n';
  const rows = (t) => Object.fromEntries(P.checkVersions(t).items.map((i) => [i.k, i.cls]));
  assert.deepEqual(rows(full), { 'Claude Code': 'oci ok', Git: 'oci ok', 'Node.js': 'oci ok', npm: 'oci ok' });
  assert.equal(P.checkVersions(full).sum, 'All good ✓');
  // What zsh and what bash answer for a program that is not on PATH: one row, for that program, and the others untouched.
  const shapes = { zsh: (n) => `zsh: command not found: ${n}`, bash: (n) => `-bash: ${n}: command not found`, 'bash, no dash': (n) => `bash: ${n}: command not found` };
  const lines = { claude: '2.1.322 (Claude Code)', git: 'git version 2.39.5 (Apple Git-146)', node: 'v26.13.1', npm: '11.20.0' };
  const row = { claude: 'Claude Code', git: 'Git', node: 'Node.js', npm: 'npm' };
  for (const [shell, shape] of Object.entries(shapes)) {
    for (const name of Object.keys(lines)) {
      const text = Object.entries(lines).map(([n, l]) => (n === name ? shape(n) : l)).join('\n');
      const r = rows(text);
      assert.equal(r[row[name]], 'oci bad', `${shell}: ${name} is not found`);
      for (const other of Object.keys(lines).filter((n) => n !== name)) assert.equal(r[row[other]], 'oci ok', `${shell}: ${other} must stay ok when ${name} is missing`);
      assert.match(P.checkVersions(text).items.find((i) => i.k === row[name]).t, /Not found/);
    }
  }
  // A Mac without Apple's Command Line Tools does not say "command not found" for git: it opens a window and prints a line that starts with xcode-select.
  assert.equal(rows('2.1.322 (Claude Code)\nxcode-select: note: No developer tools were found, requesting install.\nv26.13.1\n11.20.0').Git, 'oci bad');
  // What was not pasted is a warning with the command to run, never a pass.
  assert.deepEqual(rows('2.1.322 (Claude Code)\n'), { 'Claude Code': 'oci ok', Git: 'oci warn', 'Node.js': 'oci warn', npm: 'oci warn' });
  // The prompt in front of a line: zsh's, and bash's own on a Mac.
  assert.equal(rows('you@MacBook-Air ~ % npm --version\nyou@MacBook-Air ~ % 11.20.0').npm, 'oci ok');
  assert.equal(rows('MacBook-Air:~ you$ 11.20.0').npm, 'oci ok');
  // No Command Prompt, no PowerShell, no "is not recognized": a Mac does not print them, and the Windows page's branch is gone.
  assert.equal(P.checkVersions("'claude' is not recognized as an internal or external command").items.find((i) => i.k === 'Claude Code').cls, 'oci warn');
  assert.equal(P.checkVersions("'claude' is not recognized as an internal or external command").items.some((i) => i.k === 'Window'), false);
  assert.deepEqual(P.checkVersions('v20.1.0').items.find((i) => i.k === 'Node.js').cls, 'oci ok');
});

test('ARC-09-C300 — the permission flags, their dependencies and the presets are the product\'s', async () => {
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
  // The command the builder writes is the product's: the launcher in the Mac's spelling, and the two verbs the CLI has.
  const written = [...code.matchAll(/'(\S+) instance (set-preset|set-flags) '/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(written, [[CLI, 'set-preset'], [CLI, 'set-flags']], 'the builder does not write the preset command and the flags command, each after the launcher of a Mac');
  const { SUB_COMMANDS } = await import(href('packages/snowarch/dist/cli/instance-command.js'));
  for (const verb of ['set-preset', 'set-flags']) assert.ok(Object.keys(SUB_COMMANDS).includes(verb), `the product has no instance ${verb}`);
});

test('ARC-09-C300 — the licence: the product\'s words, the product\'s line, the product\'s days', async () => {
  const core = read('packages/snowarch/src/licence/core.ts');
  const states = /export type LicenceState = ([^;]+);/.exec(core)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(Object.keys(data.licence.states).sort(), states.sort(), 'the page knows other licence words than the product has');
  assert.deepEqual(Object.fromEntries(Object.entries(data.licence.states).map(([w, v]) => [w, v[0]])),
    { ok: 'ok', expiring: 'warn', expired: 'bad', revoked: 'bad', invalid: 'bad', missing: 'bad' });
  assert.match(core, /export const SCOPES = Object\.freeze\(\['design-only', 'live'\] as const\)/);
  const { bannerLine, daysLeftPhrase } = await import(href('tools/snowarch/lib/licence/line.mjs'));
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const line = (s) => bannerLine({ id: 'LIC-2026-0000', scope: 'live', perpetual: false, ...s });
  const severities = (text, mode = 'live') => P.checkLic(text, mode).items.map((i) => i.cls.replace('oci ', ''));
  for (const w of states) assert.equal(severities(bannerLine({ state: w }))[0], data.licence.states[w][0], w);
  assert.deepEqual(severities(line({ state: 'ok', validUntil: day(120) })), ['ok', 'ok']);
  // Only the product's word `expiring` warns: five days left on an `ok` licence is not one (the product warns from min(30, a third of the term)).
  assert.deepEqual(severities(line({ state: 'ok', validUntil: day(5) })), ['ok', 'ok']);
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
  // The launcher it tells the reader to switch with is the product's own spelling of it (a page sentence no product line carries, so the launcher audit cannot resolve one written here).
  const scope = P.checkLic(line({ state: 'ok', scope: 'design-only', validUntil: day(90) }), 'live').items.find((i) => i.k === 'Scope').t;
  assert.equal(/switch with (\S+) mode design\./.exec(scope)?.[1], CLI);
  assert.equal(named(P.checkLic('nothing here', 'live').items[0].t, 'Paste what ', ' licence check printed\\.'), CLI, 'the licence check names the command to run');
  assert.doesNotMatch(code, /<=\s*14\b/, 'the page has a rule of its own for when to warn');
});

test('ARC-09-C300 — the installer\'s check: the keys are B00\'s, it reads the lines B00 prints, the failing ones too, and the node line that says "not found" is not an ok', async () => {
  const B00 = await import(href('tools/snowarch/lib/steps/B00.mjs'));
  const keys = [...new Set([...read('tools/snowarch/lib/steps/B00.mjs').matchAll(/\b(?:ok|warn|fail)\(\s*'(\w+)'/g)].map((m) => m[1]))];
  assert.deepEqual(data.preflight.keys, keys);
  assert.deepEqual(Object.keys(data.preflight.tips), keys);
  const kind = (check) => P.checkPre(B00.checkLine(check)).items;
  const okAll = P.checkPre(keys.map((id) => B00.checkLine({ id, status: 'ok', detail: 'x' })).join('\n')).items;
  assert.deepEqual(okAll.map((i) => [i.k, i.cls]), keys.map((k) => [k, 'oci ok']));
  // What the installer prints for a failing or a warning check has no key (checkLine: "FAIL B00: <detail>"), so the page reads it from the words.
  const failing = { root: 'not at the repository root — run: cd somewhere', git: 'git not found', claudeCode: 'Claude Code 2.0.1 found, ≥ 2.1.214 required',
    disk: '1.0 GB free, 2.0 GB needed', network: 'github.com unreachable (timed out)', node: 'live mode needs Node.js 20+ — install it', platform: 'darwin ia32 25.6.0 — 32-bit' };
  for (const [id, detail] of Object.entries(failing)) {
    for (const [status, cls] of [['fail', 'bad'], ['warn', 'warn']]) {
      const items = kind({ id, status, detail });
      assert.equal(items.length, 1, `${id} ${status}`);
      assert.deepEqual([items[0].k, items[0].cls], [id, `oci ${cls}`], `${id} ${status}: ${B00.checkLine({ id, status, detail })}`);
      // A FAIL stops the installer, so the reader runs it again; a WARN does not, and the guide says to carry on (6a).
      if (status === 'fail') assert.equal(named(items[0].t, ' Then run ', ' again\\.$'), BOOT, `${id}: the line does not tell the reader to run the installer again`);
      else { assert.match(items[0].t, /does not stop the installer: carry on/, `${id}: a warning that stops the reader`); assert.doesNotMatch(items[0].t, /Then run /, `${id}: a warning that sends the reader back to the installer`); }
    }
  }
  // "login: not verified" is an ok line of the installer's (claude auth status unavailable), not a login to fix; a login the page does not know is one.
  assert.equal(kind({ id: 'claudeCode', status: 'ok', detail: '2.1.322 · login: not verified (claude auth status unavailable)' })[0].cls, 'oci ok');
  assert.equal(kind({ id: 'claudeCode', status: 'ok', detail: '2.1.322 · login: none' })[0].cls, 'oci bad');
  // The shell front of the installer prints `ok B00 node: note: Node.js not found` before it knows the mode: it starts with ok and it is not ok. The plan that follows has no live mode.
  const noNode = read('bootstrap.sh').split('\n').find((l) => /ok B00 node: note: Node\.js not found/.test(l));
  assert.ok(noNode, 'the installer no longer prints the line the page reads as "not found"');
  const found = P.checkPre('ok B00 node: note: Node.js not found — design-only only; live mode needs Node 20+ (install it)').items;
  assert.deepEqual([found.length, found[0].k, found[0].cls], [1, 'node', 'oci bad']);
  assert.match(found[0].t, /Node\.js not found/);
  assert.match(found[0].t, /\bq\b/, 'the reader is told to type q at the plan screen');
  assert.equal(P.checkPre('ok B00 node: 26.13.1 · npm 11.20.0').items[0].cls, 'oci ok', 'a node line with a version is ok');
  assert.match(P.checkPre('nothing of the kind').items[0].t, /No check lines found/);
});

test('ARC-09-C300 — Reset checkmarks, pressed from Step 3: no tick in Contents, % passed of the first section, no mark, Next at 0 of 25 on path A, a label that says so, and what the reader typed and chose kept', () => {
  // The owner pressed it on the Windows page and "nothing seemed to happen": the furthest section reached was set to the one the reader was in, so every tick above the
  // reader stayed, and so did the percentage. The state a reset leaves is a function, so this runs the page's own.
  for (const live of [true, false]) {
    const fresh = { active: 'need', reached: 'need', done: {}, chk: {}, need: {} };
    const ids = P.navModel(fresh, live).ids;
    const first = P.navModel(fresh, live);
    assert.equal(first.pct, `${Math.round(100 / ids.length)}%`, 'the first section is its share of the contents');
    const from = { active: 'step-3', reached: 'step-3', done: Object.fromEntries(['s1-shell', 's2a-clt', 's2b-pkg', 's2c'].map((c) => [c, true])),
      chk: { 'step-1': 'yes', 'step-2': 'no' }, need: { 'n-mac': true, 'n-disk': true }, timers: { s2c: 1 }, path: 'A', chip: null };
    const before = P.navModel(from, live);
    assert.ok(before.items.some((i) => i.mark === '✓') && before.pct !== first.pct, 'the state it starts from shows progress');
    assert.equal(P.nextModel(from, live).done, 4);
    const r = P.resetState(ids[0]);
    assert.deepEqual([r.done, r.need, r.chk, r.timers], [{}, {}, {}, {}], 'no mark, no answer, no timer, nothing ticked in the checklist');
    assert.deepEqual([r.reached, r.active, r.focus], [ids[0], ids[0], ids[0]], 'the furthest section reached is the first, and so is the one the reader is in');
    // The choices are not progress: the state the page keeps after a reset still holds the path and the chip.
    assert.equal('path' in r || 'chip' in r, false, 'the reset state does not touch the path or the chip');
    const kept = { ...r, path: 'A', chip: null };
    const after = P.navModel(kept, live);
    assert.deepEqual(after.items.filter((i) => i.passed || i.mark === '✓'), [], 'no tick in Contents');
    assert.equal(after.pct, first.pct, "% passed is the first section's");
    const next = P.nextModel(kept, live);
    assert.deepEqual([next.done, next.total, next.next.cid], [0, 25, 's1-shell']);
    assert.match(next.text, /^Next command · 0\/25 done · ~\d+ min left$/);
  }
  // What it drops, and what it keeps: the commands' marks, the checklist and the answers; never what the reader typed or chose, and never the other page's marks.
  const stored = ['aiarch-mac.lic', 'aiarch-mac.label', 'aiarch-mac.url', 'aiarch-mac.mode', 'aiarch-mac.view', 'aiarch-mac.theme', 'aiarch-mac.path', 'aiarch-mac.chip', 'aiarch-mac.need', 'aiarch-mac.reached', 'aiarch-mac.chk',
    'aiarch-mac.cmd.s1-shell', 'aiarch-mac.cmd.s2c', 'aiarch.cmd.s2c', 'aiarch.need', 'other.key'];
  assert.deepEqual(P.resetKeys(stored), ['aiarch-mac.need', 'aiarch-mac.chk', 'aiarch-mac.cmd.s1-shell', 'aiarch-mac.cmd.s2c']);
  // The furthest section is written back as the first, not removed (the reader who reloads finds the top), and the scroll spy may not raise it while the page scrolls up.
  assert.match(code, /save\('aiarch-mac\.reached', first\)/);
  assert.match(code, /S\.reached = r\.reached; S\.active = r\.active; S\.focus = r\.focus;/, 'the reset applies the state it computes, and not the scroll position');
  assert.match(code, /if \(!S\.noReach && ids\.indexOf\(active\) > ids\.indexOf\(S\.reached\)\)/, 'the spy raises the section reached while the page scrolls up after a reset');
  assert.match(code, /window\.scrollTo\(\{ top: 0, behavior: rm\(\) \? 'auto' : 'smooth' \}\)/, 'a reset goes to the top, at once under reduced motion');
  assert.match(code, /if \(S\.view === 'step'\) setFocus\(first\)/, 'in the step view the first section is the one shown');
  // The click says something: the button's words, for about two seconds, and the same words for a screen reader.
  assert.deepEqual(['cleared', 'armed', ''].map((x) => P.resetLabel(x)), ['Cleared ✓', '⚠ Click again to clear', 'Reset checkmarks']);
  assert.deepEqual(['cleared', 'armed', ''].map((x) => P.resetWords(x)), ['Cleared ✓', 'Click again to clear', ''], 'the live region says the words of the button, without the symbol');
  assert.match(markup, /<span class="sr-only" id="reset-live" role="status" aria-live="polite"><\/span>/);
  assert.match(code, /setText\(\$\('#reset-live'\), resetWords\(rs\)\)/);
  assert.match(code, /S\.cleared = false; render\(\); \}, 2000\)/);
});

test('ARC-09-C300 — Reset checkmarks takes two clicks: one clears nothing, a second inside four seconds clears, and a wait, Esc or a click elsewhere takes the first back', () => {
  // The owner: "protection against pressing it by accident". No dialog: a real button, armed by the first click and amber with a symbol.
  const flow = P.resetFlow;
  const armed = flow(0, 'click', 1000);
  assert.deepEqual(armed, { armedAt: 1000, act: 'arm' }, 'one click clears nothing');
  // Two clicks inside the window clear; what the clear leaves, and keeps, is the case above.
  assert.deepEqual(flow(armed.armedAt, 'click', 1100), { armedAt: 0, act: 'clear' });
  assert.deepEqual(flow(armed.armedAt, 'click', 5000), { armedAt: 0, act: 'clear' }, 'four seconds exactly is inside');
  // A click, a wait past four seconds, a click: nothing is cleared, and the button is armed again.
  assert.deepEqual(flow(armed.armedAt, 'click', 5001), { armedAt: 5001, act: 'arm' });
  // Esc, focus moving away, and a click elsewhere take the first click back; the next click arms again and clears nothing.
  for (const event of ['esc', 'blur', 'away']) {
    const gone = flow(armed.armedAt, event, 1500);
    assert.deepEqual(gone, { armedAt: 0, act: 'cancel' }, event);
    assert.equal(flow(gone.armedAt, 'click', 1600).act, 'arm', `a click after ${event}`);
  }
  assert.deepEqual(flow(0, 'esc', 1500), { armedAt: 0, act: null }, 'Esc with nothing armed does nothing');
  // The page wires every one of them, and shows none of a browser's own dialogs.
  assert.match(markup, /<button type="button" class="btn" id="btn-reset">Reset checkmarks<\/button>/);
  assert.doesNotMatch(code, /\b(?:confirm|alert|prompt)\s*\(/, 'a browser dialog');
  assert.match(code, /resetFlow\(S\.armedAt, 'click', Date\.now\(\)\)/, 'the page never says click');
  assert.match(code, /resetFlow\(S\.armedAt, event, Date\.now\(\)\)/, 'the page takes the first click back without asking the flow');
  for (const event of ['esc', 'blur', 'away']) assert.match(code, new RegExp(`disarm\\('${event}'\\)`), `the page never says ${event}`);
  assert.match(code, /\$\('#btn-reset'\)\.addEventListener\('blur'/);
  assert.match(code, /armTimer = setTimeout\(function \(\) \{ S\.armedAt = 0; render\(\); \}, 4000\)/, 'the first click is taken back after four seconds');
  // Amber, with the symbol in the label: the look is a rule of the page and not the colour alone.
  assert.match(css, /#btn-reset\.armed, #btn-reset\.armed:hover \{ background: var\(--warn\); color: var\(--on-warn\);/);
});

test('ARC-09-C300 — the address check does what the handoff says, on the example of the handoff', () => {
  const r = P.checkUrl('http://dev12345.service-now.com/now/nav/ui/home');
  assert.equal(r.base, 'https://dev12345.service-now.com');
  assert.equal(r.msgs.length, 3);
  assert.equal(P.checkUrl('acme.example.com').state, 'warn');
  assert.equal(P.checkUrl('hello').state, 'bad');
  assert.equal(P.checkUrl('').state, 'empty');
});

test('ARC-09-C300 — the wizard practice takes the product\'s label rule (question 1), and says it in the Markdown guide\'s words', async () => {
  // The Windows page refused only spaces, so its practice accepted `Acme` and `1dev`, which the wizard refuses.
  const { LABEL_RULE, LABEL_RULE_WORDS } = await import(href('packages/snowarch/dist/cli/instance.js'));
  assert.equal(String(LABEL_RULE), '/^[a-z][a-z0-9_-]{0,31}$/');
  assert.match(LABEL_RULE_WORDS, /up to 32 characters/);
  for (const label of ['pdi', 'acme-dev', 'a', 'x_y-z9', 'a'.repeat(32), 'Acme', '1dev', '-dev', '_dev', 'my dev', 'a'.repeat(33), 'dev.1', 'acme!', 'dév']) {
    assert.equal(P.labelMessage(label) === '', LABEL_RULE.test(label), `the practice and the wizard disagree about "${label}"`);
  }
  assert.equal(P.labelMessage(''), 'Type a label.');
  assert.equal(P.labelMessage('Acme'), 'Use up to 32 lower-case letters, digits, - or _, starting with a letter, for example acme-dev.');
  assert.ok(mdText.includes('up to 32 lower-case letters, digits, - or _, starting with a letter'), 'the Markdown guide words the rule differently');
  assert.match(code, /labelMessage\(sLabel\)/, 'the practice does not use the function');
});

// ── the release ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C300 — the release tag is one: the clone, the page\'s release and the Markdown guide agree, and the release writer owns it', async () => {
  const tag = /--branch (v\d+\.\d+\.\d+) /.exec(data.commands.find((c) => c.id === 's4-clone').code)[1];
  assert.equal(data.release, tag, 'the release the page names is not the one it clones');
  assert.equal(/--branch (v\d+\.\d+\.\d+) /.exec(md)[1], tag, 'the two guides clone different releases');
  assert.deepEqual([...html.matchAll(/--branch v\d+\.\d+\.\d+/g)].length, 1);
  assert.match(html, /"release": "v\d+\.\d+\.\d+"/);
  const { writeGuideRelease, STAGED } = await import(href('scripts/lib/release/writers.mjs'));
  assert.ok(STAGED.includes(PAGE), 'the release commit does not stage the page the writer rewrote');
  // 9.x, as the other writer tests: the shapes are what matter.
  const moved = writeGuideRelease(html, '9.9.9', PAGE);
  assert.equal(moved.ok, true);
  assert.equal(JSON.parse(/<script type="application\/json" id="guide-data">([\s\S]*?)<\/script>/.exec(moved.text)[1]).release, 'v9.9.9');
  assert.match(moved.text, /clone --branch v9\.9\.9 https:/);
  assert.equal(moved.text.replaceAll('v9.9.9', tag), html, 'the writer changed more than the clone tag and the release');
  const rc = writeGuideRelease(html, '9.9.9-rc.1', PAGE);
  assert.deepEqual([rc.ok, rc.skipped, rc.text === html], [true, 'prerelease', true], 'a release candidate leaves the page naming the newest final');
  assert.equal(writeGuideRelease(html.replace(/"release": "v[\d.]+"/, '"x": 1'), '9.9.9', PAGE).ok, false, 'a page whose release field is gone must refuse, not pass');
  assert.equal(writeGuideRelease(html.replace(/--branch v[\d.]+/, '--branch main'), '9.9.9', PAGE).ok, false);
});

test('ARC-09-C300 — the page ships: it is covered by the signed manifest, and the Release carries it as its last asset', async () => {
  const { COVERAGE } = await import(href('packages/snowarch/dist/licence/integrity.js'));
  assert.ok(COVERAGE.covers.includes(PAGE), 'the page is not in COVERAGE (packages/snowarch/src/licence/integrity.ts, and dist)');
  assert.match(read('packages/snowarch/src/licence/integrity.ts'), /'docs\/AI-Architect-macOS-Install-Guide\.html'/);
  // What `shippedFiles` keeps of a tree (the files tracked at HEAD that this decides are covered), asked of the page itself, so the answer does not wait for a commit.
  const { isCovered } = await import(href('tools/snowarch/lib/licence/manifest.mjs'));
  assert.equal(isCovered(PAGE, COVERAGE), true, 'the staged distribution tree would not hold the page');
  assert.ok(/gh release create[\s\S]*?install-metrics\.md docs\/AI-Architect-Windows-Install-Guide\.html docs\/AI-Architect-macOS-Install-Guide\.html\n/.test(read('.github/workflows/release.yml')), 'the Release does not carry the page as its last asset');
});

// ── the words ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SENTENCES = [
  // How to use the guide, and the one thing a reader must not do.
  'The screens in this guide are examples. Your version numbers, file counts, times, folders and free disk space differ.',
  'To change part of a command, paste it but do not press Return yet. Press the left arrow key until the cursor (the mark where your typing goes) is just after the part to change, press delete until that part is gone, type yours, then press Return.',
  'The installer\'s own screens say Enter. On a Mac that is the Return key.',
  'Paste one, press Return, wait, then the next.',
  // Step 1, Step 2.
  'If the answer contains zsh, use the commands marked zsh. If it contains bash, use the commands marked bash.',
  'If .bash_profile does not exist but .bash_login or .profile does, stop here and ask for help before Step 2',
  'No command in this guide starts with sudo, and you should never put sudo in front of one',
  'Not sure? Choose path A if you know a name and password that this Mac accepts when you install a program, even on a company Mac. Otherwise choose path B, for example on a company Mac where only your IT team installs programs.',
  'The folder is snowarch-dl in your home folder. It holds only downloaded files; you can move it to the Trash once the install is done and 2f has worked.',
  'If you have moved the folder snowarch-dl to the Trash since 2b, run the first command of 2b again first.',
  'Download the disk image (both paths). The universal file is for both kinds of Mac, Apple silicon and Intel. It is about 260 MB.',
  'The AI Architect\'s installer prints this same command if it ever finds Claude Code installed but its folder not on PATH.',
  'The AI Architect looks for draw.io there by itself, so there is no PATH command to run.',
  'If it answers No such file or directory, Finder has not finished copying, or draw.io went somewhere else: wait, drag draw.io onto Applications again, and run the check again.',
  'If it answers No such file or directory, draw.io is not in your own Applications folder yet: wait for Finder to finish, drag draw.io into the window that open ~/Applications opened, and run the check again.',
  'v20. Step 2b installs v26.13.1. The AI Architect is tested with Node.js 20, 22, 24 and 26 on Windows, macOS and Linux.',
  // Step 4, Step 5.
  'readable only by your account (file mode 0600, folder mode 0700). It does this in whatever folder you choose, and the wizard says so when it saves.',
  'If you prefer another folder, use its name in these commands and in Every day.',
  'The file\'s name is the last part, for example LIC-2026-0000.json. It must list exactly one file. If it lists more than one, move the ones you do not need from Downloads to the Trash, then run this command again.',
  'Without a licence the installer leaves out two of its steps, the instance wizard (6d) and the verify step that follows it, until you run it again with the licence in place.',
  // Step 6 and after.
  'Then this window cannot see Node.js, and the plan offers no live mode. Do not type 1 there: on this screen any answer but s or q starts the install. Type q and press Return; nothing has been changed yet.',
  'A warn or a fail names the check it comes from. E-31 the licence warns in the last days before the licence ends. With a licence that runs for longer, this line shows no warning.',
  'The example above comes from an install whose licence was on its last day.',
  'Saved to .local/instances.json in this folder — readable only by you (0600).',
  'If the first word was not ok or expiring when you ran the installer, it left out the instance wizard (6d) and the verify step.',
  'Once a new licence file is in place (Step 5 or "Licence renewal"), run $BOOT again: it runs them. If its plan shows Mode design-only, switch to live as in 6b.',
  'This example licence has 43 days left, so it says ok, and the health check at the end of the install shows no E-31 warning for it.',
  // After the install: the sentences the second review added.
  'Node.js does not update itself: it stays at the version of 2b. To move to a newer one later, follow 2b in the newest copy of this guide (after $CLI upgrade, it is docs/INSTALL-MACOS.md in your AI-Arch folder; see "New releases"); on path B, leave out its PATH command, because the line is already there.',
  'It asks for the user name first, with the current one shortened in brackets: press Return to keep it. Then type the new password (nothing is shown) and press Return. It is saved only if the instance accepts it.',
  'It asks whether to remove the instance and its stored credentials; the question ends in [y/N], so the default is no. Type y and press Return to remove it. Any other answer removes nothing.',
  'Before you save it, move the licence file that is already in your Downloads folder (the one from Step 5), if it is still there, to the Trash. Then save the new file in Downloads, so that it is the only one there.',
  'If it answers with an error, Downloads holds more than one licence file: keep only the new one, then run it again.',
  'Check that the new licence is in place.',
  'Its first word should now be ok, with your new end date after until. If it still shows the old date, the old file was copied: make sure Downloads holds only the new licence file, then run the copy again.',
  'It shows a plan first and asks Proceed? [Y/n]. Press Return, or type y and press Return, to accept it; any other answer changes nothing. Your instances and passwords are not touched. Restart Claude afterwards.',
  'The installer makes that file, and the folder .local around it, readable only by your account (file mode 0600, folder mode 0700). An administrator of this Mac, such as your IT team, can still read it.',
  '$CLI doctor checks it (check SV-02); $CLI doctor --fix repairs it after showing what it will change.',
  // What has not been tested, and the closing line.
  'This guide was written from the AI Architect\'s own code and from its automatic tests on macOS, not from a person\'s install on a Mac.',
  'Intel Macs, and macOS 13.5 to 15. The automatic tests run on a Mac with Apple silicon and macOS 26.',
  'Path B as a whole: Node.js unpacked into your home folder with its PATH line, and draw.io in your own Applications folder with the drawio command.',
  'If you meet a difference, $CLI version and $CLI doctor (see "Asking for help") are what to send.',
  'Not yet tested end to end on a Mac.',
].map((s) => s.replaceAll('$CLI', CLI).replaceAll('$BOOT', BOOT));

test('ARC-09-C300 — the sentences of the reviews are on the page, and they are the Markdown guide\'s', () => {
  for (const s of SENTENCES) {
    assert.ok(mdText.includes(plain(s)), `the Markdown guide lacks: ${s}`);
    assert.ok(pageText.includes(plain(s)), `the page lacks: ${s}`);
  }
  // What the Markdown guide does not say, and the page does: the licence that covers design-only, and the note about the sample name in Your details.
  assert.ok(pageText.includes('Live mode needs a licence for live. Whoever gave you the licence knows which one you have.'));
  assert.ok(pageText.includes('Your licence covers design-only mode. Live mode needs a live licence: ask for one, or switch with') && pageText.includes('mode design.'));
  // The ones the reviews took out, and the ones that only the Windows page may say.
  for (const gone of ['The AI Architect is tested with Node.js 20, 22 and 24 on macOS', 'and with 26 on Windows and Linux', 'Node.js 26 on macOS. The AI Architect', 'brew install formula', 'Open Anyway']) {
    assert.equal(pageText.includes(gone) || code.includes(gone), false, `the page still says: ${gone}`);
  }
  assert.doesNotMatch(markup, /LIC-\d{4}-(?!0000)\d{4}/, 'a licence number on a page is the placeholder');
  // The Windows page's hint about the sample name is not here: no command of this page carries the name, so a reader has nothing to replace.
  assert.doesNotMatch(markup, /data-sample-note/);
  assert.equal(pageText.includes('This is the sample name'), false, 'a hint about replacing the sample name in a command, which no command here needs');
  assert.doesNotMatch(code, /data-sample-note/);
  // The states that leave the wizard out (the installer found no licence in force): the rerun in the Mac's spelling of the installer, and the mode of its plan (6b). The sentences are the Markdown guide's.
  for (const w of ['expired', 'invalid', 'revoked']) {
    assert.ok(data.licence.states[w][1].includes('If the first word was not ok or expiring when you ran the installer, it left out the instance wizard (6d) and the verify step.'), `${w}: the rerun is not said`);
    assert.equal(named(data.licence.states[w][1], 'run ', ' again: it runs them\\.'), BOOT, `${w}: the installer is not named`);
  }
  for (const w of ['expired', 'invalid', 'revoked', 'missing']) assert.ok(data.licence.states[w][1].endsWith('If its plan shows Mode design-only, switch to live as in 6b.'), `${w}: the mode of the plan on the rerun is not said`);
  assert.equal(named(data.licence.states.missing[1], 'then run ', ' again \\(Step 6\\): it runs the instance wizard and the verify step that it left out\\.'), BOOT);
  assert.ok(mdText.includes('If its plan shows Mode design-only, switch to live as in 6b.'));
  // The licence name of Your details only fills the sample screens: the copy commands take any LIC-*.json, and say so. The screens are three, and the field's help names them.
  for (const id of ['s5c', 'r-copy']) assert.equal(data.commands.find((c) => c.id === id).code, 'cp ~/Downloads/LIC-*.json .local/licence.json');
  assert.equal(data.commands.some((c) => c.code.includes('{lic}')), false, 'a command with the licence name typed in it: the reader would have to edit one');
  const filled = Object.fromEntries(Object.entries(data.terminals).filter(([, t]) => /\{lic(?:Id)?\}/.test(t)).map(([id, t]) => [id, /\{licId\}/.test(t) ? 'licId' : 'lic']));
  assert.deepEqual(filled, { licfile: 'lic', lic: 'licId', status: 'licId' }, 'the sample screens that take the name typed in Your details: 5b (the file), Step 7 and Step 8 (the number)');
  for (const [id, t] of Object.entries(data.terminals)) assert.doesNotMatch(t, /LIC-\d{4}-\d{4}/, `${id}: a licence number typed into a screen, which the field of Your details cannot change`);
  assert.ok(pageText.includes('It changes the licence file name and number in the sample screens of 5b, Step 7 and Step 8'), 'the help of the field does not say which screens change');
});

test('ARC-09-C300 — nothing of the Windows page is left: no PowerShell, no .cmd launcher, no Ctrl, no Windows folder, and Enter is Return', () => {
  const bare = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');   // a comment may say what the page is not
  const everything = `${pageText} ${bare(code)}`;
  for (const bad of [/PowerShell/i, /Command Prompt/i, /\b(?:snowarch|bootstrap)\.cmd\b/, /%(?:LOCALAPPDATA|APPDATA|TEMP|USERPROFILE)%|\$env:/i, /\bC:\\/, /\bCtrl\b/, /winget/i, /File Explorer/i, /Run as administrator/i, /\bWin\b/, /\bPS>|\bPS C:/, /is not recognized/i, /\.zip\b/, /Apps &amp; features|Apps & features/]) {
    assert.doesNotMatch(everything, bad, `a Windows leftover: ${bad}`);
  }
  // "Windows" is where the Markdown guide names it: the author's own tests, and the systems the AI Architect is tested on.
  const rest = everything.replace('In our own test on Windows a pasted block of three lines arrived broken', '').replace('in our Windows test it took two and a half minutes', '')
    .replace('come from the code and from our Windows test, not from a Mac', '').replaceAll('on Windows, macOS and Linux', '');
  assert.doesNotMatch(rest, /\bWindows\b/, 'the page names Windows where the Markdown guide does not');
  // "Enter" is "Return" on a Mac. It stays in the sentence that says so and on the screens that quote the installer; the page's own words and its script never use it.
  const spoken = fold(decode(markup.replace(/<[^>]+>/g, ' '))).replace(/ ([.,:;])/g, '$1')
    .replace("The installer's own screens say Enter.", '').replace('ends in · Enter picks this', '').replace('with Enter = run · s = docs skip', '');
  assert.doesNotMatch(spoken, /\bEnter\b/, `the page says Enter: ${/.{0,60}\bEnter\b.{0,40}/.exec(spoken)?.[0]}`);
  assert.doesNotMatch(bare(code), /\bEnter\b/, 'the script says Enter');
  assert.match(code, /⌘C now/, 'the Copy button falls back to the Mac\'s own key');
  assert.doesNotMatch(code, /Ctrl\+C now/);
});

// The screens of the page are the guide's. What the guide has no line for is the reader's own typing, and the lines that stand for others, left out.
const PAGE_ONLY_LINES = new Set([]);

test('ARC-09-C300 — each screen line of the page is a line of the Markdown guide', () => {
  const sample = (t) => t.replaceAll('{label}', 'pdi').replaceAll('{licId}', 'LIC-2026-0000').replaceAll('{lic}', 'LIC-2026-0000.json').replaceAll('{base}', 'https://<your-instance>.service-now.com');
  const missing = [];
  for (const [id, text] of Object.entries(data.terminals)) {
    for (const raw of sample(text).replace(/^\n+/, '').replace(/\s+$/, '').split('\n')) {
      if (raw.includes('[[')) continue;                           // what the reader types, checked as a command
      const dim = raw.startsWith('~ ');
      const line = (dim ? raw.slice(2) : raw).trim();
      if (!line || (dim && line.startsWith('…'))) continue;       // a line that stands for several
      if (!mdLines.has(line) && !PAGE_ONLY_LINES.has(line)) missing.push(`${id}: ${line}`);
    }
  }
  assert.deepEqual(missing, [], 'a screen of the page says what the Markdown guide does not');
  // The plan screen: the two lines the product prints first, then the choices as it pads them.
  assert.ok(data.terminals.plan.startsWith('Installing the AI ServiceNow Architect into this folder only — nothing else on the machine changes.\nTwo choices below, then it runs on its own'));
  // The terminal prompt of a Mac, in the words of the Markdown guide.
  assert.equal(data.terminals.ps.trim(), 'you@MacBook-Air ~ %');
});

// ── the reading ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const css = style.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => [fold(m[1]), m[2]]);
/** The page's colour tokens in one theme, each `var(--x)` followed to a colour. */
function themeTokens(name) {
  const sets = { common: {}, light: {}, dark: {} };
  for (const [sel, body] of rules) {
    const into = { ':root, [data-theme="light"]': sets.light, '[data-theme="dark"]': sets.dark, ':root': sets.common }[sel];
    if (into) for (const d of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) into[d[1]] = fold(d[2]);
  }
  const t = { ...sets.common, ...sets[name] };
  for (let i = 0; i < 3; i++) for (const k of Object.keys(t)) t[k] = t[k].replace(/var\(--([\w-]+)\)/g, (_, n) => t[n] ?? '');
  return t;
}
/** A colour a declaration names: a hex, or a `var(--token)` (with or without a fallback) in this theme; null for anything else (inherit, rgba, a gradient). */
const colourOf = (value, t) => {
  const v = fold(value ?? '');
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  const m = /^var\(--([\w-]+)(?:\s*,\s*[^)]*)?\)$/.exec(v);
  return m && /^#[0-9A-Fa-f]{6}$/.test(t[m[1]] ?? '') ? t[m[1]] : null;
};

test('ARC-09-C300 — a text colour and a background that one rule sets are 4.5 to 1 as the cascade leaves them, in both themes', () => {
  // The last rule for a selector wins, as it does at equal specificity: the design's own `.done` and `.next.all` came after the page's colour tokens and
  // put a literal near-black on the green, 3.6 to 1 in the light theme, which a table of token pairs cannot see. So this reads the rules as written.
  const final = new Map();
  for (const [sel, body] of rules) {
    if (/^(?::root|\[data-theme)/.test(sel)) continue;
    for (const one of sel.split(',').map(fold)) {
      const have = final.get(one) ?? {};
      for (const d of body.matchAll(/(?:^|;)\s*(color|background(?:-color)?)\s*:\s*([^;]+)/g)) have[d[1] === 'color' ? 'color' : 'background'] = d[2];
      final.set(one, have);
    }
  }
  const pairs = [...final].filter(([, d]) => d.color && d.background);
  assert.ok(pairs.length >= 25, `only ${pairs.length} rules set both: the reader lost some`);
  // The same for what a style attribute sets: an inline colour is the last word.
  const inline = [...markup.matchAll(/style="([^"]*)"/g)].map((m) => ({ color: /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(m[1])?.[1], background: /(?:^|;)\s*background\s*:\s*([^;]+)/.exec(m[1])?.[1] })).filter((d) => d.color && d.background);
  for (const name of ['light', 'dark']) {
    const t = themeTokens(name);
    const low = [...pairs, ...inline.map((d, i) => [`style attribute ${i + 1}`, d])].flatMap(([sel, d]) => {
      const f = colourOf(d.color, t); const b = colourOf(d.background, t);
      return f && b && ratio(f, b) < 4.5 ? [`${sel}: ${fold(d.color)} on ${fold(d.background)} ${ratio(f, b).toFixed(2)}`] : [];
    });
    assert.deepEqual(low, [], `${name}: a rule leaves text below 4.5 to 1`);
  }
});

test('ARC-09-C300 — text is at least 4.5 to 1 against what it sits on, in both themes', () => {
  const theme = themeTokens;
  const used = [['ink', 'paper'], ['ink', 'paper-2'], ['ink', 'paper-3'], ['ink', 'accent-soft'], ['ink', 'ok-soft'], ['ink', 'warn-soft'], ['ink', 'bad-soft'],
    ['ink-2', 'paper'], ['ink-2', 'paper-2'], ['ink-2', 'paper-3'], ['ink-2', 'accent-soft'], ['ink-2', 'ok-soft'], ['ink-2', 'warn-soft'], ['ink-2', 'bad-soft'],
    ['ink-3', 'paper'], ['ink-3', 'paper-2'], ['ink-3', 'paper-3'], ['link', 'paper'], ['link', 'paper-2'], ['link', 'accent-soft'], ['link', 'ok-soft'], ['link', 'warn-soft'], ['link', 'bad-soft'],
    ['accent', 'paper'], ['accent', 'paper-2'], ['paper', 'ink'], ['accent-ink', 'accent'], ['on-ok', 'ok'], ['on-warn', 'warn'], ['ok', 'paper-2'], ['warn', 'paper-2'], ['bad', 'paper-2'],
    ['term-fg', 'term-bg'], ['term-dim', 'term-bg'], ['term-dim', 'term-bar'], ['term-typed', 'term-bg'], ['term-fg', 'term-bar']];
  for (const name of ['light', 'dark']) {
    const t = theme(name);
    const low = used.filter(([f, b]) => { assert.match(t[f] ?? '', /^#[0-9A-Fa-f]{6}$/, `${name}: --${f} is not a colour`); assert.match(t[b] ?? '', /^#[0-9A-Fa-f]{6}$/, `${name}: --${b}`); return ratio(t[f], t[b]) < 4.5; });
    assert.deepEqual(low.map(([f, b]) => `${f} on ${b} ${ratio(t[f], t[b]).toFixed(2)}`), [], `${name}: text below 4.5 to 1`);
  }
});

test('ARC-09-C300 — the page respects a reader who asks for less motion, and a narrow screen', () => {
  assert.match(style, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?scroll-behavior: auto[\s\S]*?\.caret \{ animation: none; \}/);
  assert.match(code, /prefers-reduced-motion: reduce/);
  // Asked when it is used, not once at load: a reader can change the setting while the page is open, and a harness does it after the page has loaded.
  assert.match(code, /function rm\(\) \{ return !!\(RMQ && RMQ\.matches\); \}/);
  assert.doesNotMatch(code, /\bRM\b/, 'the setting is read once, at load');
  assert.match(code, /rm\(\) \? 'auto' : 'smooth'/);
  assert.match(code, /t\.btn\.hidden = rm\(\);/, 'the typing animation is offered to a reader who asked for none');
  assert.match(code, /if \(rm\(\) \|\| t\.timer\) return stopTerm\(t\);/, 'Play types for a reader who asked for no motion');
  assert.match(code, /RMQ\.addEventListener\('change', onRm\)/, 'a change of the setting while the page is open is not followed');
  assert.match(style, /\[hidden\] \{ display: none !important; \}/);
  assert.match(style, /\.stack, \.tool-b[^{]*\{ grid-template-columns: minmax\(0, 1fr\); \}/, 'a long command stretches its cell and the page scrolls sideways');
});

test('ARC-09-C300 — Safari from disk: the end of a scroll has its time fallback, the clipboard has its fallback, and nothing newer than Safari 16 is needed', () => {
  // `scrollend` is not in Safari 16: the scroll spy is held until the event or 1.6 s, whichever comes first.
  assert.match(code, /document\.addEventListener\('scrollend'/);
  assert.match(code, /setTimeout\(free, 1600\)/, 'the end of the scroll after a reset waits for an event Safari 16 does not send');
  // The clipboard from a file page can be refused: the command is selected and the button asks for the key of the Mac. The same for the help message.
  assert.match(code, /navigator\.clipboard\.writeText\(text\)\.then\(function \(\) \{ flashCopy\(b, 'Copied'\); \}, select\)/);
  assert.match(code, /catch \(e\) \{ select\(\); \}/);
  assert.match(code, /m\.focus\(\); m\.select\(\);/);
  // Not in Safari 16.0: these would break the page there without a word.
  assert.doesNotMatch(code, /\b(?:structuredClone|findLast|findLastIndex|toSorted|toReversed|toSpliced|Object\.groupBy|Array\.fromAsync|requestIdleCallback|ResizeObserver)\b|\bat\(-?\d+\)/);
  assert.doesNotMatch(code, /\?\?=|\|\|=|&&=|#\w+\s*[=;(]/, 'a logical assignment or a private field');
  assert.doesNotMatch(css, /:has\(|color-mix|@container|\b[sld]?dvh\b|\bsvh\b|text-wrap|@starting-style|::view-transition|@scope/, 'a feature Safari 16 lacks');
});
