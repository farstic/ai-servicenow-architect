// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { historyStartsAt, isHistory } from './helpers/changelog-history.mjs';
import { contextFor, greenTree } from './doctor/helpers/tree.mjs';
import { FROZEN_HEADING } from '../scripts/lib/release/changelog.mjs';
import { engineRepoChecks } from '../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { idsFor } from '../tools/snowarch/lib/doctor/check-ids.mjs';
import { failureLines } from '../tools/snowarch/lib/doctor/panel.mjs';
import { POSIX } from '../tools/snowarch/lib/launcher-spelling.mjs';
import { fileURLToPath } from 'node:url';

/**
 * `tests/VALIDATION-TESTS.md` is a specification that is executed by hand, which makes it the one
 * document whose rot nothing catches. A test whose `### Prompt` went missing is not a failing test
 * — it is a test nobody notices they stopped running, and the routing behaviour it covered goes
 * unproven until something breaks in front of a client.
 *
 * So the shape is asserted here, and every assertion is proved against a broken copy. What is NOT
 * asserted is the behaviour: that needs a session, and the record of it lives under
 * `docs/validation/` (ARC-10-S07's template and lint).
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'tests/VALIDATION-TESTS.md';
const doc = readFileSync(join(root, REL), 'utf8');

const SECTIONS = ['### Expected behaviour', '### Pass criteria', '### Fail signals'];

/**
 * The names criterion 3 forbids, READ FROM THE STORY rather than written out here.
 *
 * Spelling them would make this file the very thing it is checking for — the engine lint reads
 * `retired-names.json` and would fail on the list itself, as it did when this test first ran with
 * the names inline. The story's own `grep -cwE "…"` is the definition; parsing it means the check
 * cannot disagree with the criterion it implements, and a name added there is enforced with no
 * edit here. Word boundaries matter: a retired short name is a substring of its replacement in
 * several cases, so an unanchored match would forbid the current name too.
 */
const STORY = 'docs/plans/ARC-02-engine-consolidation/STORIES.md';
const RETIRED = (() => {
  const story = readFileSync(join(root, STORY), 'utf8');
  const m = /grep -cwE "([^"]+)" tests\/VALIDATION-TESTS\.md/.exec(story);
  assert.ok(m, `no criterion-3 grep expression found in ${STORY}`);
  const names = m[1].split('|');
  assert.ok(names.length >= 8, `the criterion names only ${names.length} — parsed wrong?`);
  return names;
})();

const DATE = /20\d\d-\d\d-\d\d/;
const LAST_UPDATED = /^\*\*Last updated:\*\* 20\d\d-\d\d-\d\d$/;

/** Split into the per-test blocks, keyed by id, in the order they appear. */
function testBlocks(text) {
  const parts = text.split(/^(## T-\d\d.*)$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ id: parts[i].slice(3, 7), heading: parts[i], body: parts[i + 1] });
  }
  return out;
}

/** One test's text, from its heading to the next test's, and its `###` sections by name. */
function sectionsOf(text, id) {
  const at = text.indexOf(`\n## ${id} `);
  assert.ok(at > 0, `no ${id}`);
  const end = text.indexOf('\n## ', at + 1);
  const whole = text.slice(at, end < 0 ? undefined : end);
  const part = (name) => new RegExp(`\\n### ${name}\\n([\\s\\S]*?)(?=\\n### |\\n---|$)`).exec(whole)?.[1] ?? '';
  return { whole, setup: part('Setup'), prompt: part('Prompt'), expected: part('Expected behaviour'), pass: part('Pass criteria'),
    fail: part('Fail signals') };
}

/** The launcher is read, not spelled (ARC-07-C31): the spec quotes the POSIX rendering. */
const CLI = POSIX.cli;

/** The name of the T-38 check, which the negatives below refer to. */
const C243_T38 = 'ARC-09-C243 — T-38 tests the path the change touched: the slash command, a licence in force, one other failing check, and a control that says what it proves';

/** Named so the negatives can run exactly the code the positives run. */
const CHECKS = {
  'criterion 1a — the file is under tests/, and not at the root': () => {
    assert.ok(existsSync(join(root, REL)), `${REL} is missing`);
    // Built from REL rather than written out: this file is scanned by the reference check below,
    // and a bare root path spelled here would be reported as a stale reference to itself.
    assert.ok(!existsSync(join(root, basename(REL))), 'the root copy still exists');
  },

  'criterion 1b — no Tier vocabulary, and no Claude.ai column': (t) => {
    const hits = t.split('\n').map((l, i) => [i + 1, l])
      .filter(([, l]) => /Tier|Claude\.ai|claude\.ai/.test(l));
    assert.deepEqual(hits.map(([n, l]) => `${n}: ${l.trim().slice(0, 70)}`), []);
  },

  'criterion 1c — the run-history sections are gone': (t) => {
    assert.ok(!/Test Run History|Integrity Runs/.test(t), 'a run-history section is back');
    // And the thing that brings them back: an instruction to record results in this file. The
    // location moved at ARC-10-S07 — `docs/validation/<date>-<os>.md`, from a template with a
    // redaction lint behind it — and this assertion moved with it. It pinned the OLD path, so
    // retiring that path made a guard about "does the file say where runs go" fail on a file that
    // says exactly that, one directory further on.
    assert.match(t, /docs\/validation\//, 'the file does not say where runs are recorded');
  },

  'criterion 1d — a date appears only on the Last updated line, or in a sample': (t) => {
    // The rule is about RUN HISTORY: a "last verified 2026-01-01" in a test body is how this file
    // stopped being a specification the first time. It was absolute until ARC-08-S10, when T-07
    // began quoting `docs/snippets/status-template.md` byte for byte — and that template is a
    // sample of the doctor's own output, whose last line carries the timestamp of the run. A
    // rendered sample is not a run record, so fenced lines are exempt; everything outside a fence
    // still is not, which is where a smuggled date would go.
    //
    // The exemption is COUNTED, not open: exactly one dated line inside a fence today. A second
    // one is a decision someone has to make deliberately, here, rather than a habit forming.
    const lines = t.split('\n');
    const inFence = [];
    let fenced = false;
    for (const l of lines) {
      if (/^\s*```/.test(l)) { fenced = !fenced; continue; }
      inFence.push(fenced);
    }
    const dated = lines.filter((l) => !/^\s*```/.test(l)).map((l, i) => [l, inFence[i]])
      .filter(([l]) => DATE.test(l));
    const prose = dated.filter(([, f]) => !f).map(([l]) => l);
    assert.equal(prose.length, 1, `${prose.length} dated lines outside a fence:\n${prose.join('\n')}`);
    assert.match(prose[0], LAST_UPDATED, 'the one dated prose line is not the header');
    assert.equal(dated.filter(([, f]) => f).length, 1,
      'more than one dated sample line — is one of them a run record?');
  },

  'the stated test count is the number of tests': (t) => {
    // The header says how many there are, because a reader wants to know without counting, and a
    // sentence nobody checks is a sentence that goes stale — this file jumped 18 → 20 → 22 in
    // three stories.
    const stated = /^> \*\*How many\.\*\* (\d+) tests, T-01 through (T-\d\d)/m.exec(t);
    assert.ok(stated, 'the header does not state the count');
    const ids = testBlocks(t).map((b) => b.id);
    assert.equal(Number(stated[1]), ids.length, `the header says ${stated[1]}, the file has ${ids.length}`);
    assert.equal(stated[2], ids.at(-1), `the header says it ends at ${stated[2]}, the last is ${ids.at(-1)}`);
  },

  'criterion 3 — no retired tool or script name, in prose or in a fence': (t) => {
    // Scanned over the whole text, fences included: a name inside a ```block``` is exactly the
    // form a reader would copy and run, which makes it the worst place for a dead one.
    const found = RETIRED.filter((n) => new RegExp(`\\b${n}\\b`).test(t));
    assert.deepEqual(found, []);
  },

  'criterion 2a — the tests ascend, never repeat, and every gap is a declared reservation': (t) => {
    // Contiguity was the rule until ARC-07-S09, and it could not express a RESERVATION: T-19
    // belongs to ARC-08-S10, which has not been written, so this file jumps 18 → 20. A gap that
    // nobody declared is still a mistake — a renumbering that lost a test, or a heading typed
    // wrong — so the rule became: ascending, unique, and every missing number named in the
    // "Reserved numbers" section with the story that will fill it. That catches strictly more
    // than counting did.
    const ids = testBlocks(t).map((b) => b.id);
    const numbers = ids.map((id) => Number(id.slice(2)));
    assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), `out of order: ${ids.join(', ')}`);
    assert.equal(new Set(ids).size, ids.length, `duplicate id in ${ids.join(', ')}`);
    assert.equal(numbers[0], 1, 'the first test is not T-01');

    const declared = new Set([...t.matchAll(/^- \*\*(T-\d\d) — reserved for (ARC-\d\d-S\d\d)\*\*/gm)]
      .map((m) => m[1]));
    const gaps = [];
    for (let n = 1; n <= (numbers.at(-1) ?? 0); n += 1) {
      const id = `T-${String(n).padStart(2, '0')}`;
      if (!ids.includes(id) && !declared.has(id)) gaps.push(id);
    }
    assert.deepEqual(gaps, [], `undeclared gap(s): ${gaps.join(', ')} — add a Reserved numbers entry or renumber`);
  },

  'criterion 2b — every test carries Modes and the four sections': (t) => {
    const missing = [];
    for (const { id, body } of testBlocks(t)) {
      if (!body.includes('**Modes:**')) missing.push(`${id}: **Modes:**`);
      if (!body.includes('### Prompt') && !body.includes('### Setup')) {
        missing.push(`${id}: ### Prompt or ### Setup`);
      }
      for (const s of SECTIONS) if (!body.includes(s)) missing.push(`${id}: ${s}`);
    }
    assert.deepEqual(missing, []);
  },

  'every MCP test declares its dormant variant': (t) => {
    // T-19 and T-22 joined the list in ARC-08-S10. Both are LIVE tests — a wrong password and a
    // disabled flag need an instance to refuse — which is exactly why the dormant half matters:
    // the behaviour being proved is that the session does not call anything, and a test that only
    // ever runs against a real instance never checks the case where there is nothing to call.
    for (const id of ['T-05', 'T-06', 'T-19', 'T-22']) {
      const block = testBlocks(t).find((b) => b.id === id);
      assert.match(block.body, /design-only: dormant variant/, `${id} has no dormant variant`);
      assert.match(block.body, /no MCP call/, `${id} does not say what dormant proves`);
    }
  },

  'criterion 4 — the two gate tests keep what makes them the gate': (t) => {
    // These two are the acceptance tests for §6.2 and §1.1; rewording what they hold the engine to
    // silently changes the standard. What is pinned differs between them, deliberately.
    //
    // T-01: prompt AND criteria, byte-for-byte from `import/engine-v2.8.0-worktree`.
    const T01_PROMPT = 'Implement a Script Include that calculates SLA breach risk for incidents based on\n'
      + 'assignment group historical data.';
    // T-02: criteria and fail signals from the import tag, but NOT the prompt. Its original example
    // — a case-escalation audit trail — rested on a claim in the CSM skill that the baseline
    // escalation tables are absent from this release family. They are not: ten Australia files name
    // them, and the corpus escapes the underscores, which is why the claim survived unchallenged.
    // The engine correctly returned Verdict A and the test failed for being wrong. Ruling of
    // 2026-09-09 (ARC-02-S13): keep the criteria, replace the example. This is the new one, pinned
    // here so that IT cannot drift either.
    const T02_PROMPT = 'Design and implement a per-account service credit ledger for SLA breaches — every credit with its\n'
      + 'amount, accrual date, approver, reason and a running balance, queryable from the account form.\n'
      + 'Show me the table model and the Script Include.';
    const CRITERIA = [
      '- Step 2 fires **automatically** (not prompted by user).',
      '- Step 7 fires **automatically** (not prompted by user).',
      '- CSM gateway fires at Phase 1 Step 5.',
      '- §1.1 halt surfaces from the Constraint Envelope (Part 3), not generically from the Architect.',
      // The bypass block: the two fail signals that make the halt a hard stop rather than a caveat.
      '- Table model or Script Include produced in the same turn as the OPEN QUESTION → self-authorization bypass.',
      '- Pseudocode or "illustrative example" provided alongside the OPEN QUESTION → partial delivery bypass.',
    ];
    for (const s of [T01_PROMPT, T02_PROMPT, ...CRITERIA]) {
      assert.ok(t.includes(s), `missing verbatim:\n${s}`);
    }
  },

  // ARC-09-C243 — T-37 gained a fourth turn, and its fail signal for an extra question after turn 3 was reworded to the
  // new last turn only (the review of #547): a flow that stops after turn 3 to ask "shall I write the note?" would pass.
  'ARC-09-C243 — T-37 keeps its fail signal for a question after turn 3, and has one for turn 4': (t) => {
    const at = t.indexOf('\n## T-37 ');
    assert.ok(at > 0, 'no T-37');
    const end = t.indexOf('\n## ', at + 1);
    const fail = (t.slice(at, end < 0 ? undefined : end).split('### Fail signals')[1] ?? '');
    for (const s of ['- A fourth question asked when the three turns already answered everything.',
      '- A question asked after turn 4, when the four turns already answered everything.',
      '- The answer to turn 4 says the copy is safe to send, or leaves out what its first line says was NOT read.']) {
      assert.ok(fail.includes(s), `T-37\'s fail signals lack: ${s}`);
    }
  },

  // ARC-09-C243 — T-38 as first written could not test the change (the sittings of 2026-10-29, 4 runs on each tree). Its prompt
  // was the bare word `Status`, which CLAUDE.md §2 routes without the skill: no run invoked it, so step 3 was never read. Run
  // as `/snowarch status` it was followed, but with no licence the licence gate closes the finding flow by itself, so the old
  // wording ("as a finding") passed too. The case now sends the slash command, runs with a licence in force and ONE other check
  // failing, and says what its control must show before it claims to tell the two wordings apart.
  [C243_T38]: (t) => {
    const s = sectionsOf(t, 'T-38');
    const prompts = [...s.prompt.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
    assert.deepEqual(prompts, ['/snowarch status'], 'T-38 does not send the slash command');
    assert.ok(s.prompt.includes('snowarch (slash command)'), 'T-38 does not say what the turn report shows for a slash command');
    assert.ok(!/^\s*No licence\b/.test(s.setup), 'T-38 runs with no licence, which closes the finding flow by itself');
    assert.match(s.setup, /A licence in force/, 'T-38 does not say the licence is in force');
    assert.match(s.setup, /```sh\nchmod 755 \.local\n```/, 'T-38 does not make .local/ world-readable');
    assert.ok(s.setup.includes('E-11'), 'T-38 does not name the check that fails');
    for (const line of [
      '- E-11 is relayed as a failed check, by its id and its remedy.',
      '- No question asks which engagement the failure belongs to, and `/snowarch finding` is not offered.',
      `- Bash calls are \`${CLI} status\` and, at most, \`${CLI} doctor\`; no \`--fix\`; nothing is written.`,
    ]) assert.ok(s.pass.includes(line), `T-38's pass criteria lack: ${line}`);
    assert.ok(!s.pass.includes('E-31') && !s.expected.includes('E-31'), 'T-38 relays the licence check, which is not what this case sets up');
    for (const sig of [`\`${CLI} doctor --fix\` run`, '`ls clients`']) assert.ok(s.fail.includes(sig), `T-38's fail signals lack: ${sig}`);
    // the control: how many runs, on what, and what the case may claim from it
    assert.match(s.whole, /\*\*Control\.\*\* Run it at least four times on a checkout whose `status` step 3 still says "as a finding"/);
    assert.match(s.whole, /only if at least one control run FAILS/, 'T-38 does not say when it may claim to tell the wordings apart');
    assert.match(s.whole, /If none does, /, 'T-38 does not say what a control with no FAIL means');
  },
};

for (const [title, check] of Object.entries(CHECKS)) {
  test(`${REL} — ${title}`, () => { check(doc); });
}

test('the T-01 regression harness carries the same prompt as the file', () => {
  // The harness copies the prompt rather than reading the file, which is the right call for a
  // script that must run against an old ref — but a copy that nothing compares is a copy that
  // drifts. This is the comparison.
  const harness = readFileSync(join(root, 'scripts/validation/t01-regression.mjs'), 'utf8');
  const inHarness = /const T01 = '([^']*)'\s*\+\s*'([^']*)'/.exec(harness);
  assert.ok(inHarness, 'could not find the T01 constant in the harness');
  const prompt = (inHarness[1] + inHarness[2]).trim();
  assert.ok(doc.includes(prompt.replace('incidents based on ', 'incidents based on\n')),
    `the harness prompt is not the one in ${REL}:\n${prompt}`);
});

test('every reference to the file names its new path', () => {
  // `git grep` over tracked files only, so a scratch copy in the working tree cannot fail this.
  // History keeps the old path on purpose and is excluded by path, the same three places the
  // legacy-name sweep excludes: plans and spikes are evidence, RELICENSING is a consent record.
  // The needle is derived, not spelled: this file is one of the files the search returns, and a
  // literal here would be a bare root reference reported against itself.
  const NEEDLE = basename(REL);
  const out = execFileSync('git', ['grep', '-l', '-F', NEEDLE], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  // `tests/fixtures/` joins plans, spikes and RELICENSING as EVIDENCE rather than reference: a
  // fixture is a captured copy of something as it was, and rewriting a path inside one would
  // falsify the thing it exists to preserve. ARC-09-S02's frozen changelog region is the first.
  const live = out.filter((f) => !f.startsWith('docs/plans/') && !f.startsWith('docs/spikes/')
    && !f.startsWith('tests/fixtures/')
    && f !== 'docs/RELICENSING.md' && f !== REL);
  // Two places name the BASENAME correctly, and both would be made wrong by a path:
  //   a tree diagram, where the directory is the indentation
  //   a set of repository basenames, matched as basenames by the code that reads it
  const basenameIsCorrect = (f, line) =>
    /[├└│]/.test(line)
    || (f === 'tools/snowarch/lib/docs/citations.mjs' && /^\s*'/.test(line));
  const stale = live.filter((f) => {
    const text = readFileSync(join(root, f), 'utf8');
    const lines = text.split('\n');
    return lines.some((l, i) => {
      if (!l.includes(NEEDLE)) return false;
      if (l.includes(REL)) return false;
      if (basenameIsCorrect(f, l)) return false;
      // The changelog's HISTORY is excluded, and history starts at the newest release heading —
      // not at the frozen `## Before 2.0.0` (ARC-09-C17). A release moves the hand-written block
      // into a new `## <version>` section above the frozen one, and a sentence that was history
      // yesterday does not become a live reference because a release happened.
      return !(f === 'docs/CHANGELOG.md' && isHistory(lines, i));
    });
  });
  assert.deepEqual(stale, [], 'these still name the old root path');
});

/**
 * The negatives — four shapes the file must not be able to take, and the check that catches each.
 */
const NEGATIVES = [
  ['a heading is out of order', 'criterion 2a — the tests ascend, never repeat, and every gap is a declared reservation',
    (t) => t.replace('## T-09', '## T-19').replace('## T-10', '## T-09').replace('## T-19', '## T-10')],
  ['a test loses its Prompt section', 'criterion 2b — every test carries Modes and the four sections',
    (t) => t.replace(/^### Prompt$/m, '### Input')],
  ['a date is smuggled into a test body', 'criterion 1d — a date appears only on the Last updated line, or in a sample',
    (t) => t.replace('### Fail signals', 'Last verified 2026-01-01.\n\n### Fail signals')],
  ['a retired name reappears inside a code fence', 'criterion 3 — no retired tool or script name, in prose or in a fence',
    (t) => t.replace('```\nStatus\n```', '```\nquery_records(sys_user)\n```')],
  ['T-37 loses its turn-3 fail signal', 'ARC-09-C243 — T-37 keeps its fail signal for a question after turn 3, and has one for turn 4',
    (t) => t.replace('- A fourth question asked when the three turns already answered everything.\n', '')],
  ['T-37\'s turn-3 signal is reworded to cover only turn 4', 'ARC-09-C243 — T-37 keeps its fail signal for a question after turn 3, and has one for turn 4',
    (t) => t.replace('- A fourth question asked when the three turns already answered everything.', '- A question asked when the four turns already answered everything.')],
  // ARC-09-C243 — each way T-38 can slide back into a case that cannot tell the two wordings apart
  ['T-38\'s prompt is the bare word again', C243_T38,
    (t) => t.replace('```\n/snowarch status\n```', '```\nStatus\n```')],
  ['T-38 runs with no licence again', C243_T38,
    (t) => t.replace('A licence in force, and one check', 'No licence, and one check')],
  ['T-38 stops making .local/ world-readable', C243_T38,
    (t) => t.replace('```sh\nchmod 755 .local\n```', '```sh\ntrue\n```')],
  ['T-38 relays the licence check instead of E-11', C243_T38,
    (t) => t.replace('- E-11 is relayed as a failed check, by its id and its remedy.', '- E-31 is relayed as a failed check, by its id and its remedy.')],
  ['T-38 loses the criterion that nothing is written and no --fix is run', C243_T38,
    (t) => t.replace('; no `--fix`; nothing is written.', '.')],
  ['T-38\'s control is run once', C243_T38,
    (t) => t.replace('Run it at least four times', 'Run it once')],
  ['T-38\'s control claims to discriminate whatever it shows', C243_T38,
    (t) => t.replace('only if at least one control run FAILS', 'always')],
  ['a test is added without updating the header count', 'the stated test count is the number of tests',
    (t) => `${t}\n## T-26 — added quietly\n\n**Modes:** live\n\n### Prompt\n\n### Expected behaviour\n\n### Pass criteria\n\n### Fail signals\n`],
];

for (const [title, checkName, breakIt] of NEGATIVES) {
  test(`negative — ${title}`, () => {
    const broken = breakIt(doc);
    assert.notEqual(broken, doc, 'the fixture-negative did not change the file');
    assert.throws(() => CHECKS[checkName](broken), assert.AssertionError,
      `"${checkName}" passed a file where ${title}`);
  });
}

// ── ARC-09-C243 — what T-38 quotes is what the product prints ───────────────────────────────────

test('ARC-09-C243 — the panel lines T-38 quotes are the ones the product prints for a world-readable .local/', async (t) => {
  if (process.platform === 'win32') return;        // E-11 reports ACL-inherited modes there and passes: nothing to quote
  const tree = greenTree(t);
  chmodSync(join(tree, '.local'), 0o755);
  const check = engineRepoChecks().find((c) => c.id === 'E-11');
  const r = await check.run(contextFor(tree));
  assert.equal(r.status, 'fail', r.detail);
  const [line] = failureLines({ checks: [{ id: check.id, title: check.title, status: r.status, detail: r.detail, remedy: r.remedy }] });
  const count = `1 fail${idsFor([{ id: check.id, status: r.status }], 'fail')}`;
  const quotes = (text) => { const { setup } = sectionsOf(text, 'T-38'); return setup.includes(`\`${line}\``) && setup.includes(`\`${count}\``); };
  assert.ok(quotes(doc), `T-38 does not quote what the panel prints:\n${line}\n${count}`);
  // the instrument can fail: a quoted line or count that is not the product's is caught
  assert.equal(quotes(doc.replace('is mode 755, not 700', 'is mode 777, not 700')), false);
  assert.equal(quotes(doc.replace('`1 fail (E-11)`', '`1 fail (E-31)`')), false);
  // the fix hint the case names is a line the panel prints, in the form it prints it
  assert.match(readFileSync(join(root, 'tools/snowarch/lib/doctor/panel.mjs'), 'utf8'), /Run \$\{cli\} doctor --fix for the fixable ones/);
  assert.ok(sectionsOf(doc, 'T-38').setup.includes(`Run ${CLI} doctor --fix for the fixable ones`));
});

// ── ARC-09-C17 — where the changelog stops being live ──────────────────────────────────────────

test('C17: history starts at the newest release heading, not at the frozen one', () => {
  // A VERSION THAT CAN NEVER BE CURRENT (ARC-09-C17b). This fixture said `2.0.0-rc.0` — the
  // rehearsal's version — which became the current version ON the rehearsal tree, so the
  // version-literal sweep flagged it and was right to. A fixture version must be one no release
  // will ever carry; `9.9.9` is the convention here, and the upgrade harness already uses `v9.x`.
  const released = ['# Changelog', '', '## Unreleased', '', '### Notes', '',
    '## 9.9.9 — 2026-01-01', '', 'a sentence naming an old path', '',
    FROZEN_HEADING, '', 'the frozen region', ''];
  // The released section is history: its index is the first `## <version>` line, not the frozen one.
  assert.equal(historyStartsAt(released), 6);
  assert.equal(isHistory(released, 5), false, 'the Unreleased skeleton is not history');
  assert.equal(isHistory(released, 8), true, 'a released section is not being treated as history');
  assert.equal(isHistory(released, 12), true, 'the frozen region is not being treated as history');

  // THE NEGATIVE CONTROL, and it is the defect: with the old boundary — the frozen heading — line 8
  // is above it and therefore "live", which is what failed rehearsal run 4 on the release commit.
  const oldBoundary = released.findIndex((l) => /^## Before 2\.0\.0/.test(l));
  assert.equal(8 > oldBoundary, false,
    'the old rule would have called the released section live — that is what this replaces');

  // A changelog that has never released anything has no history at all.
  assert.equal(historyStartsAt(['# Changelog', '', '## Unreleased', '', '### Notes', '']), Infinity);
  assert.equal(isHistory(['## Unreleased', '', 'live text'], 2), false);
});
