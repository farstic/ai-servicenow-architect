// ARC-08-S10 — the runtime-error section of the always-loaded rule file.
//
// The section is the difference between a session that stops on a wrong password and one that
// retries until the account locks. Everything in it that can drift — which codes appear, what each
// one tells the user to do, which flags the wildcard covers — is rendered from the contract, so
// what is asserted here is that the RENDERING still says the things the story requires and that no
// second copy of a remedy has appeared beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyContractRemedy } from '../../tools/snowarch/lib/doctor/runner.mjs';
import { spellings } from '../../tools/snowarch/lib/text.mjs';
import { fillLauncher } from '../../packages/contract/lib/contract.mjs';
import { WARNINGS_RULE } from '../../packages/contract/gen/rule-file.mjs';

/**
 * ARC-07-C32 — the PAGE's rendering, which is what these cases must compare in.
 *
 * The registry holds `<cli>` now and every committed page fills it with the pinned POSIX spelling,
 * so "character for character" means the contract's value AFTER that fill. Comparing a page to the
 * raw registry would assert that the page does NOT substitute — the opposite of the property.
 */
const PAGE_SPELL = spellings({ platform: 'linux', env: {} });
const onPage = (t) => fillLauncher(t, PAGE_SPELL);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULE = '.claude/rules/00-mode-and-mcp-gate.md';
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const contract = () => JSON.parse(read('packages/snowarch/dist/contract.json'));

/** The section, from its heading to the next one — never the whole file. */
function runtimeSection(text = read(RULE)) {
  const from = text.indexOf('## Runtime errors');
  assert.notEqual(from, -1, 'the runtime section is gone');
  const rest = text.slice(from + 3);
  const to = rest.indexOf('\n## ');
  return to === -1 ? text.slice(from) : text.slice(from, from + 3 + to);
}

const codeLines = (section = runtimeSection()) =>
  section.split('\n').filter((l) => /^- `[A-Z*][A-Z_*]*`/.test(l));

test('criterion 1 — one line per showInRule code, the six flag gates as one', () => {
  const c = contract();
  const flagCodes = new Set(c.flags.map((f) => `${f.name.replace('_ENABLED', '')}_NOT_ENABLED`));
  // A warning is rule-visible too, but under its own heading (ARC-09-C101), not in this list.
  const own = c.errorCodes.filter((e) => e.showInRule && !e.warning && !flagCodes.has(e.code)).map((e) => e.code);
  const rendered = codeLines().map((l) => /^- `([^`]+)`/.exec(l)[1]);

  assert.deepEqual(rendered, [...own, '*_NOT_ENABLED'],
    'the rendered lines are not the contract\'s showInRule codes plus the wildcard');
  // The six gates must NOT each get a line — that is what the wildcard is for, and six near-copies
  // in an always-loaded file is the cost the collapse exists to avoid.
  for (const code of flagCodes) {
    assert.ok(!rendered.includes(code), `${code} got its own line as well as the wildcard`);
  }
  console.log(`    runtime section: ${rendered.length} lines for ${own.length + flagCodes.size} codes`);
});

test('criterion 1 — the network family and INSTANCE_NOT_LOADED are in it', () => {
  // The seven this story made rule-visible — six in the story's list, and CONNECTION_REFUSED added
  // by its review, because a hibernating PDI is the network error this product meets most and
  // retrying wakes nothing. Named here and nowhere in the renderer: this is the story's decision
  // about which errors a session must hand over on, and it should fail loudly if someone quietly
  // takes one back out.
  const rendered = new Set(codeLines().map((l) => /^- `([^`]+)`/.exec(l)[1]));
  for (const code of ['DNS_FAILURE', 'TLS_CA_UNTRUSTED', 'PROXY_UNREACHABLE', 'PROXY_AUTH_REQUIRED',
    'CONNECTION_TIMEOUT', 'CONNECTION_REFUSED', 'INSTANCE_NOT_LOADED']) {
    assert.ok(rendered.has(code), `${code} is not in the runtime section`);
  }
});

test('criterion 1 — every rendered remedy is the contract\'s, character for character', () => {
  const byCode = new Map(contract().errorCodes.map((e) => [e.code, e]));
  for (const l of codeLines()) {
    const code = /^- `([^`]+)`/.exec(l)[1];
    if (code === '*_NOT_ENABLED') continue;
    const e = byCode.get(code);
    assert.ok(l.includes(onPage(e.remedy)), `${code}: the rule file paraphrases the registry`);
    if (e.command) {
      assert.ok(l.includes(`\`${onPage(e.command)}\``), `${code}: the command is not rendered as code`);
    }
  }
});

test('criterion 1 — the wildcard names the flags, and names them from the contract', () => {
  const line = codeLines().find((l) => l.startsWith('- `*_NOT_ENABLED`'));
  assert.ok(line, 'the wildcard line is gone');
  const names = contract().flags.map((f) => f.name.replace('_ENABLED', ''));
  assert.ok(line.includes(`(${names.join(', ')})`),
    `the wildcard does not name the contract's flags: ${line}`);
  // A seventh flag must appear here without an edit to the renderer, which is the property the
  // gen-governance fixtures prove; this asserts the real contract's six are all named.
  assert.equal(names.length, 6);
});

test('criterion 1 — the three behavioural sentences are there, and the section names no prefix', () => {
  const s = runtimeSection();
  assert.match(s, /stop the current step, print the remedy line verbatim, and wait/);
  assert.match(s, /Do not call the tool again with the same or different credentials/);
  assert.match(s, /Do not suggest editing `\.local\/instances\.json`, `\.mcp\.json` or any settings file by hand/);
  assert.match(s, /call `snow_core_capabilities_read` first to confirm the new state/);
  assert.match(s, /If two different runtime errors occur in one session, also say: run `\.\/snowarch doctor` in a terminal and paste the FAIL lines/);
  // The placeholder rule — the section renders `<label>`, `<host>` and `<proxy>` literally, so it
  // has to say what a session does with them.
  assert.match(s, /substitute what the tool result carried/);
  // ARC-07-S10's finding: the prefix is stated ONCE in the file, rendered from the server key.
  // A copy inside this section would be a literal that survives a key change.
  assert.ok(!s.includes('mcp__'), 'the runtime section spells a tool prefix');
});

test('criterion 2 — the AUTHENTICATION_FAILED remedy is one string in four places', () => {
  // The four consumers, and what each carries:
  //   the rule file, TROUBLESHOOTING, mcp-protocols   the remedy, verbatim
  //   ./snowarch doctor SV-04                          the remedy, filled from the code by the runner
  // The wizard's 401 line is deliberately NOT in this list — see the test below.
  const c = contract();
  const auth = c.errorCodes.find((e) => e.code === 'AUTHENTICATION_FAILED');
  assert.ok(auth?.remedy && auth.meaning, 'AUTHENTICATION_FAILED left the registry');

  for (const f of [RULE, 'docs/TROUBLESHOOTING.md', 'governance/mcp-protocols.md']) {
    assert.ok(read(f).includes(onPage(auth.remedy)), `${f} paraphrases the remedy`);
  }
  // The meaning travels with it in the two prose documents; the rule file renders the instruction
  // only, because a session needs to know what to DO and the file is always loaded.
  for (const f of ['docs/TROUBLESHOOTING.md', 'governance/mcp-protocols.md']) {
    assert.ok(read(f).includes(onPage(auth.meaning)), `${f} paraphrases the meaning`);
  }
  // The doctor: SV-04 returns the CODE and the runner fills the remedy from the contract, which is
  // the mechanism that makes the fourth place identical rather than similar.
  // ARC-07-C32 — the contract's remedy now carries `<cli>`, so the fourth place is identical to the
  // contract's value AFTER substitution. Both sides fill from the same spelling: comparing a filled
  // string to a raw one would assert that substitution does not happen, which is the opposite of the
  // property this case is for.
  const spell = spellings();
  const filled = applyContractRemedy({ id: 'SV-04', code: 'AUTHENTICATION_FAILED' }, c, spell);
  assert.equal(filled.remedy, fillLauncher(auth.remedy, spell));
});

test('criterion 2 — the wizard states the code and never a second remedy', () => {
  // The 401 re-entry line (ARC-07-S05) is a QUESTION at a terminal, not an instruction to a model:
  // it names the code and asks whether to try again. What it must never grow is a remedy of its
  // own — a command here would be the fifth copy of an instruction the registry exists to hold
  // once, and the one nobody would think to update.
  const src = read('packages/snowarch/src/cli/instance.ts');
  const line = /export const authFailedRetry[\s\S]*?;\n/.exec(src)?.[0];
  assert.ok(line, 'the 401 re-entry line is gone');
  assert.match(line, /AUTHENTICATION_FAILED/, 'the line does not name the code');
  assert.ok(!/\.\/snowarch instance (set-credentials|test)/.test(line),
    'the wizard grew a remedy of its own — it belongs in the registry');
});

// ARC-09-C101 (a) — the caller reads the warnings. A write that succeeded with `warnings[]` is not a
// runtime error (stop, never retry, wait): the record exists. It has its own section in the rule file,
// one sentence the owner worded, and a line per warning code, rendered from the registry.
const OWNERS_SENTENCE = 'A result with `warnings[]` is reported to the user, each warning in full, '
  + 'before anything else is done; the correcting modify is its own write and needs its own "write approved".';

function warningsSection(text = read(RULE)) {
  const from = text.indexOf('## Warnings');
  assert.notEqual(from, -1, 'the warnings section is gone');
  const rest = text.slice(from + 3);
  const to = rest.indexOf('\n## ');
  const section = to === -1 ? text.slice(from) : text.slice(from, from + 3 + to);
  // The trailing "Long form" pointer is not part of the section.
  return section.split('\n\nLong form:')[0];
}

test('ARC-09-C101 — the one rule sentence is the owner\'s, character for character', () => {
  assert.equal(WARNINGS_RULE, OWNERS_SENTENCE, 'the generator\'s sentence is not the one the owner approved');
  assert.ok(warningsSection().split('\n').includes(OWNERS_SENTENCE),
    'the rule file does not carry the sentence on a line of its own');
});

test('ARC-09-C101 — the section has a line per warning code, and each remedy is the registry\'s', () => {
  const c = contract();
  const warnings = c.errorCodes.filter((e) => e.warning);
  assert.deepEqual(warnings.map((e) => e.code).sort(), ['FIELD_NOT_STORED', 'VALUE_TRUNCATED']);
  assert.ok(warnings.every((e) => e.showInRule), 'a warning that is not rule-visible is one nobody is told about');
  const lines = warningsSection().split('\n').filter((l) => /^- `[A-Z_]+`/.test(l));
  assert.deepEqual(lines.map((l) => /^- `([^`]+)`/.exec(l)[1]).sort(), warnings.map((e) => e.code).sort());
  for (const e of warnings) {
    const l = lines.find((x) => x.startsWith(`- \`${e.code}\``));
    assert.ok(l.includes(onPage(e.remedy)), `${e.code}: the rule file paraphrases the registry`);
  }
});

test('ARC-09-C101 — warnings are not runtime errors: not in that list, and not under its instructions', () => {
  const s = runtimeSection();
  for (const code of ['VALUE_TRUNCATED', 'FIELD_NOT_STORED']) {
    assert.ok(!s.includes(code), `${code} is in the runtime-errors section, under "stop, never retry, wait"`);
  }
  const text = read(RULE);
  assert.ok(text.indexOf('## Warnings') > text.indexOf('## Runtime errors'), 'the warnings section comes after the runtime errors');
  // And the section does not borrow the error framing: a warning never arrives as `(Code: X)`.
  assert.ok(!warningsSection().includes('(Code:'), 'the warnings section talks about an error code');
});
