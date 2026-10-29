// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXED_REVIEW, maskFinding } from '../tools/snowarch/lib/finding.mjs';
import { reset } from '../tools/snowarch/lib/redact.mjs';
import { USAGE } from '../tools/snowarch/lib/commands/status.mjs';

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

/** The MCP server's key, from the config that decides it — never a literal here. */
const SERVER_KEY = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')).mcp.serverKey;
const REL = '.claude/skills/snowarch/SKILL.md';
const doc = readFileSync(join(root, REL), 'utf8');

// ARC-09-C243 — what the finding and Status text says is checked against the code and the texts it describes.
const GUIDE = readFileSync(join(root, 'docs/USER-GUIDE.md'), 'utf8');
const TEMPLATE = readFileSync(join(root, 'docs/snippets/status-template.md'), 'utf8');
const HELP = USAGE({ platform: 'darwin', env: {} });

const sectionOf = (t, name) => {
  const at = t.indexOf(`\n## ${name}\n`);
  assert.ok(at > 0, `no ## ${name} section`);
  const end = t.indexOf('\n## ', at + 1);
  return t.slice(at, end < 0 ? undefined : end);
};
const flat = (s) => s.replace(/\s+/g, ' ');
const paragraphWith = (text, needle) => flat(text.split(/\n\s*\n/).find((p) => flat(p).includes(needle)) ?? '');

/** Each FIXED_REVIEW entry, exactly as finding.mjs prints it, and the words the skill names its class with. */
const CLASS_OF = {
  'people: names of colleagues, users and customers': "people's names",
  'places: cities, sites and offices': 'places',
  'company names and abbreviations that neither the instance store nor aliases.txt holds': 'company names or abbreviations it was not given',
  'ticket keys in other systems, such as Jira or Azure DevOps': 'ticket keys in other systems',
  'record numbers with fewer than 6 digits': 'record numbers with fewer than 6 digits',
  'a credential written in plain words that no rule recognises': 'a credential written in plain words that no rule recognises',
};
const MASKING = 'on its own and with its parts joined by a space, a hyphen, an underscore, a dot or nothing';
const ITEM4 = 'Its first line says when it could not read your instance store or its credentials: then it may not have masked them.';

const STATUS = 'status reports exit 1 as a failed check or its own fallback, and never says finding';
const SAFE = 'the safe-to-send answer names what the masker cannot know, every class FIXED_REVIEW holds, and what was NOT read';
const NAME = 'a common word is named only as the engagement not to use, and the masking it avoids is the masker\'s';

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

  'argument-hint names the four sub-commands': (t) => {
    const hint = field(t, 'argument-hint');
    for (const sub of ['status', 'setup-instance', 'doctor', 'finding']) assert.match(hint, new RegExp(sub));
  },

  'allowed-tools is EXACTLY the eleven entries, in order': (t) => {
    // A grant is a security surface, so this asserts the WHOLE list rather than the presence of
    // the parts: an entry added by accident — or a wildcard someone reached for while debugging —
    // is invisible to a set of `match` calls and obvious to an equality.
    //
    // Both spellings of EACH command, because a checkout without an executable launcher falls back
    // to the node invocation and a grant covering only one would break exactly there. `status` is
    // ARC-08-C18's: § status runs it now instead of rendering the panel from the doctor's JSON, and
    // a skill told to run a command its frontmatter does not allow falls back on every invocation —
    // silently, and looking exactly like a broken install. The four MCP
    // tools are ARC-04-S04's, under `engine.config.json`'s own server key: `--resume` reloads the
    // store, reads the capabilities, and reports what is configured.
    //
    // The eleventh is ARC-09-C221's: § finding runs the masker, which is read-only and refuses any path
    // outside `clients/<engagement>/findings/` itself, because a Bash rule cannot constrain arguments.
    // The note is WRITTEN through Claude Code's own permission flow and is granted nothing here: a Write
    // or Edit rule in this list would pre-approve writes for the whole turn, and the list below still
    // forbids both (measured: a chained second command under this one rule is denied whole).
    const entries = field(t, 'allowed-tools').split(',').map((e) => e.trim());
    assert.deepEqual(entries, [
      'Bash(./snowarch status*)',
      'Bash(node tools/snowarch/bin/snowarch.mjs status*)',
      'Bash(./snowarch doctor*)',
      'Bash(node tools/snowarch/bin/snowarch.mjs doctor*)',
      'Bash(cat .local/bootstrap-state.json)',
      'Bash(node tools/snowarch/lib/finding.mjs *)',
      'Read',
      `mcp__${SERVER_KEY}__snow_core_instances_reload`,
      `mcp__${SERVER_KEY}__snow_core_capabilities_read`,
      `mcp__${SERVER_KEY}__snow_core_instances_index`,
      `mcp__${SERVER_KEY}__snow_core_current_instance_read`,
    ]);
    // Stated as well as implied by the equality above: no write tool, no unrestricted Bash, and
    // above all not the wizard — it needs a terminal that can mask input, which this one cannot.
    for (const forbidden of ['Write', 'Edit', 'Bash(*)', 'Bash(./snowarch instance']) {
      assert.ok(!field(t, 'allowed-tools').includes(forbidden), `allowed-tools grants ${forbidden}`);
    }
  },

  'the design-only stop names the mode command in the engine\'s own spelling': (t) => {
    // ONE definition of what to run: `tools/snowarch/lib/text.json` is what the launcher prints,
    // and the skill must send a reader to the same command. ARC-06-S12 recorded the discrepancy
    // this closes — the skill used to describe the toggle instead of naming the command.
    const cli = JSON.parse(readFileSync(join(root, 'tools/snowarch/lib/text.json'), 'utf8'))
      .posix.spellings.cli;
    assert.match(t, new RegExp(`${cli.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} mode live`),
      `the design-only stop must name "${cli} mode live"`);
    assert.match(t, /restart claude: the MCP toggle is read at session start/);
  },

  'the prereqs contract is written down where ARC-08-S01 will read it': (t) => {
    // The skill is the only consumer of `--section prereqs`, and that section does not exist yet.
    // The contract lives in the body as a comment so the story that BUILDS it has something to
    // build to — and so the fallback below it is impossible to miss.
    for (const field_ of ['os', 'shell', 'node.ok', 'deps.ok', 'mode.toggle', 'store.exists']) {
      assert.ok(t.includes(field_), `the prereqs contract does not name ${field_}`);
    }
    assert.match(t, /UNTIL ARC-08-S01 SHIPS/, 'the honest fallback is not stated');
    assert.match(t, /print BOTH command spellings/, 'the fallback must not guess a shell');
  },

  'the four Mode shapes are all present': (t) => {
    // A session must have an answer in all four states, and each answer must say which it is.
    //
    // ARC-08-C18 moved three of the four INTO `./snowarch status`: exit 3, the bootstrap-state
    // fallback and its causes are the command's now, because the command is what observes them.
    // What the skill still owns is the printing discipline — verbatim, first, undecorated — and
    // the one state the command cannot report, which is the command not running at all.
    assert.match(t, /\*\*Print its output verbatim, as the very first thing in the reply\*\*/,
      'the panel, printed as-is and first');
    assert.match(t, /no bold, no heading, no code\s+fence/, 'the decoration ban');
    assert.match(t, /Mode: unverified — \.\/snowarch status did not run \(<cause>\)/);
    assert.match(t, /Never state a cause\s+you did not check\./);
    // The two causes the skill may name are the two where the command is the thing that did not
    // run. A template with one hard-coded cause states a wrong remedy confidently — which is how
    // this was found: a session refused to blame Node 20 for a missing launcher, and it was right
    // to. The command carries the rest, each named from what it observed.
    assert.match(t, /no Node, or the launcher is not installed/);
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

  'the credential boundary is stated exactly four times, and never as a request': (t) => {
    // Two when this check was written (the prohibition and the hand-off's step 4). ARC-07-S09
    // added the authentication question, whose two options have to say what each METHOD needs —
    // "username + password", and ROPC's "client id + secret AND a user password" — because
    // choosing between them without that is choosing blind. So the number moves DELIBERATELY,
    // here, with the reason; what it is guarding against is a fifth line that softens the rule,
    // and that is still caught.
    const sentences = t.split('\n').filter((l) => /password/i.test(l));
    assert.equal(sentences.length, 4, `${sentences.length} lines mention a password, expected 4:\n${sentences.join('\n')}`);
    assert.match(t, /never asks for a password, a client secret or any other credential/);
    // And not one of them ASKS for one. The four are: two option descriptions, the terminal
    // instruction, and the prohibition itself.
    for (const line of sentences) {
      assert.doesNotMatch(line, /(what is|enter|give me|tell me|type).{0,20}(your )?password.{0,10}\?/i,
        `this line reads as a request for a credential: ${line}`);
    }
  },

  'the opening names four sub-commands and where the skill calls MCP tools': (t) => {
    // ARC-09-C221 corrected two stale sentences: § setup-instance --resume calls MCP tools, so "never calls an MCP
    // tool" was already false, and § finding is the fourth sub-command.
    assert.doesNotMatch(t, /It never calls an MCP tool/, 'the opening still says the skill never calls an MCP tool');
    assert.match(t, /`status`, `setup-instance`, `doctor` or `finding`/);
  },

  'the finding section asks for the engagement, prints the masker verbatim, and sends nothing': (t) => {
    // ARC-09-C221. The note is the user's and stays in the engagement's folder; what leaves is the masker's output,
    // printed as it is, as § status prints its panel, and sent by the user, never by this skill.
    const at = t.indexOf('\n## finding\n');
    assert.ok(at > 0, 'no ## finding section');
    const end = t.indexOf('\n## ', at + 1);
    const section = t.slice(at, end < 0 ? undefined : end);
    assert.match(section, /node tools\/snowarch\/lib\/finding\.mjs --next-name/);
    assert.match(section, /Print its output verbatim/);
    assert.match(section, /Send the text above to the person who issued your licence\./);
    assert.match(section, /`_unfiled`/, 'the section does not say that a finding never goes under `_unfiled`');
  },

  // ARC-09-C243 — the regression hunt (wf_9be5c51c-184, area 0 F3 and F4, and the second half of area 2 F6).
  [STATUS]: (t) => {
    // § status says "a failed check" for what § finding calls a finding, and relays the fallback line the command's own
    // catch prints when the doctor itself failed: that one is exit 1 too (status.mjs).
    const s = flat(sectionOf(t, 'status'));
    assert.ok(s.includes('`1` means a check failed, and the panel on the screen says which — report it as a failed check, never as "the command failed"'));
    assert.ok(s.includes("A `1` is also the command's own fallback, a Mode line that says `doctor unavailable`: relay that line as it is, with the cause it names."));
    // The CLI's catch-all (cli.mjs, ARC-09-C209) also exits 1, with one `error: status: …` line and neither a panel nor a Mode line.
    assert.ok(s.includes('A `1` with neither a panel nor that line is the command itself failing, usually one `error: status: …` line: relay it, and say the mode is unverified.'));
    assert.doesNotMatch(s, /\bthe one other\b/i, '§ status says there are only two kinds of exit 1');
    assert.doesNotMatch(s, /\bfindings?\b/i, '§ status says "finding", which § finding defines as the note flow');
  },
  [SAFE]: (t, { fixed = FIXED_REVIEW } = {}) => {
    // Every class the masker's "Read before sending" list holds is in the answer, and so is what its first line says it
    // did not read. A seventh class in the code fails here until it is mapped above and named in the skill.
    assert.deepEqual([...fixed], Object.keys(CLASS_OF), 'FIXED_REVIEW changed: name the new class in the skill, then here');
    const para = paragraphWith(sectionOf(t, 'finding'), 'safe to send');
    assert.ok(para.startsWith('The masker cannot know '), 'the paragraph no longer says what the masker cannot know');
    for (const words of Object.values(CLASS_OF)) assert.ok(para.includes(words), `the safe-to-send answer leaves out "${words}"`);
    assert.ok(para.includes('When its first line says the instance store was NOT read, the instance names were not masked by value either'));
    assert.ok(para.includes("when it says the credentials were NOT read, the store's usernames were not, and its secrets may not have been"));
    assert.ok(para.includes('say that it is masked, that those still need a reader, and which of the two its first line says was NOT read, if either was'));
  },
  [NAME]: (t, { guide = GUIDE } = {}) => {
    // The masker masks the engagement's name wherever it stands as a word, with its parts joined any way, so the skill
    // and the guide name no example engagement but the one not to use.
    const step = paragraphWith(sectionOf(t, 'finding'), 'Ask which engagement the finding belongs to');
    const item = paragraphWith(guide, 'asks which engagement the finding belongs to');
    for (const [where, text] of [['the skill', step], ['the user guide', item]]) {
      assert.ok(text.includes('so not a common word such as `general`'), `${where} suggests a common word, or none`);
      assert.ok(text.includes(MASKING), `${where} does not say how the engagement's name is masked`);
      const names = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((n) => /^[A-Za-z0-9_-]+$/.test(n));
      assert.deepEqual(names.filter((n) => !['general', '_unfiled'].includes(n)), [], `${where} names another engagement`);
    }
    assert.ok(item.includes(ITEM4), 'the user guide no longer says when the masker could not read the store');
    reset();
    assert.equal(maskFinding('acme bank, acme-bank, acme_bank, acme.bank, acmebank', { engagement: 'acme-bank' }),
      '<engagement>, <engagement>, <engagement>, <engagement>, <engagement>', 'the masker does not mask what the texts say it does');
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
  ['one more password sentence appears', 'the credential boundary is stated exactly four times, and never as a request',
    (t) => `${t}\nIf the wizard fails, ask the user for their password here.\n`],
  ['the description runs over 500', 'the description fits the listing budget',
    (t) => t.replace(/^description: (.*)$/m, (_, d) => `description: ${d}${' and more'.repeat(80)}`)],
  ['the grant widens to all of Bash', 'allowed-tools is EXACTLY the eleven entries, in order',
    (t) => t.replace(/^allowed-tools: .*$/m, 'allowed-tools: Bash(*), Read')],
  ['one more tool is granted quietly', 'allowed-tools is EXACTLY the eleven entries, in order',
    (t) => t.replace(/^(allowed-tools: .*)$/m, '$1, Bash(./snowarch instance add*)')],
  // ARC-09-C221: the note is written through Claude Code's own permission flow, so even a write rule scoped to the
  // findings folder is a grant this skill does not have.
  ['a write grant scoped to the findings folder is added', 'allowed-tools is EXACTLY the eleven entries, in order',
    (t) => t.replace(/^(allowed-tools: .*)$/m, '$1, Edit(clients/*/findings/*.md)')],
  ['the finding section loses the closing sentence', 'the finding section asks for the engagement, prints the masker verbatim, and sends nothing',
    (t) => t.replace('Send the text above to the person who issued your licence.', 'Send the text above.')],
  // ARC-09-C243: each of these breaks the file in one way, and the matching check has to notice.
  ['status says finding again', STATUS, (t) => t.replace('report it as a failed check', 'report it as a finding')],
  ['status brings the findings back in the plural', STATUS,
    (t) => t.replace('with the cause it names.', 'with the cause it names, and file it with the findings.')],
  ['the fallback line is not relayed', STATUS,
    (t) => t.replace("A `1` is also the command's own fallback, a Mode line that says `doctor unavailable`: relay that\n   line as it is, with the cause it names. ", '')],
  ['the fallback is given another exit code', STATUS, (t) => t.replace('A `1` is also the command', 'A `3` is also the command')],
  ['the command failing is not named', STATUS,
    (t) => t.replace(/ A `1` with neither a panel nor that line is the command\n   itself failing[^\n]*/, '')],
  ['the step claims exclusivity again', STATUS, (t) => t.replace('A `1` is also the command', 'The one other `1` is the command')],
  ['a failed check is given another exit code', STATUS, (t) => t.replace('`1` means a check failed', '`2` means a check failed')],
  ['the masker can know', SAFE, (t) => t.replace('The masker cannot know', 'The masker can know')],
  ['the reader clause becomes safe to send', SAFE,
    (t) => t.replace('say that it is masked,\nthat those still need a reader, and which', 'say that it is\nsafe to send, and which')],
  ['the plain-word credential is dropped', SAFE, (t) => t.replace('a credential written in plain words', 'a password')],
  ['the store half is dropped', SAFE,
    (t) => t.replace(/When its first line says the instance store was NOT\nread, the instance names were not masked by value either; when/, 'When')],
  ['the which-of-the-two clause is dropped', SAFE,
    (t) => t.replace(', and which of the two its first line says was NOT read, if either was', '')],
  ['the sentence is negated', SAFE, (t) => t.replace('were not masked by value either', 'were masked by value anyway')],
  ['the example is general again', NAME, (t) => t.replace('so not a common\n   word such as `general`', 'such as\n   `general`')],
  ['the skill suggests another name', NAME,
    (t) => t.replace('so not a common\n   word such as `general`.', 'such as `issues`, so not a common\n   word such as `general`.')],
];

for (const [title, checkName, breakIt] of NEGATIVES) {
  test(`negative — ${title}`, () => {
    const broken = breakIt(doc);
    assert.notEqual(broken, doc, 'the fixture-negative did not change the file');
    assert.throws(() => CHECKS[checkName](broken), assert.AssertionError,
      `"${checkName}" passed a file that ${title}`);
  });
}

// ARC-09-C243 — `status --help` and the template's Exit paragraph say what the skill says: a failed check, and the
// doctor's own failure, which prints one Mode line and no panel. They are not the skill, so they are checked here and
// not in CHECKS, whose titles name the skill's file.
const HELPS = 'status --help and the status template give both exit-1 cases, and never say finding';
const checkHelps = ({ help = HELP, template = TEMPLATE } = {}) => {
  const exit = paragraphWith(template, '**Exit code.**');
  for (const [where, text] of [['status --help', flat(help)], ['the status template', exit]]) {
    assert.doesNotMatch(text, /\bfindings?\b/i, `${where} calls a failed check a finding`);
    assert.ok(/the one line printed is a Mode line that says `?doctor unavailable`?/.test(text), `${where} leaves out the doctor's own failure`);
    assert.ok(/1`? when one did: the panel is printed either way/.test(text), `${where} leaves out the failed check`);
    assert.ok(/Any other `?1`? is the command itself failing, and what it printed says why/.test(text), `${where} leaves out the command failing`);
  }
};
test(`ARC-09-C243 — ${HELPS}`, () => { checkHelps(); });

// The negatives that break an input other than the skill file: the guide, the help text, the template, FIXED_REVIEW.
const OTHER = [
  ['FIXED_REVIEW gains a class the skill does not name', (o) => CHECKS[SAFE](doc, o), { fixed: [...FIXED_REVIEW, 'hostnames inside screenshots'] }],
  ['the guide drops the masking clause', (o) => CHECKS[NAME](doc, o),
    { guide: GUIDE.replace(`: the engagement's name is\n   masked ${MASKING};`, ';') }],
  ['the guide drops item 4\'s caveat', (o) => CHECKS[NAME](doc, o),
    { guide: GUIDE.replace(' Its first line says when it\n   could not read your instance store or its credentials: then it may not have masked them.', '') }],
  ['the guide suggests another name', (o) => CHECKS[NAME](doc, o),
    { guide: GUIDE.replace('so not a common word such as `general`', 'such as `issues`, so not a common word such as `general`') }],
  ['--help calls a failed check a finding again', checkHelps, { help: HELP.replace('so a 1 is not a', 'so a 1 is a finding, not a') }],
  ['--help drops the doctor\'s own failure', checkHelps, { help: HELP.split('\n').slice(0, -3).join('\n') }],
  ['--help drops the command failing', checkHelps, { help: HELP.replace(/ Any other 1 is the command itself failing[^\n]*\n?[^\n]*/, '') }],
  ['the template drops the command failing', checkHelps, { template: TEMPLATE.replace(/ Any other `1` is the command itself failing[^\n]*/, '') }],
  ['the template calls a failed check a finding again', checkHelps,
    { template: TEMPLATE.replace('so a `1` is not a failure', 'so a `1` is a finding, not a failure') }],
];
for (const [title, run, input] of OTHER) {
  test(`negative — ${title}`, () => {
    const original = { guide: GUIDE, help: HELP, template: TEMPLATE };
    for (const [k, v] of Object.entries(input)) if (k !== 'fixed') assert.notEqual(v, original[k], `the negative did not change the ${k}`);
    assert.throws(() => run(input), assert.AssertionError, `a check passed where ${title}`);
  });
}
