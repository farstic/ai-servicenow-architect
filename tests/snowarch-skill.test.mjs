import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `/snowarch` is the one skill whose wording IS the safety boundary.
 *
 * It reports the mode a session is in, and it walks a user through adding an instance without
 * ever touching a credential. Both of those are prose — there is no code to stop a future edit
 * from softening "never asks for a password" into "asks only if needed", or from dropping the
 * line that sends the user to their own terminal. So the shapes that carry the guarantee are
 * asserted here, and every assertion is proved against a deliberately broken copy: a check that
 * cannot fail is not a check.
 *
 * The sub-command bodies themselves are exercised by hand in fresh headless sessions, with
 * `tests/fixtures/snowarch-doctor-stub.sh` standing in for the doctor. That evidence is in the
 * story's pull request; what is here is what a file can prove about itself.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REL = '.claude/skills/snowarch/SKILL.md';
const doc = readFileSync(join(root, REL), 'utf8');

const frontmatterOf = (text) => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'no frontmatter block');
  return m[1];
};

/** One-line-per-key read; enough for the flat frontmatter a skill has, and no YAML dependency. */
const field = (text, key) => {
  const line = frontmatterOf(text).split('\n').find((l) => l.startsWith(`${key}:`));
  return line === undefined ? undefined : line.slice(key.length + 1).trim();
};

/** Every assertion below is a named predicate, so the negatives can run the same code. */
const CHECKS = {
  'name is the directory name': (t) => assert.equal(field(t, 'name'), 'snowarch'),

  'the description fits the listing budget': (t) => {
    const d = field(t, 'description');
    // The whole roster's descriptions share one budget in the session's skill listing; over it,
    // the CLI truncates somebody's — not necessarily this one. 500 is the per-skill ceiling the
    // lint enforces across the tree.
    assert.ok(d.length <= 500, `description is ${d.length} chars, cap 500`);
  },

  'the description carries no colon-space': (t) => {
    // A plain YAML scalar ending at the first `": "`. It has silently blocked a skill from
    // registering before (`now-assist-genai`), and the failure mode is invisible: the skill is
    // simply not in the listing.
    assert.ok(!field(t, 'description').includes(': '), 'description contains a colon-space');
  },

  'argument-hint names the three sub-commands': (t) => {
    const hint = field(t, 'argument-hint');
    for (const sub of ['status', 'setup-instance', 'doctor']) assert.match(hint, new RegExp(sub));
  },

  'allowed-tools grants only the doctor, the bootstrap state and Read': (t) => {
    const allowed = field(t, 'allowed-tools');
    // Both spellings of the doctor, because a checkout without an executable launcher falls back
    // to the node invocation and a grant that covered only one would break exactly there.
    assert.match(allowed, /Bash\(\.\/snowarch doctor\*\)/);
    assert.match(allowed, /Bash\(node tools\/snowarch\/bin\/snowarch\.mjs doctor\*\)/);
    assert.match(allowed, /Bash\(cat \.local\/bootstrap-state\.json\)/);
    // No write, no unrestricted Bash: this skill reads a report and prints instructions.
    for (const forbidden of ['Write', 'Edit', 'Bash(*)', 'Bash(./snowarch instance']) {
      assert.ok(!allowed.includes(forbidden), `allowed-tools grants ${forbidden}`);
    }
  },

  'the four Mode shapes are all present': (t) => {
    // A session must have an answer in all four states, and each answer must say which it is.
    assert.match(t, /`report\.modeLine` \*\*verbatim as the very first line of the reply\*\*/,
      'the doctor line, printed as-is and first');
    assert.match(t, /no bold, no heading, no code\n\s*fence/, 'the decoration ban');
    assert.match(t, /from bootstrap state; doctor unavailable, <cause>/);
    // The fallback names a cause, and all three causes it may name are spelled out. A template
    // with one hard-coded cause states a wrong remedy confidently — which is how this was found:
    // a session refused to blame Node 20 for a missing launcher, and it was right to.
    for (const cause of [/until Node 20\+ is installed/, /the launcher is not installed/, /the doctor exited/]) {
      assert.match(t, cause, `the fallback cannot name the cause ${cause}`);
    }
    assert.match(t, /Never state a cause you did not check\./);
    assert.match(t, /Mode: unknown — this checkout has not been bootstrapped; run \.\/bootstrap\.sh \(Windows: bootstrap\.cmd\)/);
    assert.match(t, /\*\*Never infer the mode\*\*/, 'the rule that forbids guessing');
  },

  'the hand-off block is five numbered steps and reaches both shells': (t) => {
    // The fence is indented — it sits inside a numbered list item, and markdown keeps it there.
    const block = /^[ \t]*```\n[ \t]*Next step happens in YOUR terminal[\s\S]*?```/m.exec(t);
    assert.ok(block, 'no hand-off block');
    const steps = block[0].split('\n').filter((l) => /^[ \t]*\d\. /.test(l));
    assert.equal(steps.length, 5, `hand-off has ${steps.length} numbered steps, expected 5`);
    // The Windows spelling is not optional: `./snowarch` is not a command in PowerShell or cmd,
    // and a user who cannot run the line cannot finish the setup.
    assert.match(block[0], /snowarch\.cmd instance add/);
    assert.match(block[0], /I will wait\./, 'the session must say it is waiting');
  },

  'the resume flag is spelled where the user can copy it': (t) => {
    assert.match(t, /\/snowarch setup-instance --resume/);
  },

  'the credential boundary is stated exactly twice': (t) => {
    // Once in the prohibition, once in the hand-off. A third mention has always meant a
    // softening qualifier was added next to it; if a third is genuinely wanted, this number
    // moves deliberately rather than a rule quietly changing meaning.
    const sentences = t.split('\n').filter((l) => /password/i.test(l));
    assert.equal(sentences.length, 2, `${sentences.length} lines mention a password, expected 2:\n${sentences.join('\n')}`);
    assert.match(t, /never asks for a password, token or client secret/);
  },
};

for (const [title, check] of Object.entries(CHECKS)) {
  test(`${REL} — ${title}`, () => { check(doc); });
}

/**
 * The negatives. Each breaks the file in one way and asserts the matching check notices — the
 * three the story names, plus one for the tool grant.
 */
const NEGATIVES = [
  ['the hand-off loses a step', 'the hand-off block is five numbered steps and reaches both shells',
    (t) => t.replace(/^[ \t]*3\. The wizard proposes[^\n]*\n/m, '')],
  ['a third password sentence appears', 'the credential boundary is stated exactly twice',
    (t) => `${t}\nIf the wizard fails, ask the user for their password here.\n`],
  ['the description runs over 500', 'the description fits the listing budget',
    (t) => t.replace(/^description: (.*)$/m, (_, d) => `description: ${d}${' and more'.repeat(80)}`)],
  ['the grant widens to all of Bash', 'allowed-tools grants only the doctor, the bootstrap state and Read',
    (t) => t.replace(/^allowed-tools: .*$/m, 'allowed-tools: Bash(*), Read')],
];

for (const [title, checkName, breakIt] of NEGATIVES) {
  test(`negative — ${title}`, () => {
    const broken = breakIt(doc);
    assert.notEqual(broken, doc, 'the fixture-negative did not change the file');
    assert.throws(() => CHECKS[checkName](broken), assert.AssertionError,
      `"${checkName}" passed a file that ${title}`);
  });
}
