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
import { renderPanel } from '../../tools/snowarch/lib/doctor/panel.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

const SNIPPET = join(REAL_ROOT, 'docs/snippets/status-template.md');
const SKILL = join(REAL_ROOT, '.claude/skills/snowarch/SKILL.md');
const FIXTURES = {
  live: join(REAL_ROOT, 'tests/fixtures/doctor/status-live.json'),
  design: join(REAL_ROOT, 'tests/fixtures/doctor/status-design.json'),
};

const read = (p) => readFileSync(p, 'utf8');

/**
 * The `## status` section alone.
 *
 * Scoped deliberately: the skill's `## doctor` section still reads `.local/bootstrap-state.json`
 * for its own reasons, and § status still NAMES `doctor --quick --json` — in the sentence that
 * forbids it. An assertion over the whole file would have had to be weakened to pass, and a
 * weakened assertion is how the instruction creeps back.
 */
function statusSection(text = read(SKILL)) {
  const start = text.indexOf('\n## status\n');
  assert.ok(start > 0, 'the skill has no ## status section');
  const next = text.indexOf('\n## ', start + 5);
  return text.slice(start, next === -1 ? undefined : next);
}
const report = (which) => JSON.parse(read(FIXTURES[which]));

/** The fenced template block — the same bytes the skill quotes. */
function templateBlock(text = read(SNIPPET)) {
  const m = /```\n(Mode: live[\s\S]*?)\n```/.exec(text);
  assert.ok(m, 'the snippet has no template block');
  return m[1];
}

/**
 * The key map, read from the snippet's table rather than from brackets after each line.
 *
 * ARC-08-C18 — the template's lines used to carry `[engine.docs]` annotations because a model was
 * filling them in. The block is the command's real output now, so the keys moved into a table
 * beside it: still documentation, still checked against the schema here, and no longer mixed into
 * the bytes a session is told to print verbatim.
 */
function mappedKeys(text = read(SNIPPET)) {
  return [...text.matchAll(/^\| `[A-Za-z]+:` \| (.+?) \|$/gm)]
    .flatMap((m) => [...m[1].matchAll(/`([^`]+)`/g)].map((k) => k[1]));
}

/** Walk a dotted path, treating `a[]` as "the array `a`". */
function resolve(object, path) {
  return path.replace(/\[\]$/, '').split('.').reduce(
    (value, key) => (value === null || value === undefined ? undefined : value[key]), object);
}

test('the template block IS what the renderer prints — not a transcription of it', () => {
  // THE DRIFT CLASS, CLOSED. The snippet, the skill and T-07 were three copies of a sample that
  // nothing produced; a line could be wrong in all three and no test would know, because every
  // test compared them to each other. This compares one of them to the product.
  assert.equal(templateBlock(), renderPanel(report('live')));
});

test('every mapped key is a key of schema v1', () => {
  const keys = mappedKeys();
  assert.ok(keys.length >= 7, `only ${keys.length} keys in the template`);
  for (const key of keys) {
    const top = key.split('.')[0].replace(/\[\]$/, '');
    assert.ok(SCHEMA_KEYS.includes(top), `${key} is not under any schema-v1 key`);
  }
});

test('every bracketed key resolves against a report the doctor really produced', () => {
  const live = report('live');
  assert.deepEqual(validateReport(live), [], 'the live fixture is not a valid schema-v1 report');
  for (const key of mappedKeys()) {
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

test('the skill runs the command and renders nothing itself', () => {
  // ARC-08-C18's point, asserted rather than assumed. The section was a renderer in prose — seven
  // lines each with a JSON key in brackets, a null rule, a failure branch, three fallback causes —
  // re-executed by a model once per session. What must not come back is any instruction to build
  // those lines: two implementations of one panel disagree the first day either changes.
  const skill = read(SKILL);
  assert.match(skill, /Run `\.\/snowarch status`\./);
  assert.match(skill, /\*\*Print its output verbatim/);
  assert.match(skill, /do not parse\n\s*the JSON/);
  assert.equal(/\[(modeLineDetailed|engine\.[a-z]+|server\.instances|summary)\]/.test(skill), false,
    'a bracketed render key is back in the skill');
  assert.equal(/filling each from the JSON key/.test(skill), false,
    'the per-key rendering instruction is back in the skill');
  // Named once, in the sentence that forbids it — and nowhere as an instruction.
  const section = statusSection(skill);
  assert.match(section, /\*\*Do not run `\.\/snowarch doctor --quick --json`/);
  assert.equal((section.match(/doctor --quick --json/g) ?? []).length, 1,
    'the skill reaches for the JSON the command already renders');
});

test('the fallbacks the command owns are gone from the skill and present in the command', () => {
  // They MOVED, and both halves are asserted — a test that only checked the skill no longer names
  // them would pass just as well if nothing had implemented them.
  const skill = read(SKILL);
  const command = readFileSync(
    join(REAL_ROOT, 'tools/snowarch/lib/commands/status.mjs'), 'utf8');
  const section = statusSection(skill);
  // `bootstrap-state.json` survives in § status in ONE sentence: the one saying the command reads
  // it. What must not survive is the instruction to read it and render the line from it.
  assert.equal(/read `\.local\/bootstrap-state\.json` and print/.test(section), false,
    'the skill still renders the bootstrap-state fallback by hand');
  assert.match(section, /it reads `\.local\/bootstrap-state\.json` and prints the/);
  // The causes that MOVED are the ones the command can observe for itself. `no Node` and `the
  // launcher is not installed` stay: they are the two the command can never report, because in
  // both of them the command is the thing that did not run.
  for (const cause of ['until Node 20+ is installed', 'the doctor exited']) {
    assert.equal(section.includes(cause), false,
      `the skill still carries the cause "${cause}" the command now observes for itself`);
  }
  assert.match(section, /no Node, or the launcher is not installed/);
  assert.ok(command.includes('bootstrap-state.json'));
  // And the command can actually be run: a skill told to run a command its frontmatter does not
  // allow is a skill that falls back on every invocation.
  assert.match(skill, /allowed-tools:.*Bash\(\.\/snowarch status\*\)/);
  assert.match(skill, /Bash\(node tools\/snowarch\/bin\/snowarch\.mjs status\*\)/);
  assert.match(command, /BANNER\.fromState/);
  // The one fallback the command cannot own: without Node it is the thing that did not run.
  assert.match(skill, /did not run \(<cause>\)/);
  assert.match(skill, /Never state a cause\s+you did not check/);
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

test('the skill names its one fallback and forbids the inferences', () => {
  const skill = read(SKILL);
  assert.match(skill, /Mode: unverified — \.\/snowarch status did not run/);
  // The exit code is a finding, not a broken command — without this sentence the first session to
  // see a 1 reports the tool as failing and never reads the panel under it.
  assert.match(skill, /exit code is the doctor's verdict/);
  // And the Windows sentence, which is the difference between "I cannot" and silence.
  assert.match(skill, /On Windows without Git for Windows I cannot run \.\/snowarch from here/);
  assert.match(skill, /\*\*Never infer the mode\*\*/);
});
