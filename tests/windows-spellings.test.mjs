/**
 * ARC-07-C1 (opened rc.3, closed by W7) — the Windows spelling, kept.
 *
 * PowerShell does not resolve a command from the current directory, and nothing in the bootstrap puts
 * the checkout on PATH — so a bare `snowarch.cmd` is the one spelling PowerShell refuses, and `cd /d`
 * with `&&` is cmd.exe syntax that PowerShell 5.1 cannot parse. C1 found both and was left open for
 * two releases while the count grew.
 *
 * WHAT THIS FILE CLAIMS, AND WHAT IT DOES NOT. Every assertion here is about OUR OUTPUT: what the
 * renderers produce for a Windows shell, and what the user-facing pages say. **The refusal itself is
 * not measured** — `command -v pwsh` finds no PowerShell on this machine, which is exactly what C1
 * recorded when it was opened — so the evidence for the rule is PowerShell's documented behaviour,
 * `spellings()`'s own `.\\bootstrap.cmd` (right beside the `cli` that lacked it), and the sixteen
 * `.\snowarch.cmd` spellings `docs/MIGRATION.md` already used. The S08 Windows sitting is the live
 * check, and its record quotes the first command a PowerShell 5.1 user copies.
 *
 * THE FIXTURE IS `{ platform: 'win32', env: {} }`, AND THE EMPTY ENV IS LOAD-BEARING. `isWindowsShell`
 * is `platform === 'win32' && !env.SHELL && !env.MSYSTEM` — deliberately, so Git Bash on Windows keeps
 * the POSIX spellings — and `env` defaults to `process.env`. So `spellings({ platform: 'win32' })`
 * returns the POSIX strings on any machine with `SHELL` set, and a case written that way asserts the
 * POSIX spelling and **passes against the unfixed product**. It bit once during this row for real: the
 * `noTtyMessage` call sites passed `platform` and not `env`, so a win32 message rendered `./snowarch`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spellings } from '../tools/snowarch/lib/text.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/**
 * A bare `snowarch.cmd` that is being INVOKED — not merely named.
 *
 * One definition, two readers (the sweep and its negative), so the rule cannot be stated twice and
 * drift. The verb list is explicit rather than `\w+`: a sentence like "`snowarch.cmd` is the CLI
 * wrapper" must not match, and a pattern loose enough to catch every invocation would catch that too.
 */
const BARE_INVOCATION =
  /(?<!\.\\)snowarch\.cmd\s+(?:…|--|status|doctor|mode|instance|upgrade|store|version|docs|help)/;

/** The Windows shell, stated rather than inherited. */
const WIN = { platform: 'win32', env: {} };

test('the launcher is spelled the way Windows can run it, in both packages', async () => {
  const win = spellings(WIN);
  assert.equal(win.cli, '.\\snowarch.cmd');
  assert.equal(win.bootstrap, '.\\bootstrap.cmd');

  // THE SERVER'S COPY AGREES WITH THE ENGINE'S. They cannot be one function: the engine may import
  // the server's `dist/` (`cloud-sync.mjs` does) and the server must never import the engine, so the
  // rule is re-stated — and a re-statement with nothing holding it to the original is how two
  // surfaces come to spell one command differently. Four shells, both copies, same answers.
  const { cliSpelling } = await import('../packages/snowarch/dist/cli/tty.js');
  for (const [where, expected] of [
    [WIN, '.\\snowarch.cmd'],
    [{ platform: 'win32', env: { SHELL: '/bin/bash' } }, './snowarch'],   // Git Bash on Windows
    [{ platform: 'win32', env: { MSYSTEM: 'MINGW64' } }, './snowarch'],   // …and MSYS
    [{ platform: 'darwin', env: {} }, './snowarch'],
  ]) {
    assert.equal(spellings(where).cli, expected, `engine: ${JSON.stringify(where.env)}`);
    assert.equal(cliSpelling(where.platform, where.env), expected,
      `server: ${JSON.stringify(where.env)}`);
  }
});

/**
 * ARC-07-W17 — THE LAUNCHER IS NEVER SPELLED EXCEPT BY THE DEFINITIONS.
 *
 * ARC-07-C1 named four sources. ARC-07-C21 found the same defect in four more it never reached and
 * built the guard below over a hand-kept list of renderers — which is an allow-list by another name:
 * ARC-07-W14 added `plan.mjs` to it and the guard immediately found an eighty-ninth site that had sat
 * in the Node-free branch since it was written. A list somebody has to remember to extend is a guard
 * that finds what its author already knew.
 *
 * So this reads EVERY shipped source file instead, and the two definitions are the only exemptions.
 * The first measurement of it found **164 non-definition sites across 48 files** — against the 79 in
 * 19 that my own first inventory reported, because that inventory's pattern required a quote
 * immediately before the path and so saw only launchers that START a string. The instrument
 * under-reported by more than half, which is why the guard is a guard and not a list.
 */
const LAUNCHER_PATTERNS = Object.freeze([
  [/\.\/snowarch\b/, 'a literal ./snowarch'],
  [/\.\/bootstrap\.sh\b/, 'a literal ./bootstrap.sh'],
  // TWO LOOKBEHINDS, and the second is the one my own negative case caught. In a DOC the correct
  // spelling is `.\snowarch.cmd` — one backslash — but in SOURCE it is written `'.\\snowarch.cmd'`,
  // and this guard reads source. A single `(?<!\.\\)` therefore FIRED on the correct spelling, which
  // would have made the sweep replace right answers with right answers forever. ARC-07-C21 recorded
  // the same shape from the other side: the correct spelling CONTAINS the wrong one.
  [/(?<!\.\\)(?<!\.\\\\)\bsnowarch\.cmd\b/, 'a BARE snowarch.cmd — PowerShell refuses it'],
  [/(?<!\.\\)(?<!\.\\\\)\bbootstrap\.cmd\b/, 'a BARE bootstrap.cmd — PowerShell refuses it'],
  [/usage: snowarch\b/, 'a BARE `usage: snowarch` — the name is never on PATH'],
]);

/** The two files that ARE the definitions, and the only ones allowed to spell a launcher. */
const DEFINITIONS = Object.freeze([
  'tools/snowarch/lib/text.mjs',
  'packages/snowarch/src/cli/tty.ts',
]);

/**
 * ...and one DATA file, exempt by the architect's ruling rather than by convenience.
 *
 * `errors/codes.ts` is the source of `.claude/rules/00-mode-and-mcp-gate.md`, which is GENERATED AND
 * COMMITTED: it cannot know the reader's shell, so it must render one spelling on every machine or
 * `gen:check` fails on either a maintainer's mac or the Windows cell. The ruling (2026-09-27) is that
 * the page keeps the POSIX spelling and carries ONE line at the top telling a PowerShell reader what to
 * substitute — because doubling would spell every command twice on nineteen lines.
 *
 * WHAT THIS EXEMPTION DOES NOT COVER, said plainly so the next reader does not assume it does: the
 * RUNTIME half. When the server or the engine prints one of these remedies to a terminal it should
 * derive the spelling, and today it does not — both `remedyFor` implementations return the stored text.
 * I attempted it in this row with a `{cli}` placeholder and reverted: the engine reads remedies through
 * `packages/contract/lib/contract.mjs`, whose `remedyFor` does no substitution, so the placeholder would
 * have printed `{cli}` to users. It needs a second substitution point and a contract-sha bump, which is
 * ARC-07-C32, target 2.0.7 — a contract change does not enter a release in its last hours.
 */
const DATA_EXEMPT = Object.freeze(['packages/snowarch/src/errors/codes.ts']);

/**
 * THE SWEEP REMAINDER — ARC-07-C31, dated 2026-09-27, target 2.0.7.
 *
 * WHY AN EXEMPTION AT ALL, and it is not taste: a red assertion here fails the release-dryrun cells on
 * mac and ubuntu, so a guard left red blocks `release.mjs` itself. The sweep is 76 sites in 34 files and
 * three of them — `steps/B02.mjs`, `bootstrap.mjs`, `commands/upgrade.mjs` — are e2e trigger files,
 * where a hurried mistake is not a red test but a broken install on the platform a mac cannot check. So
 * it lands in 2.0.7 under ARC-07-C31 rather than in the last hours of this one.
 *
 * AN EXACT COUNT PER FILE, ASSERTED EQUAL AND NEVER `<=`, so this cannot become a place new defects
 * hide: adding a literal to a listed file fails exactly as loudly as adding one to an unlisted file,
 * and REMOVING one fails too — which is deliberate, because the count coming down means the sweep has
 * started and the list must shrink with it rather than drift out of date silently.
 *
 * The numbers are the measurement at this head, not an estimate; the row carries the same table.
 */
const SWEEP_REMAINDER = Object.freeze(new Map([
  ['packages/snowarch/src/cli/format.ts', 2],
  ['packages/snowarch/src/cli/import-legacy.ts', 3],
  ['packages/snowarch/src/cli/store-command.ts', 3],
  ['packages/snowarch/src/doctor/checks.ts', 8],
  ['packages/snowarch/src/doctor/probes-binding.ts', 1],
  ['packages/snowarch/src/doctor/types.ts', 1],
  ['packages/snowarch/src/no-instance.ts', 1],
  ['packages/snowarch/src/store/index.ts', 1],
  ['packages/snowarch/src/store/migrations/index.ts', 3],
  ['packages/snowarch/src/store/schema.ts', 2],
  ['packages/snowarch/src/tools/updateset.ts', 2],
  ['packages/snowarch/src/utils/permissions.ts', 3],
  ['scripts/ci/doctor-snapshot.mjs', 2],
  ['scripts/gen-cli-help.mjs', 1],
  ['scripts/gen-doctor-docs.mjs', 1],
  ['scripts/lib/release/preflight.mjs', 1],
  ['tools/snowarch/lib/bootstrap.mjs', 3],
  ['tools/snowarch/lib/cli.mjs', 6],
  ['tools/snowarch/lib/commands/status.mjs', 1],
  ['tools/snowarch/lib/commands/upgrade.mjs', 4],
  ['tools/snowarch/lib/docs/family.mjs', 3],
  ['tools/snowarch/lib/docs/status.mjs', 2],
  ['tools/snowarch/lib/docs/upstream.mjs', 1],
  ['tools/snowarch/lib/docs/verify.mjs', 2],
  ['tools/snowarch/lib/instance.mjs', 2],
  ['tools/snowarch/lib/mode.mjs', 2],
  ['tools/snowarch/lib/net-sentences.mjs', 1],
  ['tools/snowarch/lib/state.mjs', 3],
  ['tools/snowarch/lib/steps/B02.mjs', 4],
  ['tools/snowarch/lib/steps/B04.mjs', 1],
  ['tools/snowarch/lib/steps/format.mjs', 4],
  ['tools/snowarch/lib/steps/index.mjs', 1],
  ['tools/snowarch/lib/store.mjs', 1],
  ['tools/snowarch/lib/version-info.mjs', 1]
]));

/**
 * Comments stripped: prose ABOUT the defect is not the defect.
 *
 * BLOCK COMMENTS ARE BLANKED, NOT REMOVED, and that distinction is the whole reason this helper has a
 * comment. Deleting a block comment deletes its NEWLINES, so every line number after the first one
 * shifts — and a guard whose message tells a maintainer `engine-docs.mjs:54` when the site is at 59
 * sends them to the wrong line, which for a 163-site sweep is most of the cost of using it. The counts
 * were right the whole time, which is exactly why it went unnoticed until the numbers were read back
 * against the file. The same bug was in the sweeper I wrote to fix these sites, caught there first.
 */
const codeOf = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat((block.match(/\n/g) ?? []).length))
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

test('ARC-07-W17 — no shipped file spells the launcher except the two definitions', () => {
  const files = execFileSync('git',
    ['ls-files', 'tools/snowarch/lib', 'tools/snowarch/bin', 'packages/snowarch/src', 'scripts'],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n')
    .filter((f) => /\.(mjs|ts|js)$/.test(f) && !/\.test\./.test(f) && !/\.d\.ts$/.test(f))
    .filter((f) => !DEFINITIONS.includes(f) && !DATA_EXEMPT.includes(f));

  const offences = [];
  const counted = new Map();
  for (const rel of files) {
    const here = [];
    codeOf(read(rel)).split('\n').forEach((line, i) => {
      for (const [pattern, why] of LAUNCHER_PATTERNS) {
        if (pattern.test(line)) here.push(`${rel}:${i + 1}: ${why}`);
      }
    });
    if (SWEEP_REMAINDER.has(rel)) counted.set(rel, here.length);
    else offences.push(...here);
  }
  assert.deepEqual(offences, [],
    `${offences.length} site(s) spell a launcher instead of reading it:\n  ${offences.join('\n  ')}`);

  // ...AND THE LISTED FILES ARE HELD TO THEIR EXACT COUNT. Equal, not `<=`: a new literal in a listed
  // file must fail as loudly as one anywhere else, and a count that has come DOWN must fail too, so the
  // list shrinks with the sweep instead of quietly outliving it.
  const drift = [];
  for (const [rel, expected] of SWEEP_REMAINDER) {
    const actual = counted.get(rel);
    if (actual === undefined) drift.push(`${rel} is listed but was not read — has it moved or gone?`);
    else if (actual !== expected) drift.push(`${rel}: ${actual} site(s), the list says ${expected}`);
  }
  assert.deepEqual(drift, [],
    `ARC-07-C31's list no longer matches the tree:\n  ${drift.join('\n  ')}`);
});

test('...and the negative: the widened guard sees a planted spelling in any shipped file', () => {
  // The instrument is tested, because a guard that cannot see is indistinguishable from a clean tree.
  const seen = (line) => LAUNCHER_PATTERNS.some(([p]) => p.test(line));
  assert.equal(seen("  remedy: './snowarch upgrade',"), true);
  assert.equal(seen("  remedy: './bootstrap.sh',"), true);
  assert.equal(seen("  const launcher = 'snowarch.cmd';"), true);
  assert.equal(seen("  win32 ? 'bootstrap.cmd' : x"), true);
  assert.equal(seen("  'usage: snowarch instance <command>',"), true);
  // ...and the correct forms are NOT reported: the definitions' own output, and a derived spelling.
  assert.equal(seen('  remedy: `${SPELL.cli} upgrade`,'), false);
  assert.equal(seen("  remedy: `${cliSpelling()} upgrade`,"), false);
  assert.equal(seen("  win32 ? '.\\\\bootstrap.cmd' : x"), false, 'the correct Windows spelling');
  assert.equal(seen('  `usage: ${cli} instance <command>`,'), false);
});

test('ARC-07-W17 — a MODE_VARIANT with no spelling THROWS rather than printing one', async () => {
  // THE SECOND TIME THIS ROW LEARNED THE SAME RULE. Making these variants read `spellings()` from the
  // PROCESS satisfied the SessionStart hook and broke the other two consumers across TWELVE Windows
  // cells: `gen-doctor-docs.mjs` rendered `.\snowarch.cmd` into a committed page, so `gen:check` went
  // stale and failed `lint`, `contract`, the release rehearsal and E-21 in the doctor itself.
  //
  // Three consumers, three different shells — the doctor's ctx, a pinned POSIX page, the person at the
  // terminal — so there is no default that can be right, and the miss must be loud.
  const { MODE_VARIANTS } = await import('../tools/snowarch/lib/text.mjs');
  for (const name of ['unconfigured', 'noInstanceLoaded', 'notBootstrapped']) {
    assert.throws(() => MODE_VARIANTS[name](), { name: 'TypeError', message: /needs a spellings object/ },
      `${name} accepted no spelling`);
  }
  assert.throws(() => MODE_VARIANTS.serverDisabled('pdi'), { name: 'TypeError' });
  // ...and the positive direction, so the guard is not merely refusing everything.
  const win = { cli: '.\\snowarch.cmd', bootstrap: '.\\bootstrap.cmd' };
  assert.match(MODE_VARIANTS.notBootstrapped(win), /\.\\bootstrap\.cmd$/);
  assert.match(MODE_VARIANTS.unconfigured(win), /\.\\snowarch\.cmd mode live/);
});

test('no renderer builds a CLI command out of a literal path', () => {
  // THE C60 SHAPE: the fix is one thing, and this is what stops the eighty-ninth arriving. A literal
  // `./snowarch` inside a string that a renderer prints is the defect C1 named; a literal in a COMMENT
  // is prose about the defect and is allowed, which is why the comments are stripped first.
  const renderers = [
    'tools/snowarch/lib/text.mjs',
    'tools/snowarch/lib/steps/B06.mjs',
    // ARC-07-W14 — the plan screen started spelling a command (`docs sync`, in the `skip` meaning),
    // so it joins the list the moment it does. ARC-07-C21's whole lesson was that C1 named four
    // sources and the same defect sat in four more it never reached; a renderer added to this list
    // when it gains its first command is how a fifth does not arrive later.
    'tools/snowarch/lib/plan.mjs',
    'packages/snowarch/src/cli/tty.ts',
    'packages/snowarch/src/cli/preset-ui.ts',
  ];
  const offences = [];
  for (const rel of renderers) {
    const code = read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // The two definitions are allowed to spell both forms: they ARE the definitions.
    const isDefinition = rel.endsWith('text.mjs') || rel.endsWith('tty.ts');
    if (isDefinition) continue;
    for (const bad of ['./snowarch', 'snowarch.cmd']) {
      if (code.includes(bad)) offences.push(`${rel} spells ${bad} instead of reading the spelling`);
    }
  }
  assert.deepEqual(offences, [], offences.join('\n'));
});

test('no user-facing page tells a Windows reader to type a command their shell refuses', () => {
  // TRACKED FILES ONLY, and `docs/plans/**` is exempt: those are records of what was true when they
  // were written, and rewriting one to match today's code destroys the finding it holds.
  const tracked = execFileSync('git', ['ls-files', 'docs', 'README.md', '.claude'],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n').filter((f) => f.endsWith('.md') || f.endsWith('.txt'));

  const offences = [];
  for (const rel of tracked) {
    if (rel.startsWith('docs/plans/') || rel.startsWith('docs/validation/')
      || rel.startsWith('docs/spikes/') || rel === 'docs/CHANGELOG.md') continue;
    read(rel).split('\n').forEach((line, i) => {
      // TWO CONDITIONS, AND THE SECOND IS THE ONE THAT TOOK THE WORK. A bare `snowarch.cmd` is one
      // not preceded by `.\` — the lookbehind matters because the correct spelling CONTAINS the wrong
      // one, so `includes` would report all 104. But a bare name is only WRONG when it is being
      // INVOKED: `docs/ARCHITECTURE.md`'s file tree, its component table and two sentences about what
      // the wrapper does all name `snowarch.cmd` as a FILE, and `.\snowarch.cmd` would be wrong there
      // — that is the file's name. `docs/PLATFORM-NOTES.md` names the artifact S-04 tested. So the
      // rule fires only when a subcommand or a flag follows, which is what makes it a command
      // somebody types. The first version of this check reported all five of those as defects.
      if (BARE_INVOCATION.test(line)) {
        offences.push(`${rel}:${i + 1}: bare snowarch.cmd — PowerShell refuses it`);
      }
      if (line.includes('cd /d ')) {
        offences.push(`${rel}:${i + 1}: cd /d is cmd.exe syntax; PowerShell 5.1 cannot parse it`);
      }
    });
  }
  assert.deepEqual(offences, [], `${offences.length} bare spelling(s):\n  ${offences.join('\n  ')}`);
});

test('...and the negative: the check sees a planted bare spelling', () => {
  // The instrument is tested, because a guard that cannot see is indistinguishable from a tree that
  // is clean — the defect this programme keeps finding in checks that cannot tell absence from
  // failure. Both patterns, and the correct spelling must NOT be reported.
  const bare = (line) => BARE_INVOCATION.test(line);
  assert.equal(bare('run snowarch.cmd doctor'), true, 'a bare invocation must be seen');
  assert.equal(bare('run .\\snowarch.cmd doctor'), false, 'the correct spelling must not be reported');
  assert.equal(bare('(Windows: snowarch.cmd mode live)'), true);
  assert.equal(bare('snowarch.cmd instance add <label>'), true);
  assert.equal(bare('snowarch.cmd --help'), true);
  // ...AND THE OTHER DIRECTION, which is the half that needed measuring: naming the FILE is not a
  // defect, and a check that flagged it would have had five false positives and an allow-list.
  assert.equal(bare('├── snowarch · snowarch.cmd    post-install launcher'), false, 'a file tree');
  assert.equal(bare('`snowarch.cmd` is the CLI wrapper, and prints the Node sentence'), false,
    'a sentence about the file');
  assert.equal(bare('`bootstrap.cmd` · `snowarch` · `snowarch.cmd` · `.mcp.json`'), false, 'a list');
  assert.equal('cd /d "{root}" && .\\bootstrap.cmd'.includes('cd /d '), true);
});

test('ARC-07-W17 — no generator can render a launcher for the machine it runs on', () => {
  // EVERY GENERATED TARGET IS COMMITTED, so its bytes must be identical on every runner or `gen:check`
  // fails on one of them — and that failure is not cosmetic: on the twelve red Windows cells it took
  // down `lint`, `contract`, the release rehearsal and E-21 in the doctor, because all four read the
  // generated tree. The cause was one generator calling a spelling that read the PROCESS.
  //
  // So the rule is checked rather than remembered: a generator that spells a launcher must PIN the
  // shell it is spelling for. `spellings({ platform: 'linux', env: {} })` says which rendering it means;
  // a bare `spellings()` or `cliSpelling()` means "whatever this machine is", which for a committed file
  // is never right. I cannot force `process.platform` locally — ARC-07 measured that as unusable, since
  // `win32.resolve` on POSIX paths fails everything — so the property is asserted structurally instead.
  const generators = execFileSync('git', ['ls-files', 'scripts', 'packages/contract/gen'],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n').filter((f) => /\.mjs$/.test(f) && !/\.test\./.test(f));

  const offences = [];
  for (const rel of generators) {
    codeOf(read(rel)).split('\n').forEach((line, i) => {
      // A call with no argument at all, or with a platform that is not pinned to a literal.
      if (/\b(spellings|cliSpelling|bootstrapSpelling)\(\s*\)/.test(line)) {
        offences.push(`${rel}:${i + 1}: an unpinned spelling — a generated file would differ per runner`);
      }
    });
  }
  assert.deepEqual(offences, [],
    `${offences.length} generator line(s) spell a launcher for the running machine:\n  `
    + offences.join('\n  '));
});

test('...and the negative: the generator check sees an unpinned call', () => {
  const unpinned = (line) => /\b(spellings|cliSpelling|bootstrapSpelling)\(\s*\)/.test(line);
  assert.equal(unpinned('  const cli = spellings().cli;'), true);
  assert.equal(unpinned('  cliSpelling()'), true);
  assert.equal(unpinned("  spellings({ platform: 'linux', env: {} }).cli"), false, 'a pinned call');
  assert.equal(unpinned("  spellings({ platform, env })"), false, 'a threaded call is the caller\'s');
});
