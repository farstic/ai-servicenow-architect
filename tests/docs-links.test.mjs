/**
 * ARC-09-S11 — the three documents stay consistent with the tree they describe.
 *
 * Prose is a review duty; COMMANDS AND ANCHORS are not. A document that tells someone to run
 * `./snowarch upgrde` or links to `#cutting-a-release` after the heading was renamed is wrong in a
 * way nobody notices until a reader follows it, and by then the reader is the one who finds out.
 * So every fenced command in these pages is checked against the thing that would run it, and every
 * internal link against the heading it points at.
 *
 * AMENDMENT (ARC-09-S11): the story says "extend `tests/docs-links.test.mjs`" as though ARC-05-S04
 * had left one. It did not — S04's path-reference check is lint rule **L05** in
 * `packages/contract/lint/engine-lint.mjs`, which verifies that a path named in a document EXISTS.
 * That is a different question from the two this file asks (does the ANCHOR exist, does the COMMAND
 * exist), and L05 keeps its job. This file is new rather than extended, and says so here so the
 * next reader does not go looking for the version that was extended.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMANDS } from '../tools/snowarch/lib/cli.mjs';
import { renderReadme, retarget } from '../scripts/gen-readme.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// ARC-10-S01 adds the migration page: it is the document with the highest density of commands
// a reader copies without reading, and the only one whose audience cannot fall back on
// knowing the tree.
const DOCS = ['docs/CONTRIBUTING.md', 'docs/INSTALL.md', 'docs/ARCHITECTURE.md',
  'docs/MIGRATION.md',
  // ARC-09-C25. The COMPOSED copy, resolved from the repository root — the one place the link
  // defect could exist, and the one this file could not see. `README.md` is `docs/INSTALL.md`'s
  // body at a different depth, so a link that is correct in the source is wrong here unless the
  // generator retargets it. Checking only the sources was right for every other property and blind
  // to this one; five links on the project's front page were 404.
  'README.md'];

/** GitHub's anchor rule, near enough for headings we write: lowercase, strip punctuation, hyphens. */
const anchorFor = (heading) => heading.trim().toLowerCase()
  // Backticks and asterisks are formatting; an UNDERSCORE is part of the word. Stripping it too
  // turned `PROXY_UNREACHABLE` into `proxyunreachable`, and this file then reported two links as
  // dead that were about to be correct — the rule was wrong, and the dead-anchor finding underneath
  // it was real, which is why both were chased rather than either being assumed.
  .replace(/[`*]/g, '')
  .replace(/[^\w\s-]/g, '')
  .trim()
  // EACH space becomes a hyphen, never a run collapsed into one. GitHub strips the punctuation
  // first, so `v1 — the other` leaves two spaces where the dash was and the anchor really does
  // carry `--`. Collapsing runs produced a single hyphen, and the first link written against the
  // real anchor was reported dead by this file — the rule was wrong, not the document.
  .replace(/ /g, '-');

const anchorsIn = (text) => new Set([...text.matchAll(/^#{2,6}\s+(.+?)\s*$/gm)].map((m) => anchorFor(m[1])));

/** Fenced blocks only: prose mentions a command in passing, a fence tells someone to run it. */
function fencedLines(text) {
  const out = [];
  let inside = false;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) { inside = !inside; continue; }
    if (inside) out.push(line);
  }
  return out;
}

// ─── The sections these documents are required to have (ARC-09-S11 AC 1, AC 2) ───────────────
//
// By ANCHOR, not by line, because the anchor is what other documents link to and what a reader
// lands on. Renaming a heading here is allowed; renaming it without noticing that six links point
// at the old name is what this list prevents.
const REQUIRED = {
  'docs/CONTRIBUTING.md': ['commits', 'releasing', 'store-migrations', 'upgrading-the-product',
    'ci-matrix', 'line-endings'],
  'docs/INSTALL.md': ['upgrading', 'what-to-paste-in-a-bug-report'],
  'docs/ARCHITECTURE.md': ['versioning-tags-and-upgrade'],
  // The four a reader is sent to by name — from the install page, from the doctor's output, and
  // from this page's own "Verify".
  'docs/MIGRATION.md': ['what-changes', 'verify', 'optional-cleanup', 'rollback'],
};

test('every required section exists, by the anchor other pages link to (ARC-09-S11)', () => {
  for (const [doc, anchors] of Object.entries(REQUIRED)) {
    const have = anchorsIn(read(doc));
    for (const a of anchors) {
      assert.ok(have.has(a), `${doc} has no section anchored #${a}`);
    }
  }
});

test('every internal link resolves to a heading that exists (ARC-09-S11)', () => {
  const dead = [];
  for (const doc of DOCS) {
    const text = read(doc);
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [path, anchor] = target.split('#');
      // A bare `#anchor` points within the same document.
      const file = path === '' ? doc : join(dirname(doc), path);
      if (!existsSync(join(root, file))) { dead.push(`${doc} → ${target} (no such file)`); continue; }
      if (!anchor) continue;
      if (!file.endsWith('.md')) continue;
      if (!anchorsIn(read(file)).has(anchor.toLowerCase())) {
        dead.push(`${doc} → ${target} (no such heading)`);
      }
    }
  }
  assert.deepEqual(dead, []);
});

test('every fenced command in the three documents exists (ARC-09-S11)', () => {
  const pkg = JSON.parse(read('package.json'));
  const unknown = [];
  let checked = 0;
  for (const doc of DOCS) {
    for (const line of fencedLines(read(doc))) {
      // `./snowarch <command>` — against the CLI's own table, which is what would run it.
      for (const [, cmd] of line.matchAll(/(?:^|\s|`)\.\/snowarch\s+([a-z][a-z-]*)/g)) {
        checked += 1;
        if (!(cmd in COMMANDS)) unknown.push(`${doc}: ./snowarch ${cmd}`);
      }
      // `node scripts/<file>` — against the tree.
      for (const [, rel] of line.matchAll(/node\s+((?:scripts|packages|tools)\/[\w./-]+\.mjs)/g)) {
        checked += 1;
        if (!existsSync(join(root, rel))) unknown.push(`${doc}: node ${rel}`);
      }
      // `npm run <script>` — against package.json.
      for (const [, script] of line.matchAll(/npm run ([a-z][\w:-]*)/g)) {
        checked += 1;
        if (!(script in pkg.scripts)) unknown.push(`${doc}: npm run ${script}`);
      }
    }
  }
  assert.deepEqual(unknown, []);
  // The tripwire on the extraction itself: a regex that stopped matching would check nothing and
  // pass. The number is low enough to be a floor and not a maintenance burden.
  assert.ok(checked >= 30, `only ${checked} commands extracted — the scan is broken, not the docs`);
});

test('ARC-09-C25 — the composition retargets a docs-relative link, and leaves the rest alone', () => {
  // The control on the retargeting, planted rather than observed: without it, "README.md has no
  // dead links" stays true the day the generator stops rewriting them, because the four links it
  // rewrites today are the only evidence and they would simply all break together.
  const composed = renderReadme('# H', '\n## Install\n\nsee [x](TROUBLESHOOTING.md#y).\n', 'tail');
  assert.match(composed, /\[x\]\(docs\/TROUBLESHOOTING\.md#y\)/);

  // ...and every shape that must NOT move. An absolute URL is already absolute; a root-relative
  // target already starts at the root; a bare anchor points inside the composed document itself.
  for (const target of ['https://example.com/a', 'http://example.com/a', 'mailto:x@example.com',
    '/LICENSE', '#upgrading']) {
    assert.equal(retarget(target), target, `${target} was rewritten`);
  }
  // `..` resolves OUT of docs/, so the answer is a root path rather than `docs/../x`.
  assert.equal(retarget('../LICENSE'), 'LICENSE');
  assert.equal(retarget('./INSTALL.md#uninstall'), 'docs/INSTALL.md#uninstall');
});

test('every "Where this is tested" names a real file or CI cell (ARC-09-S11)', () => {
  const contexts = new Set(JSON.parse(read('tests/fixtures/required-contexts.json')).contexts);
  const text = read('docs/CONTRIBUTING.md');
  const lines = text.split('\n');
  const missing = [];
  let found = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('**Where this is tested.**')) continue;
    found += 1;
    // The claim may wrap over several lines; read to the blank line that ends the paragraph.
    let para = '';
    for (let j = i; j < lines.length && lines[j].trim() !== ''; j += 1) para += `${lines[j]} `;
    // Every backticked token that looks like a path must exist; every one that looks like a CI
    // cell must be a context the workflow actually produces.
    for (const [, token] of para.matchAll(/`([^`]+)`/g)) {
      if (/^[\w./-]+\.(mjs|json|yml|ts)$/.test(token) || token.endsWith('/')) {
        if (!existsSync(join(root, token))) missing.push(`${token} (named in a "Where this is tested")`);
      } else if (/^[a-z][a-z-]*(\s\([^)]+\))$/.test(token) && !contexts.has(token)) {
        missing.push(`${token} (not a context ci.yml produces)`);
      }
    }
  }
  assert.equal(found, 6, `${found} "Where this is tested" lines — the six sections each need one`);
  assert.deepEqual(missing, []);
});
