// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C285 — docs/AI-Architect-Windows-Install-Guide.html is the same guide as docs/INSTALL-WINDOWS.md, and what it computes agrees with the product.
 *
 * The page is the interactive form of the Windows guide: the same steps, with a Copy button on each command and helpers that read what the reader
 * pastes back. A second copy of a guide is a second place to go wrong, so this file makes the two one. Every command on the page equals the Markdown
 * guide's, in the same order. The sentences the review of 2026-11-16 put on the page are on both. The sample screens are the guide's. The version
 * floors, the permission presets, the licence words and the installer's check keys are the product's own, and the page's helpers run here, as they stand,
 * on lines the product prints (`checkLine`, `bannerLine`), because a helper that reads a line the product does not print is a helper that says
 * "all good" to somebody it should stop.
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
const PAGE = 'docs/AI-Architect-Windows-Install-Guide.html';
const html = read(PAGE);
const md = read('docs/INSTALL-WINDOWS.md');
const fold = (s) => s.replace(/\s+/g, ' ').trim();
// The launcher the page types in Windows PowerShell is the product's own spelling of it, not a copy kept here.
const { cliSpelling } = await import(href('packages/snowarch/dist/cli/tty.js'));
const CLI = cliSpelling('win32', {});

// ── the page, taken apart ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], body: m[2] }));
const data = JSON.parse(scripts.find((s) => /type="application\/json"/.test(s.attrs)).body);
const code = scripts.find((s) => !/type=|src=/.test(s.attrs)).body;
const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
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
function pureFunctions() {
  const a = code.indexOf('/* @pure-begin'); const b = code.indexOf('/* @pure-end */');
  assert.ok(a > 0 && b > a, 'the markers around the page\'s pure functions are gone');
  const names = ['checkUrl', 'checkVersions', 'checkPre', 'checkLic', 'norm', 'presetOf', 'presetFlags', 'navModel', 'nextModel', 'resetState', 'resetKeys', 'resetLabel', 'resetWords', 'resetFlow'];
  return new Function('D', 'FL', `${code.slice(a, b)}\nreturn { ${names.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ')} };`)(data, data.flags);
}
const P = pureFunctions();

// ── one file, nothing fetched, nothing built from what the reader types ──────────────────────────────────────────────────────────────────────────
test('ARC-09-C285 — one self-contained file: one data block, one script, one font link, and nothing that leaves the page', () => {
  assert.equal(scripts.length, 2, 'the page has the data block and one script, and no other');
  assert.equal(scripts.filter((s) => /src=/.test(s.attrs)).length, 0, 'a script is loaded from somewhere');
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 1, `one link is allowed, the fonts: ${links.join(' ')}`);
  assert.match(links[0], /^<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Archivo[^"]*family=IBM\+Plex\+Mono[^"]*">$/);
  assert.doesNotMatch(markup.replace(links[0], ''), /<(?:img|iframe|object|embed|video|audio|source|form|base)\b|\b(?:src|srcset)\s*=/i, 'the page loads something');
  assert.doesNotMatch(style, /@import|url\(/, 'the style loads something');
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts)\b|\bimport\s*\(/, 'the script talks to the network');
  assert.match(html, /<html lang="en" data-theme="light">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});

test('ARC-09-C285 — nothing the reader types or pastes is ever made into markup', () => {
  assert.doesNotMatch(code, /\.(?:innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|\.html\(/);
  assert.doesNotMatch(code, /set(?:Timeout|Interval)\(\s*['"`]/, 'a timer is given a string to run');
  assert.doesNotMatch(markup, /\son[a-z]+\s*=/i, 'a handler sits in the markup');
});

test('ARC-09-C285 — the saved state: the keys of the handoff, and every access to storage in a try', () => {
  const keys = new Set([...code.matchAll(/'(aiarch\.[a-z.]*)'/g)].map((m) => m[1]));
  assert.deepEqual([...keys].sort(), ['aiarch.chk', 'aiarch.cmd.', 'aiarch.label', 'aiarch.lic', 'aiarch.mode', 'aiarch.need', 'aiarch.reached', 'aiarch.theme', 'aiarch.url', 'aiarch.view']);
  const bare = code.split('\n').filter((l) => /localStorage/.test(l) && !/\btry\b/.test(l));
  assert.deepEqual(bare, [], 'storage is read or written outside a try: the page must work when it is blocked');
});

// ── the commands ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The command the permissions builder writes is made by the page from what the reader clicks, so the Markdown guide has no line for it.
const PAGE_ONLY = ['c-builder'];
const sub = (c) => c.replaceAll('{lic}', 'LIC-2026-0000.json').replaceAll('{label}', 'pdi');
const pageCommands = data.commands.filter((c) => !PAGE_ONLY.includes(c.id));

test('ARC-09-C285 — every command on the page is the Markdown guide\'s, in the same order', () => {
  assert.deepEqual(pageCommands.map((c) => sub(c.code)), mdCommands);
  assert.equal(new Set(data.commands.map((c) => c.id)).size, data.commands.length, 'two commands share an id, and the id is the saved state');
  for (const c of data.commands) assert.deepEqual([...c.code.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((t) => !['lic', 'label'].includes(t)), [], `${c.id}: a token the page does not fill`);
  // The Markdown guide's defaults are the page's: the licence file and the label a reader who types nothing gets.
  assert.match(md, /`LIC-2026-0000\.json`/);
  assert.match(code, /SAMPLE_LIC = 'LIC-2026-0000\.json'/);
  assert.match(code, /\|\| 'pdi'/);
});

test('ARC-09-C285 — the boxes in the markup are the commands in the data, and the steps and helpers point at what exists', () => {
  assert.deepEqual([...markup.matchAll(/data-cmd="([^"]+)"/g)].map((m) => m[1]), pageCommands.map((c) => c.id));
  for (const id of PAGE_ONLY) assert.ok(code.includes(`'data-cmd': '${id}'`), `${id} is not made by the script`);
  const steps = data.steps.flatMap((s) => s.cmds.map((c) => c[0]));
  assert.deepEqual(steps, pageCommands.slice(0, pageCommands.findIndex((c) => c.id === 's8') + 1).map((c) => c.id), 'the steps list the commands of Steps 1 to 8, all of them');
  assert.equal(steps.length, 25);
  assert.equal(steps.some((id) => ['s2f-shim', 's2f-path'].includes(id)) || data.commands.some((c) => ['s2f-shim', 's2f-path'].includes(c.id)), false,
    'draw.io needs no PATH command since ARC-09-C273: the guide has the unpack and the check');
  for (const id of Object.keys(data.timed)) assert.ok(steps.includes(id), `a timer for ${id}, which is not a command of the steps`);
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
  assert.ok(data.nav.some((n) => n.id === 'untested') && data.nav.findIndex((n) => n.id === 'untested') === data.nav.findIndex((n) => n.id === 'glossary') - 1, 'the section of what has not been tested has its entry before the glossary');
});

// ── the numbers the product owns ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C285 — the version floors are the engine\'s, on the page and in the check', () => {
  const { floors } = JSON.parse(read('engine.config.json'));
  assert.deepEqual(data.floors, floors);
  for (const [name, key] of [['Claude Code', 'claudeCode'], ['Git', 'git']]) assert.match(markup, new RegExp(`<tr><td>${name}</td><td>${floors[key].replaceAll('.', '\\.')}</td></tr>`), `the table of floors shows another ${name} version`);
  assert.match(markup, new RegExp(`<td>v${parseInt(floors.node, 10)}\\. Step 2b installs v26\\.13\\.0`));
  // The check, on each side of each floor.
  const below = (v) => { const [a, b, c] = v.split('.').map(Number); return c > 0 ? `${a}.${b}.${c - 1}` : b > 0 ? `${a}.${b - 1}.99` : `${a - 1}.99.99`; };
  const cases = { claudeCode: (v) => `${v} (Claude Code)`, git: (v) => `git version ${v}.windows.1`, node: (v) => `v${v}` };
  const label = { claudeCode: 'Claude Code', git: 'Git', node: 'Node.js' };
  for (const [key, line] of Object.entries(cases)) {
    const rowOf = (v) => P.checkVersions(`${line(v)}\n`).items.find((i) => i.k === label[key]);
    const bad = key === 'node' ? `${parseInt(floors.node, 10) - 1}.9.9` : below(floors[key]);
    assert.match(rowOf(floors[key]).cls, /\bok$/, `${key} at its floor`);
    assert.match(rowOf(bad).cls, /\bbad$/, `${key} below its floor`);
  }
  assert.doesNotMatch(JSON.stringify(P.checkVersions('v20.1.0')), /recommended/);
});

test('ARC-09-C285 — the permission flags, their dependencies and the presets are the product\'s', async () => {
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
});

test('ARC-09-C285 — the licence: the product\'s words, the product\'s line, the product\'s days', async () => {
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
  assert.doesNotMatch(code, /<=\s*14\b/, 'the page has a rule of its own for when to warn');
});

test('ARC-09-C285 — the installer\'s check: the keys are B00\'s, and it reads the lines B00 prints, the failing ones too', async () => {
  const B00 = await import(href('tools/snowarch/lib/steps/B00.mjs'));
  const keys = [...new Set([...read('tools/snowarch/lib/steps/B00.mjs').matchAll(/\b(?:ok|warn|fail)\(\s*'(\w+)'/g)].map((m) => m[1]))];
  assert.deepEqual(data.preflight.keys, keys);
  assert.deepEqual(Object.keys(data.preflight.tips), keys);
  const kind = (check) => P.checkPre(B00.checkLine(check)).items;
  const okAll = P.checkPre(keys.map((id) => B00.checkLine({ id, status: 'ok', detail: 'x' })).join('\n')).items;
  assert.deepEqual(okAll.map((i) => [i.k, i.cls]), keys.map((k) => [k, 'oci ok']));
  // What the installer prints for a failing or a warning check has no key (checkLine: "FAIL B00: <detail>"), so the page reads it from the words.
  const failing = { root: 'not at the repository root — run: cd somewhere', git: 'git not found', claudeCode: 'Claude Code 2.0.1 found, ≥ 2.1.214 required',
    disk: '1.0 GB free, 2.0 GB needed', network: 'github.com unreachable (timed out)', node: 'live mode needs Node.js 20+ — install it', platform: 'win32 ia32 — 32-bit' };
  for (const [id, detail] of Object.entries(failing)) {
    for (const [status, cls] of [['fail', 'bad'], ['warn', 'warn']]) {
      const items = kind({ id, status, detail });
      assert.equal(items.length, 1, `${id} ${status}`);
      assert.deepEqual([items[0].k, items[0].cls], [id, `oci ${cls}`], `${id} ${status}: ${B00.checkLine({ id, status, detail })}`);
    }
  }
  // "login: not verified" is an ok line of the installer's (claude auth status unavailable), not a login to fix; a login the page does not know is one.
  assert.equal(kind({ id: 'claudeCode', status: 'ok', detail: '2.1.322 · login: not verified (claude auth status unavailable)' })[0].cls, 'oci ok');
  assert.equal(kind({ id: 'claudeCode', status: 'ok', detail: '2.1.322 · login: none' })[0].cls, 'oci bad');
});

test('ARC-09-C285 — Reset checkmarks, pressed from Step 3: no tick in Contents, % passed of the first section, no mark, Next at 0 of 25, a label that says so, and what the reader typed kept', () => {
  // The owner pressed it and "nothing seemed to happen": the furthest section reached was set to the one the reader was in, so every tick above the
  // reader stayed, and so did the percentage. The state a reset leaves is a function, so this runs the page's own.
  for (const live of [true, false]) {
    const fresh = { active: 'need', reached: 'need', done: {}, chk: {}, need: {} };
    const ids = P.navModel(fresh, live).ids;
    const first = P.navModel(fresh, live);
    assert.equal(first.pct, `${Math.round(100 / ids.length)}%`, 'the first section is its share of the contents');
    const from = { active: 'step-3', reached: 'step-3', done: Object.fromEntries(['s1-whoami', 's2a-dl', 's2a-inst', 's2c'].map((c) => [c, true])),
      chk: { 'step-1': 'yes', 'step-2': 'no' }, need: { 'n-win': true, 'n-disk': true }, timers: { s2c: 1 } };
    const before = P.navModel(from, live);
    assert.ok(before.items.some((i) => i.mark === '✓') && before.pct !== first.pct, 'the state it starts from shows progress');
    assert.equal(P.nextModel(from, live).done, 4);
    const r = P.resetState(ids[0]);
    assert.deepEqual([r.done, r.need, r.chk, r.timers], [{}, {}, {}, {}], 'no mark, no answer, no timer, nothing ticked in the checklist');
    assert.deepEqual([r.reached, r.active, r.focus], [ids[0], ids[0], ids[0]], 'the furthest section reached is the first, and so is the one the reader is in');
    const after = P.navModel(r, live);
    assert.deepEqual(after.items.filter((i) => i.passed || i.mark === '✓'), [], 'no tick in Contents');
    assert.equal(after.pct, first.pct, "% passed is the first section's");
    const next = P.nextModel(r, live);
    assert.deepEqual([next.done, next.total, next.next.cid], [0, 25, 's1-whoami']);
    assert.match(next.text, /^Next command · 0\/25 done · ~\d+ min left$/);
  }
  // What it drops, and what it keeps: the commands' marks, the checklist and the answers; never what the reader typed or chose.
  const stored = ['aiarch.lic', 'aiarch.label', 'aiarch.url', 'aiarch.mode', 'aiarch.view', 'aiarch.theme', 'aiarch.need', 'aiarch.reached', 'aiarch.chk', 'aiarch.cmd.s1-whoami', 'aiarch.cmd.s2c', 'other.key'];
  assert.deepEqual(P.resetKeys(stored), ['aiarch.need', 'aiarch.chk', 'aiarch.cmd.s1-whoami', 'aiarch.cmd.s2c']);
  // The furthest section is written back as the first, not removed (the reader who reloads finds the top), and the scroll spy may not raise it while the page scrolls up.
  assert.match(code, /save\('aiarch\.reached', first\)/);
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

test('ARC-09-C285 — Reset checkmarks takes two clicks: one clears nothing, a second inside four seconds clears, and a wait, Esc or a click elsewhere takes the first back', () => {
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

test('ARC-09-C285 — the address check does what the handoff says, on the example of the handoff', () => {
  const r = P.checkUrl('http://dev12345.service-now.com/now/nav/ui/home');
  assert.equal(r.base, 'https://dev12345.service-now.com');
  assert.equal(r.msgs.length, 3);
  assert.equal(P.checkUrl('acme.example.com').state, 'warn');
  assert.equal(P.checkUrl('hello').state, 'bad');
  assert.equal(P.checkUrl('').state, 'empty');
});

// ── the release ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('ARC-09-C285 — the release tag is one: the clone, the page\'s release and the Markdown guide agree, and the release writer owns it', async () => {
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

test('ARC-09-C285 — the page ships: it is covered by the signed manifest, and the Release carries it', async () => {
  const { COVERAGE } = await import(href('packages/snowarch/dist/licence/integrity.js'));
  assert.ok(COVERAGE.covers.includes(PAGE), 'the page is not in COVERAGE (packages/snowarch/src/licence/integrity.ts, and dist)');
  assert.match(read('packages/snowarch/src/licence/integrity.ts'), /'docs\/AI-Architect-Windows-Install-Guide\.html'/);
  // What `shippedFiles` keeps of a tree (the files tracked at HEAD that this decides are covered), asked of the page itself, so the answer does not wait for a commit.
  const { isCovered } = await import(href('tools/snowarch/lib/licence/manifest.mjs'));
  assert.equal(isCovered(PAGE, COVERAGE), true, 'the staged distribution tree would not hold the page');
  // The page follows install-metrics.md, and another file may follow the page: the macOS guide is the last asset since ARC-09-C300, so a space or a line end, not only the line end.
  assert.ok(/gh release create[\s\S]*?install-metrics\.md docs\/AI-Architect-Windows-Install-Guide\.html(?=\s)/.test(read('.github/workflows/release.yml')), 'the Release does not carry the page');
});

// ── the words ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SENTENCES = [
  'The screens in this guide are examples. Your version numbers, file counts, times, folders and free disk space differ.',
  'The installer prints this same command if it ever finds Claude Code installed but its folder not on PATH.',
  'The AI Architect looks for draw.io in that folder by itself, so there is no PATH command to run and no window to reopen.',
  'The installer keeps your ServiceNow password in a file inside this folder (.local\\instances.json) and locks that file, and the folder .local around it, so that only your account and the system can read them.',
  'It does this in whatever folder you choose, and the wizard says so when it saves; if that folder had let other accounts read the file, the wizard adds a line saying who could, and that the permissions were changed just now.',
  'Your user folder is private to you anyway, so it is the one this guide uses.',
  'If you prefer another folder, use its name in these commands and in Every day. A folder name with a space in it has not been tested.',
  'v20. Step 2b installs v26.13.0, the version this guide was tested with. The AI Architect is tested with Node.js 20, 22, 24 and 26 on Windows, macOS and Linux.',
  'A warn or a fail names the check it comes from. E-31 the licence warns in the last days before the licence ends. With a licence that runs for longer, this line shows no warning.',
  'draw.io is not in %LOCALAPPDATA%\\Programs\\drawio. Repeat 2f and check that the last command answers True.',
  'After the password is saved, the wizard says Its permissions could not be restricted',
  `Your password is saved, but Windows would not let the installer lock the file, so other accounts on this computer might be able to read it. Run ${CLI} doctor --fix. It shows what it will change and changes it when you press Enter. If it cannot lock the file either, send the output of ${CLI} doctor (see Asking for help).`,
  'The installer locks that file, and the folder .local around it, so that only your account and the system can read them (the computer\'s administrators can always take a file over).',
  `${CLI} doctor checks it (check SV-02) and names anyone else who could read the file; ${CLI} doctor --fix repairs it after showing what it will change.`,
  'This guide was written from one end-to-end install (12 November 2026) and confirmed by a second, on a new laptop on 19 November 2026, that followed every step as written. Four things in it rest on something other than a run:',
  'Windows 10. The test machine ran Windows 11. Windows 10 (version 1809 or later) has the same PowerShell 5.1 and takes the same commands.',
  'Claude Code\'s first-run screens on Windows (Step 3). They are described in general terms because they change with Claude Code\'s releases.',
  'A folder name with a space in it, a folder on a network drive, and a folder that OneDrive or another sync tool manages (Step 4).',
  'What the screens say after the licence has ended (Step 7). The table is the product\'s own list of states, not a transcript of each one.',
  `If you meet a difference, ${CLI} version and ${CLI} doctor (see Asking for help) are what to send.`,
  'Tested end to end on 12 November 2026 on a company laptop: Windows 11 Enterprise (build 26200), a standard user without administrator rights.',
  'PowerShell 7.7.0 (zip; present on the test machine, not needed by this guide)',
  'A second end-to-end install, on a new laptop on 19 November 2026, followed every step as written, with no errors.',
  // The closing line of the last step names the user guide's page beside the operator's guide (ARC-09-C306).
  'The User Guide in your folder, docs\\USER-GUIDE.md, and its page docs\\AI-Architect-User-Guide.html, which you open in your browser, show how to work with it, with examples for analysts, architects and developers.',
];

test('ARC-09-C285 — the sentences of the review of 2026-11-16 are on the page, and they are the Markdown guide\'s', () => {
  for (const s of SENTENCES) {
    assert.ok(mdText.includes(plain(s)), `the Markdown guide lacks: ${s}`);
    assert.ok(pageText.includes(plain(s)), `the page lacks: ${s}`);
  }
  // What the Markdown guide does not say, and the page does: the licence that covers design-only, and the sample name.
  assert.ok(pageText.includes('Live mode needs a licence for live. Whoever gave you the licence knows which one you have.'));
  assert.ok(pageText.includes('Your licence covers design-only mode. Live mode needs a live licence: ask for one, or switch with') && pageText.includes('mode design.'));
  assert.ok(pageText.includes('This is the sample name. Type your file\'s name in Your details at the top, or replace LIC-2026-0000.json with it.'));
  // The ones the review took out.
  for (const gone of ['permissions are inherited from the folder', 'Why inside your user folder', 'ends today (UTC)', 'v22 is recommended', 'drawio-bin', 'Repeat the four commands of 2f']) {
    assert.equal(pageText.includes(gone) || code.includes(gone), false, `the page still says: ${gone}`);
  }
  assert.doesNotMatch(markup, /LIC-\d{4}-(?!0000)\d{4}/, 'a licence number on a page is the placeholder');
});

// ARC-09-C300: the guide was run end to end twice, on 12 November 2026 and, by a second install on a new laptop, on 19 November 2026. The second run is recorded
// with what was confirmed and nothing else (no machine, user or version was recorded for it, so none is written), and every place that dates the tests says both days.
const SECOND_INSTALL = 'A second end-to-end install, on a new laptop on 19 November 2026, followed every step as written, with no errors.';
test('ARC-09-C300 — the guide and its page date the end-to-end tests alike (12 and 19 November 2026), and the second install is recorded without a detail', () => {
  const lines = md.split('\n');
  // The subtitle of the guide and the hero chip of the page.
  const subtitle = lines.find((l) => l.startsWith('AI ServiceNow Architect · Windows 10')) ?? '';
  assert.ok(subtitle, 'the guide lost its subtitle');
  assert.ok(subtitle.includes('12 November 2026') && subtitle.includes('19 November 2026'), `the subtitle of the guide does not date both tests: ${subtitle}`);
  const chips = [...markup.matchAll(/<span class="chip"><i><\/i>([^<]*)<\/span>/g)].map((m) => decode(m[1]));
  assert.ok(chips.includes('Tested end to end · 12 and 19 Nov 2026'), `the hero chip of the page does not date both tests: ${JSON.stringify(chips)}`);
  // The closing record of each ends with the second install, so no machine, user or version follows it.
  const record = lines.find((l) => l.startsWith('Tested end to end on ')) ?? '';
  assert.ok(record.trimEnd().endsWith(SECOND_INSTALL), 'the record of the guide does not end with the second install');
  const foot = decode(/<div class="foot">([^<]*)<\/div>/.exec(markup)?.[1] ?? '');
  assert.ok(foot.trimEnd().endsWith(SECOND_INSTALL), 'the record of the page does not end with the second install');
});

// The screens of the page are the guide's. What the guide has no line for is the reader's own typing, the lines that stand for others left out, and these.
const PAGE_ONLY_LINES = new Set([
  ['Copyright (C) Microsoft Corporation.', 'All', 'rights', 'reserved.'].join(' '),   // what Windows prints when PowerShell opens
  'warning: refs/tags/… is not a commit!',                       // git's line, shortened as the guide shortens it
  'Environment → pdi', 'Authentication → basic',                  // the wizard's acknowledgement of a choice: instance.ts ack
]);

test('ARC-09-C285 — each screen line of the page is a line of the Markdown guide, apart from the few the guide has no line for', () => {
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
  assert.equal(data.terminals.saved.includes('permissions are inherited'), false);
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

test('ARC-09-C285 — a text colour and a background that one rule sets are 4.5 to 1 as the cascade leaves them, in both themes', () => {
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

test('ARC-09-C285 — text is at least 4.5 to 1 against what it sits on, in both themes', () => {
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

test('ARC-09-C285 — the page respects a reader who asks for less motion, and a narrow screen', () => {
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
