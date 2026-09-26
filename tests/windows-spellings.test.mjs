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

test('no renderer builds a CLI command out of a literal path', () => {
  // THE C60 SHAPE: the fix is one thing, and this is what stops the eighty-ninth arriving. A literal
  // `./snowarch` inside a string that a renderer prints is the defect C1 named; a literal in a COMMENT
  // is prose about the defect and is allowed, which is why the comments are stripped first.
  const renderers = [
    'tools/snowarch/lib/text.mjs',
    'tools/snowarch/lib/steps/B06.mjs',
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
