/**
 * ARC-10-S09 (tool half) — the notice text and the archive checklist, before either is used.
 *
 * The RUN is the owner's and happens once, after the tag: two pull requests on repositories this
 * checkout never touches. What can be checked here is the thing that would be wrong at the moment
 * it mattered — a notice missing the tag a reader needs, a checklist missing the wait, or a "never"
 * list that lost the one verb D-01 exists to forbid.
 *
 * `docs/CONTRIBUTING.md` is allow-listed for retired names under ARC-10: the notice necessarily
 * spells both old repositories and the old package, because it is addressed to the people who have
 * them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r/g, '');

/** The section, from its heading to the next `## ` — so a check cannot pass on a neighbour. */
export function section(doc, heading) {
  const start = doc.indexOf(`## ${heading}`);
  if (start === -1) return null;
  const next = doc.indexOf('\n## ', start + 1);
  return doc.slice(start, next === -1 ? doc.length : next);
}

const NOTICE = () => section(read('docs/CONTRIBUTING.md'), 'Retiring the predecessors');

test('the notice names both import tags, the successor and the archive date', () => {
  const s = NOTICE();
  assert.ok(s, 'no "Retiring the predecessors" section');
  for (const needed of ['import/engine-v2.8.0-worktree', 'import/snow-mcp-1.0.0',
    'farstic/ai-servicenow-architect', 'docs/MIGRATION.md', '+ 14']) {
    assert.ok(s.includes(needed), `the notice does not name ${needed}`);
  }
  // The successor's own migration page has to exist, or the notice sends a reader nowhere.
  assert.ok(existsSync(join(root, 'docs/MIGRATION.md')));
});

test('the snow-mcp variant carries the npm sentence, and its link target exists', () => {
  const s = NOTICE();
  assert.match(s, /remains published as-is and is not updated/);
  assert.match(s, /@farstic\/snowarch/, 'the successor package is not named');
  // The link points at the `2.0.0` section of `packages/snowarch/CHANGELOG.md`, at the tag. The tag
  // resolves later; the HEADING has to exist now, or the notice promises a section nobody wrote.
  // (The path is written on its own here: L05 reads a trailing `§ <version>` as part of it and
  // reports the whole string as a dead path, which is correct of the string and wrong about the
  // file.)
  assert.match(read('packages/snowarch/CHANGELOG.md'), /^## 2\.0\.0/m,
    'packages/snowarch/CHANGELOG.md has no 2.0.0 section for the notice to link');
});

test('the checklist is six numbered items, and the wait is one of them', () => {
  const s = NOTICE();
  const numbered = [...s.matchAll(/^(\d)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(numbered, [1, 2, 3, 4, 5, 6], `the checklist is ${numbered.join(',')}`);
  assert.match(s, /Wait until `<tag date> \+ 14 days\.`/, 'the +14 rule is not an item');
});

test('the "Never" line keeps all five verbs', () => {
  // D-01 is the reason this list exists, and the reason it is asserted rather than trusted: the
  // npm record is a published fact that cannot be taken back, and four of these five would.
  const s = NOTICE();
  assert.match(s, /\*\*Never:\*\*/, 'no "Never:" line');
  // WHITESPACE-COLLAPSED: the item wraps, and "editing anything on / npm" is one phrase split by a
  // line break. A line-based check passes on today's wrap and silently stops checking after a
  // reflow — the same trap ARC-10-S04's sweep fell into, and the reason this file collapses first.
  const flat = s.slice(s.indexOf('**Never:**')).replace(/\s+/g, ' ');
  for (const verb of ['npm deprecate', 'npm unpublish', 'force-push', 'deleting a tag',
    'editing anything on npm']) {
    assert.ok(flat.includes(verb), `the Never list lost: ${verb}`);
  }
  // Not vacuous: a verb that was never on the list must not be found.
  assert.equal(flat.includes('npm publish --dry-run'), false);
});

test('the three checks are there with the baseline digest', () => {
  const s = NOTICE();
  assert.match(s, /git ls-remote --tags https:\/\/github\.com\/farstic\/ai-servicenow-architect v2\.0\.0/);
  assert.match(s, /npm view @farstic\/snow-mcp version deprecated/);
  assert.match(s, /npm view @farstic\/snow-mcp readme \| shasum -a 256/);
  // The digest read from the registry when this was written. It is the "before" the owner compares
  // against — a check with no baseline is a command, not a check.
  assert.match(s, /^47b71271fc675e850c473e341146beca80fa800d51446e6e41c59a03bf07b70c$/m);
  // And the Windows form, because the owner may run it there.
  assert.match(s, /Get-FileHash -Algorithm SHA256/);
});

test('the section says the run is the owner\'s, and drafts come first', () => {
  const s = NOTICE();
  assert.match(s, /OWNER's to run, and only after `v2\.0\.0` exists/);
  assert.match(s, /as DRAFTS/, 'the draft-first rule is not stated');
  assert.match(s, /scratch clone/, 'the scratch-clone rule is not stated');
});
