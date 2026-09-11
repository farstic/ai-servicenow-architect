/**
 * ARC-09-S09 — the line-ending policy, read from git rather than from the files.
 *
 * `.gitattributes` (ARC-01-S07) is a policy nobody runs. What makes it real is what git does with
 * it at `add` and at `checkout`, and `git ls-files --eol` is git reporting exactly that in one
 * line per file:
 *
 *     i/<index>  w/<worktree>  attr/<attributes>   <path>
 *
 * The INDEX column is the policy's half that holds everywhere: git normalises on `add`, so a
 * committed text file is LF in the object database on every machine, whatever the author's editor
 * did. `i/crlf` means CRLF was committed — a Windows checkout of it is fine and every Unix machine
 * that clones it gets `/bin/bash^M: bad interpreter` from a shell script, which is the symptom this
 * whole story exists for.
 *
 * The WORKTREE column is what checkout wrote, so it depends on the machine AND on whether anything
 * has rewritten the file since. That makes it a CI assertion, not a developer-machine one: on this
 * repository today three `scripts/*.ps1` files sit LF in a working tree because a tool wrote them
 * there, while their index entries — the thing that ships — are correctly LF-with-`eol=crlf`. So
 * the w-column is asserted where a clone has just happened and the answer means something.
 *
 * Sources: `git ls-files --eol` (never a hand-maintained list of files), `.gitattributes` for the
 * rules, `tests/eol.allowlist.json` for the extensions deliberately left to `text=auto`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowlist = JSON.parse(readFileSync(join(root, 'tests/eol.allowlist.json'), 'utf8'));

/** `execFile`, never a shell: a path with a space in it is not this test's problem to quote. */
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });

/**
 * One line of `git ls-files --eol`, parsed.
 *
 * Two shapes have to survive this. A SUBMODULE (a gitlink) has empty index and worktree columns —
 * `i/ w/ attr/text=auto` — because there is no blob to have line endings; `vendor/ServiceNowDocs`
 * is one and it is not a file this policy has anything to say about. An EMPTY file reports
 * `i/none w/none`: no line endings at all is not a violation of any rule here.
 *
 * The attribute column is free text (`text=auto eol=lf`), so it is kept whole and matched on.
 */
function parse(line) {
  const m = /^i\/(\S*)\s+w\/(\S*)\s+attr\/(.*?)\s*\t(.*)$/.exec(line);
  if (!m) return null;
  const [, index, worktree, attr, path] = m;
  return { index, worktree, attr, path, gitlink: index === '' && worktree === '' };
}

/** Every tracked file of a work tree, parsed. Takes a cwd so a fixture can be read the same way. */
const listing = (cwd = root) => execFileSync('git', ['ls-files', '--eol'],
  { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean).map(parse).filter(Boolean);

const entries = listing();
const files = entries.filter((e) => !e.gitlink);

/** `eol=crlf` in the attribute column — the launchers and nothing else, per ARC-01-S07. */
const wantsCrlf = (e) => /\beol=crlf\b/.test(e.attr);
/** A file git treats as binary reports `-text`, or `none` on a git old enough to say so. */
const isBinary = (e) => /(^|\s)-text(\s|$)/.test(e.attr);
/** `text` set by a rule of some shape, as opposed to the catch-all's `text=auto`. */
const explicitlyTexted = (e) => /(^|\s)text(\s|$)/.test(e.attr);

/**
 * THE TWO RULES, as functions over a listing, so the repository and the fixture below are judged
 * by the same code. A second derivation written next to the fixture would be a second opinion, and
 * on the day the two disagree the test is as likely to be wrong as the tree it is judging.
 */
const committedCrlf = (list) => list.filter((e) => !e.gitlink && !isBinary(e))
  .filter((e) => e.index === 'crlf' || e.index === 'mixed')
  .map((e) => `${e.path}: i/${e.index} (attr ${e.attr})`);

const launcherRuleBroken = (list) => list.filter((e) => !e.gitlink)
  .filter((e) => ['.ps1', '.cmd'].includes(extname(e.path)) && !wantsCrlf(e))
  .map((e) => `eol: ${e.path} expected attr eol=crlf w/crlf, got ${e.attr || 'no rule'} w/${e.worktree}`);

test('the parse found a real listing, and the submodule is the only gitlink (ARC-09-S09)', () => {
  // The tripwire on the parser itself: every assertion below is over `files`, and a regex that
  // stopped matching would empty it and pass everything.
  assert.ok(files.length > 500, `only ${files.length} tracked files parsed — the parser is wrong`);
  const links = entries.filter((e) => e.gitlink).map((e) => e.path);
  assert.deepEqual(links, ['vendor/ServiceNowDocs'],
    'a gitlink appeared or disappeared — line-ending rules do not apply to one, so it is skipped');
});

test('no tracked text file was committed with CRLF (ARC-09-S09)', () => {
  // THE assertion. The index is what every clone receives, so this one holds on every OS and is
  // the half that a `core.autocrlf=true` author on Windows would otherwise break for everyone else.
  assert.deepEqual(committedCrlf(entries), [], 'these were committed with CRLF in the index — git normalises on add, '
    + 'so this means `text` was disabled for them, and a Unix clone gets \\r in the file');
});

test('the launchers, and only the launchers, are eol=crlf (ARC-09-S09)', () => {
  const crlf = files.filter(wantsCrlf).map((e) => e.path).sort();
  // By EXTENSION, from the attributes — never a hand list of paths, or the day someone adds
  // a new `.ps1` the test says nothing about it.
  const wrongKind = crlf.filter((p) => !['.ps1', '.cmd'].includes(extname(p)));
  assert.deepEqual(wrongKind, [], 'eol=crlf reached a file that is not a Windows launcher');

  assert.deepEqual(launcherRuleBroken(entries), [], 'a .ps1/.cmd file is missing the eol=crlf rule');
  // The index stays LF for these too: `eol=crlf` is a CHECKOUT instruction. A `.cmd` committed as
  // CRLF would be `i/crlf`, which the previous test catches — this states the pair explicitly so
  // the two halves of the rule cannot be confused by a later reader.
  const notLfIndex = files.filter(wantsCrlf).filter((e) => !['lf', 'none'].includes(e.index))
    .map((e) => `${e.path}: i/${e.index}`);
  assert.deepEqual(notLfIndex, [], 'eol=crlf does not mean CRLF in the index');
});

test('the working tree matches the policy where a checkout wrote it (ARC-09-S09)', (t) => {
  // A fresh clone is the precondition. CI has one; a developer's tree may not, and three
  // `scripts/*.ps1` files in this repository are LF on disk today because a tool wrote them after
  // checkout. Skipping there is not weakening the suite: the `eol` job runs this same file on a
  // just-cloned tree on both OSes, which is where the answer carries information.
  const dirty = files.filter(wantsCrlf).filter((e) => e.worktree !== 'crlf');
  if (dirty.length > 0 && !process.env.CI) {
    t.skip(`not a fresh checkout: ${dirty.map((e) => `${e.path} w/${e.worktree}`).join(', ')}`);
    return;
  }
  const bad = dirty.map((e) => `eol: ${e.path} expected attr eol=crlf w/crlf, got ${e.attr} w/${e.worktree}`);
  assert.deepEqual(bad, []);

  const lfFiles = files.filter((e) => !wantsCrlf(e) && !isBinary(e) && e.worktree === 'crlf')
    .map((e) => `eol: ${e.path} expected w/lf, got w/crlf`);
  assert.deepEqual(lfFiles, [], 'a checkout wrote CRLF into a file the policy holds at LF');
});

/**
 * Every tracked file answered by SOMETHING: a rule in `.gitattributes`, a path-scoped rule git
 * resolved for it, or an allow-list entry with a reason. A function, so AC 5 can put a fixture
 * through the same code rather than through a second description of it.
 */
function uncoveredFiles(list, attributes, allow) {
  // The rules, read from the file: `*.mjs`, and the extensionless names like `snowarch`.
  const ruledExts = new Set([...attributes.matchAll(/^\*(\.[A-Za-z0-9]+)\s/gm)].map((m) => m[1].toLowerCase()));
  const ruledNames = new Set([...attributes.matchAll(/^([A-Za-z0-9_.-]+)\s+text/gm)].map((m) => m[1]));

  const uncovered = [];
  for (const e of list.filter((x) => !x.gitlink)) {
    const name = basename(e.path);
    const ext = extname(name).toLowerCase();
    if (ext) {
      if (ruledExts.has(ext) || allow.extensions[ext]) continue;
      // A PATH-scoped rule (`packages/snowarch/dist/**`) covers it too, and only git knows how the
      // patterns resolved — so read its answer. The tell is `text` SET versus `text=auto`: an
      // explicit rule of any shape sets it, the catch-all `* text=auto eol=lf` does not. Testing
      // for `eol=lf` instead would clear every file in the repository, because the catch-all puts
      // `eol=lf` on all of them — which is exactly what this test did until AC 5's fixture, whose
      // `x.pyw` went unreported, showed the check was passing without checking anything.
      if (explicitlyTexted(e)) continue;
      uncovered.push(`${e.path} (${ext})`);
    } else {
      // Extensionless by NAME, never "an extension that is the empty string": `snowarch`, `LICENSE`
      // and the dot-files are real tracked files and each needs its own answer.
      if (ruledNames.has(name) || allow.names[name]) continue;
      if (explicitlyTexted(e)) continue;
      uncovered.push(`${e.path} (no extension)`);
    }
  }
  return uncovered;
}

test('every tracked extension is covered by a rule or an allow-list entry (ARC-09-S09)', () => {
  const attributes = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.deepEqual(uncoveredFiles(entries, attributes, allowlist), [],
    'add a rule to .gitattributes, or an entry with a reason to '
    + 'tests/eol.allowlist.json — an uncovered file is one `text=auto` guess away from CRLF');
});

test('AC 5 — a new extension with no rule and no entry is reported by name', (t) => {
  // `x.pyw`, the story’s own example (named there under `scripts/`). The point is that `* text=auto eol=lf` catching it
  // is NOT an answer: text=auto guesses from content, and the guess is what the policy file exists
  // to remove. An uncovered file must be a decision somebody wrote down, either way.
  const { dir } = fixtureRepo(t, {
    attributes: '* text=auto eol=lf\n*.mjs text eol=lf\n',
    files: { 'x.pyw': 'print(1)\n', 'ok.mjs': 'export const a = 1;\n' },
    autocrlf: false,
  });
  const attributes = '* text=auto eol=lf\n*.mjs text eol=lf\n';
  const empty = { extensions: {}, names: {} };
  const found = uncoveredFiles(listing(dir), attributes, empty);
  assert.ok(found.includes('x.pyw (.pyw)'), `x.pyw was not reported: ${JSON.stringify(found)}`);
  assert.ok(!found.some((f) => f.startsWith('ok.mjs')), 'a ruled file was reported as uncovered');
  // And an allow-list entry is what clears it — the escape hatch works, and costs a reason.
  const cleared = uncoveredFiles(listing(dir), attributes,
    { extensions: { '.pyw': 'a fixture' }, names: {} });
  assert.ok(!cleared.some((f) => f.startsWith('x.pyw')), 'the allow-list did not clear the file');
});

test('the allow-list has no entry for something that is no longer tracked (ARC-09-S09)', () => {
  const exts = new Set(files.map((e) => extname(e.path).toLowerCase()).filter(Boolean));
  const names = new Set(files.map((e) => basename(e.path)));
  const stale = [
    ...Object.keys(allowlist.extensions).filter((x) => !exts.has(x)).map((x) => `extension ${x}`),
    ...Object.keys(allowlist.names).filter((n) => !names.has(n)).map((n) => `name ${n}`),
  ];
  // An allow-list that outlives its subject is how an exception becomes permanent by accident.
  assert.deepEqual(stale, [], 'remove these from tests/eol.allowlist.json — nothing tracked matches');
});

test('a binary file is reported as binary, and the parser says so (ARC-09-S09)', () => {
  // AMENDMENT (ARC-09-S09): the story's criterion names `*.png`/`*.docx`, and this repository
  // tracks NEITHER today — `git ls-files '*.png'` is empty. An assertion over an empty set proves
  // nothing, so the rule is exercised against a real `git check-attr` answer instead, and the
  // `.gitattributes` rule that would apply is asserted to exist. If a PNG is ever committed,
  // `isBinary` is already what the other tests exclude by.
  assert.match(readFileSync(join(root, '.gitattributes'), 'utf8'), /^\*\.png\s+binary$/m,
    'the binary rule went missing from .gitattributes');
  const answer = git('check-attr', 'text', '--', 'docs/some-image.png').trim();
  assert.match(answer, /text: unset$/, '`binary` must unset `text` — that is what makes it binary');
  assert.deepEqual(files.filter(isBinary).map((e) => e.path), [],
    'a binary file is now tracked — add it to this test rather than leaving the case unexercised');
});

/**
 * AC 4 — the test FAILS on the two violations it exists to catch.
 *
 * The story proposes proving this with throwaway pull requests. A fixture repository proves the
 * same two things deterministically, on every cell, for ever — and a throwaway PR proves it once,
 * on the day someone remembers to open it. What is judged here is not a copy of the rules: it is
 * `committedCrlf` and `launcherRuleBroken`, the exact functions the repository is judged by above.
 *
 * Fixture lessons already paid for by this arc: the tree carries its OWN `.gitattributes` (without
 * it the fixture inherits nothing and the attribute column is empty — ARC-09-S07), the identity is
 * per-command so no global git config is required to exist (ARC-08-S05), and `GIT_CONFIG_GLOBAL`
 * is pointed at nothing so a developer's own settings cannot change the answer.
 */
function fixtureRepo(t, { attributes, files: contents, autocrlf }) {
  const box = tempDir('snowarch-eol-', t);
  // The repository is a SUBDIRECTORY of the box, so the only files in its listing are the ones
  // this fixture plants. The empty config below lives in the box beside it — inside the repo it
  // would be committed by `git add -A` and show up in every assertion made about the tree.
  const dir = join(box, 'repo');
  mkdirSync(dir);
  // An EMPTY FILE, not `os.devNull`. On Windows `devNull` is `\\\\.\\nul`, which git cannot open as a
  // config path — `git init` failed outright on the `eol (windows-latest)` cell while both
  // fixtures passed locally on macOS. A real empty file is a valid config file on every platform,
  // and it says the same thing: this fixture reads no global or system git config, so a
  // developer's own settings cannot change what the test measures.
  const noConfig = join(box, 'empty-gitconfig');
  writeFileSync(noConfig, '');
  const run = (...args) => execFileSync('git', ['-c', 'user.email=f@example.invalid',
    '-c', 'user.name=Fixture', ...args],
  { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: noConfig, GIT_CONFIG_SYSTEM: noConfig } });
  run('init', '-q', '-b', 'main');
  run('config', 'core.autocrlf', String(autocrlf));
  writeFileSync(join(dir, '.gitattributes'), attributes);
  for (const [name, body] of Object.entries(contents)) writeFileSync(join(dir, name), body);
  run('add', '-A');
  run('commit', '-qm', 'fixture');
  return { dir, run };
}

test('AC 4a — a .cmd committed without the rule is reported with the expected/actual pair', (t) => {
  // No `*.cmd` line at all: the file falls to `text=auto`, is checked out LF, and `cmd.exe` gets a
  // batch file whose labels it is widely reported to mis-parse. This is the shape of the mistake —
  // not a wrong value, a MISSING rule — and it is the one a hand-written policy file invites.
  const { dir } = fixtureRepo(t, {
    attributes: '* text=auto eol=lf\n*.mjs text eol=lf\n',
    files: { 'launcher.cmd': '@echo off\r\ngoto :main\r\n:main\r\nexit /b 0\r\n' },
    autocrlf: false,
  });
  const broken = launcherRuleBroken(listing(dir));
  assert.equal(broken.length, 1, `expected one violation, got ${JSON.stringify(broken)}`);
  assert.match(broken[0], /^eol: launcher\.cmd expected attr eol=crlf w\/crlf, got/);
});

test('AC 4b — a .mjs committed with CRLF is reported as i/crlf', (t) => {
  // `-text` is how a real author gets here: it disables normalisation, so the CRLF bytes go into
  // the index verbatim and every Unix clone receives them. `core.autocrlf=true` alone would NOT do
  // it — git still normalises on add — which is exactly why the index column is the one that
  // carries the policy.
  const { dir } = fixtureRepo(t, {
    attributes: '* text=auto eol=lf\n*.mjs -text\n',
    files: { 'server.mjs': 'export const x = 1;\r\nexport const y = 2;\r\n' },
    autocrlf: true,
  });
  const list = listing(dir);
  const mjs = list.find((e) => e.path === 'server.mjs');
  assert.equal(mjs.index, 'crlf', `the fixture did not commit CRLF: i/${mjs.index} attr ${mjs.attr}`);
  // `-text` also means "binary" to the exclusion above, so the report is asserted on the entry the
  // rule sees, not on a filtered-out one — a fixture that proved nothing would look identical.
  assert.ok(isBinary(mjs), 'the fixture used -text, which is what a real offender does');
  const withText = listing(fixtureRepo(t, {
    attributes: '* text=auto eol=lf\n',
    files: { 'server.mjs': 'export const x = 1;\r\nexport const y = 2;\r\n' },
    autocrlf: false,
  }).dir);
  // And with the repository's own attributes, the same bytes normalise to LF — the policy working.
  assert.equal(withText.find((e) => e.path === 'server.mjs').index, 'lf',
    'text=auto did not normalise CRLF on add — the premise of the index assertion is wrong');
  const reported = committedCrlf([{ ...mjs, attr: 'text' }]);
  assert.deepEqual(reported, ['server.mjs: i/crlf (attr text)']);
});
