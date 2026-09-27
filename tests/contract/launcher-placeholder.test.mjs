/**
 * ARC-07-C32 — the launcher placeholder, held from both ends.
 *
 * `packages/snowarch/src/errors/codes.ts` is read by three audiences that cannot share one spelling: the
 * generated rules page and TROUBLESHOOTING are COMMITTED, so their bytes must be identical on every
 * runner; the server and the engine's doctor print to whoever is reading. So the table holds `<cli>` and
 * `<bootstrap>` and every reader fills them in.
 *
 * That arrangement has exactly two ways to fail, and this file is one case for each:
 *
 *   1. A NEW ENTRY WITH A LITERAL. It renders correctly on the page (which is POSIX anyway) and lies to
 *      every Windows reader at runtime — which is the original defect, reintroduced one entry at a time
 *      and invisible on a mac.
 *   2. A READER THAT DOES NOT SUBSTITUTE. The placeholder reaches a person verbatim. That is not
 *      hypothetical: ARC-07-W17's first attempt at this shipped `{cli}` into user-facing text because the
 *      engine's `remedyFor` did no substitution, and reverting it is why C32 became a row rather than a
 *      fix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** Comments blanked, line count preserved — the same rule the launcher sweep uses. */
const codeOf = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat((block.match(/\n/g) ?? []).length))
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

test('ARC-07-C32 — no error-code entry spells a launcher; they all use the placeholder', () => {
  const offences = [];
  codeOf(read('packages/snowarch/src/errors/codes.ts')).split('\n').forEach((line, i) => {
    if (/\.\/snowarch\b|\.\/bootstrap\.sh\b|\.\\\\snowarch\.cmd/.test(line)) {
      offences.push(`packages/snowarch/src/errors/codes.ts:${i + 1}: ${line.trim()}`);
    }
  });
  assert.deepEqual(offences, [],
    'an entry spells the launcher instead of using `<cli>`/`<bootstrap>`. The page it renders into is '
    + 'POSIX either way, so this is green on a mac and wrong for every Windows reader at runtime:\n  '
    + offences.join('\n  '));

  // ...and the placeholder is actually THERE, so the case above cannot pass by the table losing its
  // launchers altogether. A floor, for the same reason every other floor in this programme exists.
  const text = read('packages/snowarch/src/errors/codes.ts');
  const placeholders = (text.match(/<cli>/g) ?? []).length;
  assert.ok(placeholders >= 16,
    `only ${placeholders} <cli> placeholder(s) — the registry has lost its launchers, and the check `
    + 'above would then pass over a table with nothing to spell');
});

test('ARC-07-C32 — no generated page carries a placeholder verbatim', () => {
  // THE LEAK CHECK. Every committed surface that renders a remedy or a command must substitute; one
  // that forgets ships `<cli>` to a reader. Found by hand while building this row — the rules page's
  // WILDCARD line, `protocols.mjs` and `troubleshooting.mjs` each rendered the raw value, and the first
  // two generators I fixed looked like the whole job.
  const generated = ['.claude/rules/00-mode-and-mcp-gate.md', 'docs/TROUBLESHOOTING.md',
    'governance/mcp-protocols.md', 'docs/MODES-AND-PRESETS.md', 'README.md', '.claude/settings.json'];
  const leaks = [];
  for (const rel of generated) {
    read(rel).split('\n').forEach((line, i) => {
      if (/<cli>|<bootstrap>/.test(line)) leaks.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(leaks, [],
    `a generated page shows a placeholder to its reader:\n  ${leaks.join('\n  ')}`);
});

test('ARC-07-C32 — every reader substitutes, and a reader that does not is the defect', () => {
  // BOTH READERS, driven. The engine's is `packages/contract/lib/contract.mjs`; the server's is
  // `errors/codes.ts`. They are two implementations on purpose — the server must never import the
  // engine — so each is asserted rather than one being taken as evidence for the other.
  const contractJson = JSON.parse(read('packages/snowarch/dist/contract.json'));
  const withPlaceholder = contractJson.errorCodes.find((e) => /<cli>/.test(e.command ?? ''));
  assert.ok(withPlaceholder, 'no entry has a command with a placeholder to test with');

  // THE TWO READERS TAKE DIFFERENT SHAPES, and the difference is forced rather than sloppy: the engine's
  // takes a spellings OBJECT, the server's takes the two STRINGS, because `errors/codes.ts` may have no
  // static imports at all — `probe-auth` loads it before B04 has installed anything. So its caller
  // resolves the shell and hands the answers in. A case that passed a platform to the server's reader
  // would silently get no substitution, which is how this case first failed.
  return Promise.all([
    import('../../packages/contract/lib/contract.mjs'),
    import('../../packages/snowarch/dist/errors/codes.js'),
    import('../../tools/snowarch/lib/text.mjs'),
  ]).then(([contractLib, serverCodes, text]) => {
    const spell = text.spellings({ platform: 'win32', env: {} });
    const asStrings = { cli: spell.cli, bootstrap: spell.bootstrap };

    const engineSide = contractLib.remedyFor(contractJson, withPlaceholder.code, spell);
    assert.doesNotMatch(engineSide.command, /<cli>/, 'the ENGINE reader left the placeholder in');
    assert.match(engineSide.command, /\.\\snowarch\.cmd/, 'the engine reader did not fill it');

    const serverSide = serverCodes.remedyFor(withPlaceholder.code, asStrings);
    assert.doesNotMatch(serverSide.command, /<cli>/, 'the SERVER reader left the placeholder in');
    assert.match(serverSide.command, /\.\\snowarch\.cmd/, 'the server reader did not fill it');

    // ...and the POSIX direction for both, so a reader that hard-coded the Windows spelling fails too.
    const posix = text.spellings({ platform: 'linux', env: {} });
    assert.match(contractLib.remedyFor(contractJson, withPlaceholder.code, posix).command, /\.\/snowarch/);
    const posixStrings = { cli: posix.cli, bootstrap: posix.bootstrap };
    assert.match(serverCodes.remedyFor(withPlaceholder.code, posixStrings).command, /\.\/snowarch/);

    // ...and the server's reader with NO spelling returns the placeholder UNFILLED rather than guessing a
    // shell it cannot know. That is deliberate — the registry has no way to resolve one — and the
    // placeholder check in this file is what turns an unfilled read into a failure.
    assert.match(serverCodes.remedyFor(withPlaceholder.code).command, /<cli>/);

    // The engine's reader REFUSES without a spelling, rather than returning the raw placeholder. That
    // is the one failure mode W17 actually shipped, so it is the one held by an assertion.
    assert.throws(() => contractLib.remedyFor(contractJson, withPlaceholder.code),
      { name: 'TypeError', message: /fillLauncher needs a spellings object/ });
  });
});

test('ARC-07-C32 — codes.ts needs no launcher exemption any more', () => {
  // The guard's `DATA_EXEMPT` existed for this one file: it held POSIX literals because the page it
  // generates is committed. The placeholder removes the reason, so the exemption goes — and this case
  // is what stops it being re-added out of habit. `git ls-files` rather than a glob, because an
  // untracked file is invisible to the guard and would be invisible here too.
  const guard = read('tests/windows-spellings.test.mjs');
  assert.doesNotMatch(guard, /DATA_EXEMPT/,
    'the launcher guard still carries a data exemption; ARC-07-C32 removed its last reason');
  const tracked = execFileSync('git', ['ls-files', 'packages/snowarch/src/errors/codes.ts'],
    { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(tracked, 'packages/snowarch/src/errors/codes.ts', 'codes.ts is no longer tracked');
});
