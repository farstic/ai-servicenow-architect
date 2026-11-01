// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C259 — release.yml's own metrics lines, run as written, at the new unit, on this machine.
 *
 * `release.yml` runs on a pushed `v*` tag and nothing else (no dispatch, no dry run), and a tag makes a public Release, so the chain
 * that turns the three machines' install measurements into the table in the release body has never run before a release runs it. The
 * unit change moves every figure in it (the tree that read 279 reads 293), and a table that is wrong, or a body over the API's cap, is
 * found on the one run that cannot be taken back. So the four commands are READ OUT OF release.yml, not retyped, and run in a shell
 * against a small fixture per machine, with no tag, no `gh` and no network:
 *
 *   1. `install-metrics.mjs <os> --root "$RUNNER_TEMP/dist"`          what the install cost, per machine (the verify job)
 *   2. `install-metrics.mjs --table install-metrics-*.json`           the table, from all three (the publish job)
 *   3. `release-notes.mjs <tag> --metrics install-metrics.md`         the body, bounded
 *   4. `assert-assets.mjs doctor-*.json install-metrics-*.json`       nothing published carries a credential
 *
 * What it proves: the commands as written produce the table at the new unit, splice it into a body inside the API's cap, and pass
 * the asset check, which can fail. What it does not prove: the runner, the artifact transfer between the jobs, `gh release create`.
 * The tag is only a string, and the section is the changelog's newest dated one (`sectionFor` wants "## <version> — ").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { RELEASE_BODY_MAX } from '../scripts/ci/release-notes.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POSIX_REPO = REPO.replace(/\\/g, '/');
const WORKFLOW = readFileSync(join(REPO, '.github', 'workflows', 'release.yml'), 'utf8');
const CHANGELOG = readFileSync(join(REPO, 'docs', 'CHANGELOG.md'), 'utf8');
const OSES = ['ubuntu-latest', 'macos-latest', 'windows-latest'];
/** Files of 100,000 bytes in each machine's corpus: 1.5, 2.5 and 3.5 MB, which are 2, 3 and 4 in megabytes of 10^6 bytes (1, 2 and 3 in 2^20). */
const DOCS_FILES = { 'ubuntu-latest': 15, 'macos-latest': 25, 'windows-latest': 35 };

/** The newest dated section of the changelog, as a tag: a string for the commands, never pushed. */
const TAG = `v${/^## (\d+\.\d+\.\d+\S*) — /m.exec(CHANGELOG)?.[1]}`;

/**
 * The `run:` of the step called `name` in release.yml, as the runner hands it to the shell: a one-line value, or a block scalar with
 * its indentation taken off. Comment lines between a step's keys are skipped; the next `- ` at the step's own indent ends it.
 */
function runOf(name) {
  const lines = WORKFLOW.split('\n');
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  assert.ok(at >= 0, `release.yml has no step named "${name}"`);
  const dash = lines[at].indexOf('- name:');
  for (let i = at + 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t !== '' && !t.startsWith('#') && lines[i].search(/\S/) <= dash) break;
    const m = /^(\s*)run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (m[2] && !/^[|>][+-]?$/.test(m[2])) return m[2].trim();
    const block = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim() !== '' && lines[j].search(/\S/) <= m[1].length) break;
      block.push(lines[j]);
    }
    const strip = Math.min(...block.filter((l) => l.trim() !== '').map((l) => l.search(/\S/)));
    return block.map((l) => l.slice(strip)).join('\n').trim();
  }
  return assert.fail(`the step "${name}" has no run:`);
}

/** A step's command with the two expressions it uses filled in and its scripts given as absolute paths: nothing else is changed. */
function command(name, { os = 'ubuntu-latest', tag = TAG } = {}) {
  const text = runOf(name).replaceAll('${{ matrix.os }}', os).replaceAll('${{ github.ref_name }}', tag);
  assert.doesNotMatch(text, /\$\{\{/, `an expression is left in the step "${name}": ${text}`);
  return text.replaceAll('scripts/ci/', `${POSIX_REPO}/scripts/ci/`);
}

const STEP = {
  metrics: 'What the install cost here',
  table: 'The metrics table, from all three',
  notes: 'The release notes are the changelog\'s own section, bounded',
  assets: 'Nothing in the assets carries a credential',
};

/** Git for Windows' bash, which `shell: bash` is on the runner; a plain `bash` on PATH can be the WSL stub in System32. */
const BASH = (() => {
  if (process.platform !== 'win32') return 'bash';
  const git = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
  return existsSync(git) ? git : 'bash';
})();
const sh = (cwd, script, env = {}) => spawnSync(BASH, ['-c', script], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });

/** Three machines' installs under `temp/<os>/dist`, and the publish job's folder: the changelog, and the three doctor reports it downloaded. */
function fixture(t) {
  const dir = tempDir('c259-rehearsal-', t);
  const write = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  for (const [os, files] of Object.entries(DOCS_FILES)) {
    for (let i = 0; i < files; i += 1) write(`temp/${os}/dist/vendor/ServiceNowDocs/markdown/area/page-${i}.md`, 'x'.repeat(100_000));
    write(`temp/${os}/dist/node_modules/pkg/index.js`, 'y'.repeat(1_500_000));
    write(`temp/${os}/dist/.local/bootstrap-state.json`, `${JSON.stringify({ version: 1, steps: {
      B00: { status: 'ok', durationMs: 400 }, B02: { status: 'ok', durationMs: 25_300 }, B09: { status: 'ok', durationMs: 1_200 } } }, null, 2)}\n`);
  }
  mkdirSync(join(dir, 'publish', 'docs'), { recursive: true });
  copyFileSync(join(REPO, 'docs', 'CHANGELOG.md'), join(dir, 'publish', 'docs', 'CHANGELOG.md'));
  // The report a release publishes is the licensed picture (release.yml's evidence doctor runs with a fixture licence, so E-31 reads ok);
  // the design fixture is the unlicensed install, whose E-31 FAILs, so it is put right, as tests/release-workflow.test.mjs does.
  const report = JSON.parse(readFileSync(join(REPO, 'tests', 'fixtures', 'doctor', 'status-design.json'), 'utf8'));
  report.checks = report.checks.map((c) => (c.id === 'E-31' ? { ...c, status: 'ok' } : c));
  for (const os of OSES) write(`publish/doctor-${os}.json`, `${JSON.stringify(report, null, 2)}\n`);
  return { dir, publish: join(dir, 'publish') };
}

/** The release's chain in the order the workflow runs it. `metricsScript` swaps the one script that counts megabytes, for the control. */
function chain(f, { metricsScript = null } = {}) {
  const swap = (cmd) => (metricsScript ? cmd.replace(`${POSIX_REPO}/scripts/ci/install-metrics.mjs`, metricsScript) : cmd);
  const out = { perMachine: OSES.map((os) => sh(f.publish, swap(command(STEP.metrics, { os })), { RUNNER_TEMP: join(f.dir, 'temp', os) })) };
  out.table = sh(f.publish, swap(command(STEP.table)));
  out.notes = sh(f.publish, command(STEP.notes));
  out.assets = sh(f.publish, command(STEP.assets));
  return out;
}

const said = (r) => `${r.stdout}${r.stderr}`;

test('ARC-09-C259 — release.yml\'s own metrics lines, run on a fixture per machine, give the table at the new unit, a body inside the cap, and clean assets', (t) => {
  const f = fixture(t);
  const r = chain(f);
  r.perMachine.forEach((m, i) => assert.equal(m.status, 0, `${OSES[i]}: ${said(m)}`));
  assert.equal(r.table.status, 0, said(r.table));
  assert.equal(r.notes.status, 0, said(r.notes));
  assert.equal(r.assets.status, 0, said(r.assets));

  const table = readFileSync(join(f.publish, 'install-metrics.md'), 'utf8');
  assert.match(table, /^\| OS \| docs working tree \| docs files \| B02 time \| node_modules \| bootstrap total \|$/m);
  // 15, 25 and 35 files of 100,000 bytes, and 1,500,000 bytes of node_modules on each: 2, 3 and 4 MB, and 2 MB (2^20-byte megabytes: 1, 2, 3 and 1).
  assert.match(table, /^\| ubuntu-latest \| 2 MB \| 15 \| 25\.3 s \| 2 MB \| 26\.9 s \|$/m);
  assert.match(table, /^\| macos-latest \| 3 MB \| 25 \| 25\.3 s \| 2 MB \| 26\.9 s \|$/m);
  assert.match(table, /^\| windows-latest \| 4 MB \| 35 \| 25\.3 s \| 2 MB \| 26\.9 s \|$/m);
  assert.match(table, /megabytes are 10\^6 bytes/);

  const body = readFileSync(join(f.publish, 'release-notes.md'), 'utf8');
  assert.ok(body.includes(table.trimEnd()), 'the release body does not carry the table the metrics step wrote');
  assert.ok(body.length <= RELEASE_BODY_MAX, `the body is ${body.length} characters, over the API's ${RELEASE_BODY_MAX}`);
  assert.match(r.assets.stdout, /6 asset\(s\) clean/);
});

test('ARC-09-C259 — the rehearsal can fail: an e-mail in one metrics file stops the asset check, and the chain on 2^20-byte megabytes reads 1 MB where 2 is expected', (t) => {
  // The asset check first: the same chain, with one address planted in a metrics file after the step that wrote it.
  const f = fixture(t);
  assert.equal(chain(f).assets.status, 0, 'the unplanted chain is not clean, so the planted one proves nothing');
  const file = join(f.publish, 'install-metrics-ubuntu-latest.json');
  const metrics = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, `${JSON.stringify({ ...metrics, contact: ['someone', '@', 'corp.example.com'].join('') }, null, 2)}\n`);
  const planted = sh(f.publish, command(STEP.assets));
  assert.equal(planted.status, 1, `an address in a published asset did not stop the check: ${said(planted)}`);
  assert.match(planted.stderr, /an unmasked e-mail address/);

  // The unit second: the same script with its megabyte turned back into 2^20 bytes, which is what develop counts, gives the table that the
  // assertions above would have to refuse. Without it a rehearsal that read the right words from the wrong code would be as green.
  const source = readFileSync(join(REPO, 'scripts', 'ci', 'install-metrics.mjs'), 'utf8');
  const mutated = source.replace(/^import \{ megabytes \} from '[^']*size\.mjs';$/m, 'const megabytes = (bytes) => Math.round(bytes / (1024 * 1024));');
  assert.notEqual(mutated, source, 'the mutation did not apply: install-metrics.mjs does not take its megabyte from size.mjs where this control looks for it');
  const mutant = join(tempDir('c259-mutant-', t), 'install-metrics.mjs');
  writeFileSync(mutant, mutated);
  const g = fixture(t);
  const r = chain(g, { metricsScript: mutant.replace(/\\/g, '/') });
  assert.equal(r.table.status, 0, said(r.table));
  const table = readFileSync(join(g.publish, 'install-metrics.md'), 'utf8');
  assert.match(table, /^\| ubuntu-latest \| 1 MB \| 15 \|/m, 'the chain on 2^20-byte megabytes does not read 1 MB: the assertions above cannot tell the units apart');
  assert.match(table, /^\| windows-latest \| 3 MB \| 35 \|/m);
});
