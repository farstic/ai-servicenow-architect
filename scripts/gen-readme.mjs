#!/usr/bin/env node
/**
 * ARC-06-S13 — the install page's generated regions, and `README.md` composed from it.
 *
 * P-02 is why this exists. The package this repository replaces had a README that named an npm
 * package nobody had published and told the reader to register the server in
 * `claude_desktop_config.json` — every sentence true of an intention and false of the build. Prose
 * cannot notice that. So the parts of the page that are FACTS ABOUT WHAT THE TOOL PRINTS are
 * written here from the code that prints them:
 *
 *   closing-block      `tools/snowarch/lib/text.json` — the same bytes the launchers print
 *   dialogs            `EXPECTED_DIALOGS`, with the version it was measured on
 *   terminal-handoff   `docs/snippets/terminal-handoff.md`, the fragment the skill also carries
 *   remedies           `tools/snowarch/lib/remedies.json` — one row per preflight check
 *
 * And then `README.md` = `docs/README-head.md` + this page's body + `docs/README-tail.md`, because
 * P-02's other half was two install narratives that disagreed. There is one page; the README is a
 * copy of it that CI keeps honest.
 *
 * Three parts rather than two, ruled at S13's review: the head is what a reader meets first, the
 * body is the install page, and the tail is the two sections that are the README's own — "What is
 * here" and the licence. Folding the tail into the page made the page's 250-line criterion measure
 * 34 lines that were never install instructions.
 *
 *   node scripts/gen-readme.mjs           # rewrite the regions and README.md
 *   node scripts/gen-readme.mjs --check   # exit 1 if either has drifted
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath`, never `new URL(...).pathname` — `/C:/…` on Windows is not a path.
const selfRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const root = rootArg === -1 ? selfRoot : resolve(argv[rootArg + 1]);
const check = argv.includes('--check');

export const INSTALL = 'docs/INSTALL.md';
export const HEAD = 'docs/README-head.md';
export const TAIL = 'docs/README-tail.md';
export const README = 'README.md';
export const HANDOFF = 'docs/snippets/terminal-handoff.md';

const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** `<!-- generated:x -->` … `<!-- /generated:x -->`, the marker convention the repo already uses. */
export function replaceRegion(doc, name, body) {
  const open = `<!-- generated:${name} -->`;
  const close = `<!-- /generated:${name} -->`;
  const start = doc.indexOf(open);
  const stop = doc.indexOf(close, start);
  if (start === -1 || stop === -1) throw new Error(`${INSTALL}: no ${name} region`);
  return `${doc.slice(0, start + open.length)}\n${body}\n${doc.slice(stop)}`;
}

/** The closing block, as the tool prints it — fenced, so the indentation survives. */
export function closingBlock(text) {
  return ['```', text.doctorUnavailable, text.modeDesign, text.posix.nextDesign, '```'].join('\n');
}

/**
 * The dialogs paragraph, from the number rather than about it.
 *
 * The count is a promise made before first contact — say one and show two and the tool has lied in
 * its first thirty seconds — so the sentence is generated, and the caveat travels with it: the
 * measurement is from 2.1.258 and the engine's floor is older.
 */
export function dialogsParagraph(text, floor) {
  const n = text.expectedDialogs;
  const word = ['no', 'one', 'two', 'three'][n] ?? String(n);
  const first = n === 1
    ? `Starting \`claude\` in the checkout shows **${word} dialog**: workspace trust. Answer Yes.`
    : `Starting \`claude\` in the checkout shows **${word} dialogs**: workspace trust, and one `
      + 'approval for the MCP server. Answer Yes to both.';
  return [
    first,
    '',
    `Measured on Claude Code 2.1.258. The engine's floor is ${floor}, where a second approval for `
    + 'the MCP server may still appear — the bootstrap prints how many to expect before you start, '
    + 'so the summary is the authority and this page is the expectation.',
  ].join('\n');
}

/** One row per preflight check, in the file's own order, for the platform the reader is on. */
export function remediesTable(remedies) {
  const LABEL = {
    root: 'You are not at the checkout root',
    git: 'git is missing or too old',
    claudeCode: 'Claude Code is missing or too old',
    disk: 'Not enough disk space',
    network: 'github.com is unreachable',
    node: 'Node.js is missing or too old (live mode only)',
    platform: 'A 32-bit Node.js build',
  };
  const rows = Object.entries(remedies)
    .filter(([id]) => !id.startsWith('$'))
    .map(([id, r]) => `| ${LABEL[id] ?? id} | \`${r.darwin ?? r.default}\` | \`${r.win32 ?? r.default}\` |`);
  return ['| If | macOS / Linux | Windows |', '|---|---|---|', ...rows].join('\n');
}

/** The fragment, minus its own explanatory comment — the reader wants the block, not the note. */
export function handoffBody(fragment) {
  return fragment.replace(/^<!--[\s\S]*?-->\n/, '').trim();
}

export function renderInstall({ doc, text, remedies, handoff, floor }) {
  let out = replaceRegion(doc, 'closing-block', closingBlock(text));
  out = replaceRegion(out, 'dialogs', dialogsParagraph(text, floor));
  out = replaceRegion(out, 'terminal-handoff', handoffBody(handoff));
  out = replaceRegion(out, 'remedies', remediesTable(remedies));
  return out;
}

/**
 * README = head + the page from its first `## ` + tail.
 *
 * Each part's own leading comment block is stripped: they explain the composition to a maintainer,
 * and a note about how the file is assembled has no business in the middle of a user's first page.
 */
const withoutNote = (text) => text.replace(/^<!--[\s\S]*?-->\n+/, '');

export function renderReadme(head, install, tail) {
  const body = install.slice(install.indexOf('\n## ') + 1);
  return `${head.trimEnd()}\n\n${body.trimEnd()}\n\n${withoutNote(tail).trimEnd()}\n`;
}

/**
 * Only when RUN. The pure functions above are imported by `tests/install-page.test.mjs`, and a
 * module that rewrote two files as a side effect of being imported would make a test run a
 * generator nobody asked for.
 */
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const config = JSON.parse(read('engine.config.json'));
  const install = renderInstall({
    doc: read(INSTALL),
    text: JSON.parse(read('tools/snowarch/lib/text.json')),
    remedies: JSON.parse(read('tools/snowarch/lib/remedies.json')),
    handoff: read(HANDOFF),
    floor: config.floors.claudeCode,
  });
  const readme = renderReadme(read(HEAD), install, read(TAIL));

  const stale = [];
  if (install !== read(INSTALL)) stale.push(INSTALL);
  if (readme !== read(README)) stale.push(README);

  if (check) {
    if (stale.length > 0) {
      for (const f of stale) {
        process.stderr.write(`gen-readme: ${f} is STALE — run node scripts/gen-readme.mjs\n`);
      }
      // Named on purpose: a reader who edited README.md by hand has to be told where the text
      // lives, or they will make the same edit again.
      process.stderr.write(
        `gen-readme: ${README} is composed from ${HEAD} + ${INSTALL} + ${TAIL}; edit those\n`);
      process.exit(1);
    }
    process.stdout.write('gen-readme: README.md and docs/INSTALL.md current\n');
  } else {
    writeFileSync(join(root, INSTALL), install);
    writeFileSync(join(root, README), readme);
    process.stdout.write(stale.length > 0
      ? `gen-readme: wrote ${stale.join(', ')}\n`
      : 'gen-readme: no change\n');
  }
}

/** The same composition the CLI runs, for the test — one definition of "what README should be". */
export function compose(from = root) {
  const at = (rel) => readFileSync(join(from, rel), 'utf8');
  const config = JSON.parse(at('engine.config.json'));
  const install = renderInstall({
    doc: at(INSTALL),
    text: JSON.parse(at('tools/snowarch/lib/text.json')),
    remedies: JSON.parse(at('tools/snowarch/lib/remedies.json')),
    handoff: at(HANDOFF),
    floor: config.floors.claudeCode,
  });
  return { install, readme: renderReadme(at(HEAD), install, at(TAIL)) };
}
