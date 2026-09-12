/**
 * ARC-09-S10 — the guard on what may be published, and what the tarball contains.
 *
 * `@farstic/snow-mcp@1.0.0` is on npm and is never touched again (D-01). A republish under that
 * name cannot be taken back: people have it pinned, and the registry keeps what it is given. So
 * the workflow that can publish does not trust whoever dispatched it to have pointed it at the
 * right package — the target is CHECKED, before `npm ci` and long before the token is used, and
 * the check is a script with tests rather than a line of YAML nobody can exercise.
 *
 * What is tested here is the MESSAGE as much as the exit code. A refusal that says "assertion
 * failed" tells a maintainer at 2am nothing about which promise the package stopped keeping.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FORBIDDEN, PUBLISHABLE, problems } from '../scripts/ci/assert-publish-target.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'packages/snowarch/package.json'), 'utf8'));

/** The committed manifest, with one property broken — so each case names one cause. */
const broken = (patch) => ({ ...manifest, ...patch });

test('the committed package is the publishable target at its own version (ARC-09-S10)', () => {
  // The baseline every case below is a deviation FROM. Without it a test that "sees a refusal"
  // could be seeing the refusal for a different reason than the one it planted.
  assert.deepEqual(problems(manifest, `v${manifest.version}`), []);
  assert.equal(manifest.name, PUBLISHABLE);
});

test('the forbidden name is refused, and the refusal names D-01 (ARC-09-S10)', () => {
  const found = problems(broken({ name: FORBIDDEN }), `v${manifest.version}`);
  assert.deepEqual(found, [
    `refusing — package name is "${FORBIDDEN}" (D-01: the old record is never touched)`,
  ]);
  // The one that matters most gets asserted twice, deliberately: the whole workflow exists behind
  // this string, and a refactor that turned the message generic would still pass a `length === 1`.
  assert.match(found[0], /D-01: the old record is never touched/);
});

test('any other name is refused too, by name (ARC-09-S10)', () => {
  // Not only the one forbidden name — a TYPO must not publish either. `@farstic/snowarc` is the
  // kind of thing that gets typed once and squats a name on the registry for ever.
  assert.deepEqual(problems(broken({ name: '@farstic/snowarc' }), `v${manifest.version}`),
    ['refusing — package name is "@farstic/snowarc", expected "@farstic/snowarch"']);
});

test('a version that is not the tag is refused (ARC-09-S10)', () => {
  // The publish takes its version from the manifest, not from the tag: a mismatch publishes a
  // version nobody asked for, under a provenance attestation saying it came from that tag.
  assert.deepEqual(problems(manifest, 'v9.9.9'),
    [`refusing — version is "${manifest.version}" but the tag says "9.9.9"`]);
  // The `v` is optional — the comparison is the point, not the spelling.
  assert.deepEqual(problems(manifest, manifest.version), []);
  assert.deepEqual(problems(manifest, ''),
    ['refusing — no tag was given, so the version cannot be checked against one']);
});

test('each remaining promise is refused by its own message (ARC-09-S10)', () => {
  const cases = [
    [{ bin: { snowarch: 'src/cli.ts' } }, /bin\.snowarch is "src\/cli\.ts"/],
    [{ files: ['.env.example'] }, /files does not include "dist\/"/],
    [{ engines: { node: '>=18.0.0' } }, /engines\.node is ">=18\.0\.0"/],
    [{ license: 'MIT' }, /license is "MIT"/],
    [{ repository: 'github:someone-else/other' }, /repository is "github:someone-else\/other"/],
    [{ repository: undefined }, /repository is "\(missing\)"/],
    [{ publishConfig: { access: 'restricted', provenance: true } }, /publishConfig\.access is "restricted"/],
    [{ publishConfig: { access: 'public' } }, /provenance is not true, so the tarball would be unattested/],
  ];
  for (const [patch, expected] of cases) {
    const found = problems(broken(patch), `v${manifest.version}`);
    assert.equal(found.length, 1, `${JSON.stringify(patch)} → ${JSON.stringify(found)}`);
    assert.match(found[0], expected);
  }
});

test('both repository spellings npm accepts are accepted here (ARC-09-S10)', () => {
  // The provenance attestation is checked against the repository the workflow ran in, so what
  // matters is what the field RESOLVES to. npm takes the object and the `github:` shorthand alike,
  // and this repository used the shorthand until this story.
  for (const repository of [
    'github:farstic/ai-servicenow-architect',
    { type: 'git', url: 'git+https://github.com/farstic/ai-servicenow-architect.git' },
    { type: 'git', url: 'https://github.com/farstic/ai-servicenow-architect' },
  ]) {
    assert.deepEqual(problems(broken({ repository }), `v${manifest.version}`), [], String(JSON.stringify(repository)));
  }
});

test('the script refuses from the command line, on stderr, with exit 1 (ARC-09-S10)', () => {
  // The functions above are the logic; this is the thing CI actually runs. `v9.9.9` cannot match
  // the committed version, so the refusal is real rather than planted — and it proves the script
  // reads the manifest from disk, prints to STDERR, and exits non-zero. `spawnSync`, because
  // `execFileSync` THROWS on a non-zero exit and the first version of this test asserted nothing
  // as a result: the throw skipped the assertion and the failure looked like the test's own.
  const r = spawnSync(process.execPath,
    [join(root, 'scripts/ci/assert-publish-target.mjs'), 'v9.9.9'], { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 1, `exit ${r.status}; stdout ${r.stdout}; stderr ${r.stderr}`);
  assert.match(r.stderr, /^publish: refusing — version is /m);
  assert.equal(r.stdout, '', 'a refusal reached stdout');
});

test('the happy path prints one line to stdout and exits 0 (ARC-09-S10)', () => {
  const r = spawnSync(process.execPath,
    [join(root, 'scripts/ci/assert-publish-target.mjs'), `v${manifest.version}`],
    { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`^publish: ${PUBLISHABLE.replace('/', '\\/')}@`));
});

test('the published tarball carries dist/ and no sources or tests (ARC-09-S10)', () => {
  // `npm pack --dry-run` is npm's own answer to "what would be published", computed from `files`
  // plus the things npm always includes. Asking npm beats re-deriving the rules from `files`,
  // which is how a test ends up agreeing with a bug.
  const r = spawnSync('npm', ['pack', '--dry-run', '--workspace', 'packages/snowarch', '--json'],
    { encoding: 'utf8', cwd: root, maxBuffer: 1 << 26, shell: process.platform === 'win32' });
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);

  for (const want of ['dist/server.js', 'dist/cli/index.js', 'dist/contract.json', 'package.json',
    'README.md', 'LICENSE', 'NOTICE']) {
    assert.ok(files.includes(want), `${want} is missing from the tarball`);
  }

  // ARC-09-C17, owner decision 2026-09-11: NOTICE SHIPS. This repository is Apache-2.0 and has a
  // root NOTICE, and §4(d) asks a redistribution to carry its attribution text — npm includes a
  // LICENSE automatically and a NOTICE not at all, so the package needs its own copy. A copy is a
  // thing that drifts, so the test compares it with the root file rather than trusting the two to
  // stay equal: caught here, not shipped quietly.
  assert.equal(readFileSync(join(root, 'packages/snowarch/NOTICE'), 'utf8'),
    readFileSync(join(root, 'NOTICE'), 'utf8'),
    'packages/snowarch/NOTICE has drifted from the root NOTICE');
  // ARC-01-S08 AC 2 (acceptance item B01-01). The SAME argument one file over, and it had no test:
  // the package's LICENSE is a copy too, and a copy is a thing that drifts. `cmp` is the criterion's
  // own command; this is it, in the place that already checks the NOTICE beside it.
  assert.equal(readFileSync(join(root, 'packages/snowarch/LICENSE'), 'utf8'),
    readFileSync(join(root, 'LICENSE'), 'utf8'),
    'packages/snowarch/LICENSE has drifted from the root LICENSE');
  // `bin` points into the tarball, so this is the difference between `npx @farstic/snowarch`
  // working and a 404 from the user's shell.
  assert.ok(files.includes(manifest.bin.snowarch), 'bin points at a file the tarball does not carry');

  const forbidden = files.filter((f) => f.startsWith('src/') || /(^|\/)tests?\//.test(f)
    || f.endsWith('.test.ts') || f.startsWith('.local') || f.endsWith('.env'));
  assert.deepEqual(forbidden, [], 'sources, tests or local state would be published');
  // A `.map` beside every `.js` is fine; a `.ts` SOURCE is not — the package ships the build.
  assert.deepEqual(files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')), []);
});
