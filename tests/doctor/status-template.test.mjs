// ARC-08-S09 — the `/snowarch status` template, held to the schema it claims to read.
//
// The template tells a model which JSON key fills each line. A key that no report carries is a
// line the model fills with an invention — politely, plausibly, and wrongly — so every bracketed
// name here is resolved against a REAL report produced by the doctor itself. The fixtures are that
// report: `status-live.json` and `status-design.json` were written by `--quick --json` on fixture
// checkouts, never by hand, and they are validated against schema v1 below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCHEMA_KEYS, validateReport } from '../../tools/snowarch/lib/doctor/report-json.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

const SNIPPET = join(REAL_ROOT, 'docs/snippets/status-template.md');
const SKILL = join(REAL_ROOT, '.claude/skills/snowarch/SKILL.md');
const FIXTURES = {
  live: join(REAL_ROOT, 'tests/fixtures/doctor/status-live.json'),
  design: join(REAL_ROOT, 'tests/fixtures/doctor/status-design.json'),
};

const read = (p) => readFileSync(p, 'utf8');
const report = (which) => JSON.parse(read(FIXTURES[which]));

/** The fenced template block — the same bytes the skill quotes. */
function templateBlock(text = read(SNIPPET)) {
  const m = /```\n(Mode: live[\s\S]*?)\n```/.exec(text);
  assert.ok(m, 'the snippet has no template block');
  return m[1];
}

/** `[engine.docs]` → `engine.docs`, one per line, in order. */
function bracketedKeys(block = templateBlock()) {
  return block.split('\n').flatMap((line) => {
    const m = /\[([^\]]+)\]\s*$/.exec(line);
    return m ? m[1].split(',').map((k) => k.trim()) : [];
  });
}

/** Walk a dotted path, treating `a[]` as "the array `a`". */
function resolve(object, path) {
  return path.replace(/\[\]$/, '').split('.').reduce(
    (value, key) => (value === null || value === undefined ? undefined : value[key]), object);
}

test('every bracketed key is a key of schema v1', () => {
  const keys = bracketedKeys();
  assert.ok(keys.length >= 7, `only ${keys.length} keys in the template`);
  for (const key of keys) {
    const top = key.split('.')[0].replace(/\[\]$/, '');
    assert.ok(SCHEMA_KEYS.includes(top), `${key} is not under any schema-v1 key`);
  }
});

test('every bracketed key resolves against a report the doctor really produced', () => {
  const live = report('live');
  assert.deepEqual(validateReport(live), [], 'the live fixture is not a valid schema-v1 report');
  for (const key of bracketedKeys()) {
    // `capabilities` is legitimately null on a quick run — the check that fills it spawns and is
    // outside the quick subset. The template says so, and this test asserts the KEY exists rather
    // than that it has a value.
    const value = resolve(live, key);
    assert.notEqual(value, undefined, `${key} is not in a --quick report at all`);
  }
});

test('the design fixture is a valid report with no instances', () => {
  const design = report('design');
  assert.deepEqual(validateReport(design), []);
  assert.equal(design.mode, 'design-only');
  assert.deepEqual(design.server?.instances ?? [], [],
    'the design fixture has instances — then it is not a design-only fixture');
});

test('the live fixture has two instances and a detailed mode line to quote', () => {
  const live = report('live');
  assert.equal(live.mode, 'live');
  assert.equal(live.server.instances.length, 2);
  assert.match(live.modeLineDetailed, /^Mode: live — /);
  // The second instance is named in the line, which is what the template's `Instances:` row shows.
  assert.match(live.modeLineDetailed, /\+1 instance \(uat\)/);
});

test('neither fixture carries a clear username, a password or an instance URL', () => {
  for (const which of ['live', 'design']) {
    const text = read(FIXTURES[which]);
    assert.equal(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text.replace(/s\*\*\*@/g, '')),
      false, `${which}: an address survived`);
    assert.equal(/hunter2|password"\s*:\s*"[^"]{6,}/.test(text), false, `${which}: a secret survived`);
    assert.equal(/https?:\/\/[a-z0-9-]+\.service-now\.com/i.test(text), false,
      `${which}: an instance URL survived`);
  }
});

test('the skill quotes the snippet\'s template byte for byte', () => {
  const skill = read(SKILL);
  assert.ok(skill.includes(templateBlock()),
    'the skill and docs/snippets/status-template.md have drifted');
});

test('VALIDATION-TESTS T-07 quotes the same template (ARC-08-S10)', () => {
  // The third copy, and the one most likely to rot: T-07 is run by hand, by a person comparing a
  // session's answer against what is written there. If it drifts from the skill, the tester marks
  // a correct session FAILED — or, worse, passes one that invented a line.
  const doc = readFileSync(join(REAL_ROOT, 'tests/VALIDATION-TESTS.md'), 'utf8');
  const block = templateBlock();
  // Indented three spaces, because it sits inside a numbered step. Dedent and compare.
  const indented = block.split('\n').map((l) => (l ? `   ${l}` : l)).join('\n');
  assert.ok(doc.includes(indented), 'T-07 and docs/snippets/status-template.md have drifted');
  // And the quick-run sentence, which is the half a tester would otherwise mark as a missing line.
  assert.match(doc, /Capability packs and citation counts are not probed on a quick run/);
});

test('the skill names the fallbacks and forbids the inferences', () => {
  const skill = read(SKILL);
  // The four fallbacks, in the story's order.
  assert.match(skill, /exits 3/);
  assert.match(skill, /from bootstrap state \(<updatedAt>\); doctor unavailable, <cause>/);
  assert.match(skill, /Mode: unknown — this checkout has not been bootstrapped/);
  assert.match(skill, /Mode: unknown — doctor output unreadable/);
  // And the Windows sentence, which is the difference between "I cannot" and silence.
  assert.match(skill, /On Windows without Git for Windows I cannot run \.\/snowarch from here/);
  assert.match(skill, /\*\*Never infer the mode\*\*/);
});
