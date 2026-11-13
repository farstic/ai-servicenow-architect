// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 — Part 2 of every Envelope carries one completion paragraph, the same in the six gateways, after the Live line and
// before Part 3: how to search (Grep over the corpus folder, each `_` written `\\?_`), that two pages that disagree are both
// cited, and that a field a page creates in an example belongs to that example. The grounding rule has no page limit any more
// (tests/grounding-rule.test.mjs) and the answer carries no count of pages read: the owner's measurement found that line the
// only source of regressions, and it is not in the text (the last test below holds that). The paragraph is the same in the six
// gateways, so seven places do not drift from each other.
//
// ARC-09-C268 (phase B) — two sentences end the line: run `docs lookup` for a construct before calling it not documented, unverified or
// left to the instance (only ABSENT grounds "not documented in the bundled corpus"; a page the lookup shows is opened before more is
// said), and cite only a page that was Read and prints the construct's name. The sentence names a command, so the command, the word
// ABSENT and the generated allow entry that lets a session run it without a prompt are held to it below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleAllows } from './helpers/permission-rule.mjs';
import { STATUS } from '../tools/snowarch/lib/docs/lookup.mjs';
import { spellings } from '../tools/snowarch/lib/launcher-spelling.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAYS = ['itsm-specialist', 'csm-specialist', 'hrsd-specialist', 'itom-discovery-specialist',
  'fso-insurance-specialist', 'cmdb-csdm-specialist'];
const LEAD = '[Completing Part 2:';
// ARC-09-C268 — the two sentences the owner approved, byte for byte (+253 and +60 bytes with their leading space).
const LOOKUP = 'Before calling a construct not documented, unverified or left to the instance, run `./snowarch docs lookup <name or words>…` '
  + '(many names, one call): only ABSENT grounds "not documented in the bundled corpus"; open a page it shows before you say more.';
const CITE = 'Cite only a page you Read that prints the construct\'s name.';

/** The completion line as each gateway states it, with where it sits relative to the Live line and Part 3. */
export function completionLines(read) {
  return GATEWAYS.map((g) => {
    const file = `.claude/skills/${g}/SKILL.md`;
    const lines = read(file).split('\n');
    const at = lines.flatMap((l, i) => (l.startsWith(LEAD) ? [i] : []));
    return {
      file,
      count: at.length,
      words: at.length ? lines[at[0]] : null,
      afterLive: at.length > 0 && at[0] > lines.findIndex((l) => l.startsWith('[Live mode, read what the corpus cannot settle:')),
      beforePart3: at.length > 0 && at[0] < lines.findIndex((l) => l.startsWith('## Part 3')),
    };
  });
}

const real = (f) => readFileSync(resolve(ROOT, f), 'utf8');

test('ARC-09-C263 — Part 2 carries the completion paragraph: one line per gateway, the same words, after the Live line', () => {
  const found = completionLines(real);
  for (const c of found) {
    assert.equal(c.count, 1, `${c.file}: the Part 2 completion line appears ${c.count} time(s), not once`);
    assert.ok(c.afterLive, `${c.file}: the completion line is not after the Live line`);
    assert.ok(c.beforePart3, `${c.file}: the completion line is not before Part 3`);
    assert.equal(c.words, found[0].words, `${c.file}: the completion line differs from ${found[0].file}'s`);
  }
  const words = found[0].words;
  assert.ok(words.endsWith('.]'), 'the line is a bracketed paragraph, like its neighbours');
  for (const phrase of [
    'Search with Grep over `vendor/ServiceNowDocs/markdown`, never the whole checkout, each `_` written `\\\\?_`',
    'Two pages that disagree are both cited, and the difference becomes an OPEN QUESTION',
    'A field, column or table that a page creates in an example or procedure belongs to that example, not to baseline',
  ]) assert.ok(words.includes(phrase), `the completion line lacks: ${phrase}`);
});

// The words C263 keeps out: a resting label, a budget, "in words" (R4's resting label), and a page path — a Grep scope names the
// folder without a page path under it. ARC-09-C268 lets "unverified" stand in ONE place: the lookup sentence's list of reasons to look a
// construct up ("not documented, unverified or left to the instance"). There it is a trigger, not a label the answer is asked to
// carry; anywhere else in the line it is still the resting label C263 removed.
test('ARC-09-C263 — the completion line has no resting label, no budget and no page path', () => {
  const { words } = completionLines(real)[0];
  assert.ok(words.includes(LOOKUP), 'the lookup sentence is not in the line, so there is nothing to take out before the check');
  const slot = (line) => /unverified|budget|in words|markdown\/[a-z]/.test(line.replace(LOOKUP, ''));
  assert.equal(slot(words), false, 'the completion line has a slot the rule removed');
  assert.doesNotMatch(words, /budget|in words|markdown\/[a-z]/, 'the lookup sentence has a slot the rule removed');
  assert.equal((words.match(/unverified/g) ?? []).length, 1, '"unverified" stands in more than the one trigger list');
  // The control: the check can fail. A label asked for, a budget, R4's "in words" and a page path are each found.
  for (const planted of [' Mark it unverified.', ' Keep a budget.', ' Say it in words.', ' See markdown/it-service-management.']) {
    assert.equal(slot(words.replace(/\]$/, `${planted}]`)), true, `the check does not see:${planted}`);
  }
});

test('ARC-09-C268 — the line sends a session to the lookup before it calls a construct absent, and to cite only what it Read', () => {
  for (const c of completionLines(real)) {
    const at = (sentence) => c.words.split(sentence).length - 1;
    assert.equal(at(LOOKUP), 1, `${c.file}: the lookup sentence is not in the line exactly once`);
    assert.equal(at(CITE), 1, `${c.file}: the citation sentence is not in the line exactly once`);
    assert.ok(c.words.endsWith(` ${LOOKUP} ${CITE}]`), `${c.file}: the two sentences are not the end of the line, lookup then citation`);
    // They come after the three C263 sentences, which are unchanged and in their order.
    const before = c.words.slice(0, c.words.indexOf(LOOKUP));
    assert.ok(before.indexOf('Search with Grep') < before.indexOf('Two pages that disagree') && before.indexOf('Two pages that disagree') < before.indexOf('A field, column or table'), `${c.file}: the C263 sentences moved`);
  }
});

test('ARC-09-C268 — the command the line names is a command that exists, ABSENT is the word it prints, and the generated settings allow it', () => {
  const cli = spellings({ platform: 'linux', env: {} }).cli;
  // The command, as the sentence spells it: the launcher, the two words, and the placeholder for what follows.
  const named = /run `(\S+) (docs lookup) <name or words>…`/.exec(LOOKUP);
  assert.ok(named, 'the sentence no longer names the command the way this test reads it');
  assert.equal(named[1], cli, 'the sentence spells the launcher otherwise than the product\'s POSIX launcher');
  // It is a verb of `docs`, which the product's own usage lists, and ABSENT is the state the command prints for a name no page has.
  const usage = readFileSync(resolve(ROOT, 'tools/snowarch/lib/cli.mjs'), 'utf8');
  assert.match(usage, /docs \(sync \| verify \| status \| lookup \| family\)/, 'the product no longer lists `docs lookup`');
  assert.equal(STATUS.absent, 'ABSENT', 'the sentence says ABSENT; the command prints another word');
  // And the generated settings let a session run exactly what the sentence tells it to: a typed command is the launcher, the words, and
  // a name or words after them.
  const { allow } = JSON.parse(real('.claude/settings.json')).permissions;
  const typed = `${named[1]} ${named[2]} requested item`;
  assert.ok(allow.some((rule) => ruleAllows(rule, 'Bash', typed)), `no entry of permissions.allow lets a session run: ${typed}`);
  // The control: a sentence that named another verb would not be covered.
  assert.ok(!allow.some((rule) => ruleAllows(rule, 'Bash', `${named[1]} docs find requested item`)), 'the settings allow more than the lookup');
});

test('ARC-09-C263 — a completion line that drifts is found', () => {
  const drifted = (f) => (f.includes('csm-specialist') ? real(f).replace('Two pages that disagree', 'Two pages that differ') : real(f));
  const found = completionLines(drifted);
  assert.deepEqual(found.filter((c) => c.words !== found[0].words).map((c) => c.file), ['.claude/skills/csm-specialist/SKILL.md']);
});

// What a session reads: CLAUDE.md, the rules, the skills, the agents and the governance pages. None asks for a count of the pages
// read. The owner's measurement of C263 found that line the only regression, so it is not asked for anywhere.
const walk = (dir) => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.md') ? [p] : []);
});

test('ARC-09-C263 — no file a session reads asks for a count of the pages read', () => {
  const files = [join(ROOT, 'CLAUDE.md'), ...['.claude', 'governance'].flatMap((d) => walk(join(ROOT, d)))];
  assert.ok(files.length > 40, `found ${files.length} files a session can read`);
  const asking = files.filter((f) => /Pages read/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(ROOT.length + 1));
  assert.deepEqual(asking, [], 'a file a session reads asks for a "Pages read" count');
  // The control: the check can fail. The same scan finds the sentence when it is put back.
  const SENT = 'it ends with `Pages read: <n>`, the number of corpus pages you Read for this Envelope. ';
  assert.match(real('.claude/skills/itsm-specialist/SKILL.md').replace(LEAD, `${LEAD} ${SENT}`), /Pages read/);
});
