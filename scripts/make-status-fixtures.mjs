#!/usr/bin/env node
/**
 * ARC-08-C20 — capture `tests/fixtures/doctor/status-{design,live}.json` from a real run.
 *
 * WHY A SCRIPT AND NOT A HAND-EDIT. The two fixtures were committed once, by hand, from runs their
 * author did on a checkout nobody else has. `status-template.test.mjs` says of them: *"written by
 * `--quick --json` on fixture checkouts, never by hand"* — and that sentence was the only thing
 * standing behind them. By 2026-09-19 it had quietly stopped being true of the product rather than
 * of the file: `status-live.json` carries a `server` block from a `--quick` run, and ARC-09-C8 took
 * the server section out of the quick subset, so **no quick run this product makes can produce
 * that report**. A fixture the product cannot produce is a guarantee about a product that no
 * longer exists, and every test reading it is measuring a fortnight ago.
 *
 * So the capture is a command now. Re-runnable by anyone, on any machine, from a checkout built
 * here rather than from whatever the author happened to have — and `tests/doctor/status-fixture-
 * capture.test.mjs` re-runs it and fails if what it produces has drifted from what is committed.
 *
 * WHAT IS IN THE FIXTURE STORE, and what is deliberately not: one instance, `pdi`, environment
 * `pdi`, preset `custom`, flags explicit. No host that resolves, no account name, no credential —
 * a fixture is committed and read by strangers, and the panel reads a label, an environment and a
 * preset, so nothing else needs to be there to exercise it.
 *
 * WHAT IS OVERWRITTEN AFTER THE RUN, and nothing else: `ranAt` and every `durationMs`. They are
 * the clock, they differ between two correct runs, and a fixture that changed on every capture
 * could not be compared to anything. Every other value is exactly what the doctor produced,
 * including the version, the contract sha and the docs pin — those move with a release, and when
 * they move the fixture and the sample block in the three documents are meant to move with them.
 *
 * Usage:
 *   node scripts/make-status-fixtures.mjs            write both fixtures
 *   node scripts/make-status-fixtures.mjs --check    capture and diff, write nothing (exit 1 on drift)
 *   node scripts/make-status-fixtures.mjs --json     print the reports instead of writing
 *
 * Exit 0 written / identical · 1 drifted · 2 cannot run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { statusCommand } from '../tools/snowarch/lib/commands/status.mjs';
import { greenTree, linkInstall } from '../tests/doctor/helpers/tree.mjs';
import { remove } from '../tools/snowarch/tests/helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests', 'fixtures', 'doctor');
const argv = process.argv.slice(2);
/**
 * `writeSync`, not `process.stderr.write` — ARC-09-C6, enforced by `tests/sync-write.test.mjs`.
 *
 * A write to a pipe is asynchronous, and a process that exits with one queued loses it: a `--json`
 * object reaches its caller cut in half, and a diagnostic that does not arrive is not a diagnostic.
 * This script exits on every path, so every write in it is synchronous. The guard caught it on the
 * first full run of the suite, which is the third time this repository has paid for that lesson.
 */
const say = (m) => writeSync(1, m);
const die = (m) => { writeSync(2, `make-status-fixtures: ${m}\n`); process.exit(2); };

/**
 * The clock, pinned. Chosen once and never moved: a capture that changed this would rewrite the
 * `quick run <at> UTC` line in the snippet, the skill and VALIDATION-TESTS every time somebody ran
 * the script, which is three documents churning to say nothing.
 */
export const FIXED_RAN_AT = '2026-09-20T09:00:00.000Z';

/** One instance, and nothing in it that a stranger reading the committed file should not see. */
export const FIXTURE_STORE = Object.freeze({
  version: 1,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      // `example.test` is reserved by RFC 6761 and resolves nowhere — the fixture cannot become a
      // request even if something one day decided to probe it.
      url: 'https://instance.example.test',
      environment: 'pdi',
      preset: 'custom',
      auth: { method: 'basic', username: 'fixture', password: 'fixture' },
      flags: {
        WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
        ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'true', FLUENT_ENABLED: 'false',
      },
      toolPackage: 'full',
      maxRecords: 100,
      prodWriteAck: false,
    },
  },
});

/**
 * A checkout, built by the TESTS' OWN helpers — `greenTree` and `linkInstall`, imported rather
 * than reimplemented.
 *
 * The first version of this script typed its own file list from memory and produced a report with
 * `4 fail`: `CLAUDE.md`, `.mcp.json` and `.claude/settings.json` were missing and the state file
 * had no schema version. A fixture captured from a broken checkout would have baked four failing
 * checks into the sample block the skill quotes — a second copy of a list, making exactly the
 * mistake a second copy always makes. `tests/doctor/helpers/tree.mjs` is where that list lives and
 * where it is maintained; a script reaching into `tests/` is a smaller cost than a list that
 * drifts.
 *
 * `greenTree(undefined, …)` — the test context is optional there, and without one the temp
 * directory is still tracked by the exit sweep in `tests/helpers/temp.mjs`.
 */
function checkout(mode) {
  const root = greenTree(undefined, { mode: mode === 'live' ? 'live' : 'design' });
  linkInstall(root);

  // The live capture differs from the design one in exactly one thing: there is an instance in the
  // store. That is what "live" means to a quick run — ARC-08-C17's ruling, and ARC-08-C19's key.
  if (mode === 'live') {
    writeFileSync(join(root, '.local', 'instances.json'),
      `${JSON.stringify(FIXTURE_STORE, null, 2)}\n`, { mode: 0o600 });
  }
  return root;
}

/**
 * The clock and the capturing PROCESS — the two things that differ between two correct captures.
 *
 * Found by the drift test on its first run, which is what it is for: a second capture differed in
 * `prereqs.shell` (`zsh` from a terminal, `unknown` under `node --test`, because `guessShell` walks
 * the PARENT process with `ps` — a fact about who typed the command, not about the product) and in
 * `E-05`'s detail, which carries the temp checkout's own path.
 *
 * The path is not normalised here: the capture passes the fixture root as `home`, so the SHIPPED
 * masker rewrites it to `~` at the same boundary that masks a real user's. One masker, and the
 * committed fixture carries no machine path for the same reason a pasted report does not.
 */
function pinMachine(report) {
  return {
    ...report,
    ranAt: FIXED_RAN_AT,
    durationMs: 0,
    prereqs: report.prereqs ? { ...report.prereqs, shell: 'unknown' } : report.prereqs,
    checks: report.checks.map((c) => (c.durationMs === undefined ? c : { ...c, durationMs: 0 })),
  };
}

export async function capture(mode) {
  const root = checkout(mode);
  try {
    const chunks = [];
    const code = await statusCommand({
      out: { write: (t) => chunks.push(t) },
      cwd: root,
      flags: { json: true },
      // The fixture root as `home`: `maskForJson` masks the home prefix BY VALUE, so every path in
      // the report that points into this capture's checkout leaves as `~/…`. A committed fixture
      // must carry no machine path, and this is the product's own masker doing it rather than a
      // second one written here.
      home: root,
      env: {},
    });
    const text = chunks.join('');
    if (!text.trimStart().startsWith('{')) die(`${mode}: status did not print a report (exit ${code})\n${text}`);
    return pinMachine(JSON.parse(text));
  } finally {
    // `remove()` and the `.owner` beside it — the two steps `trackTempDir` takes, because
    // `greenTree` writes an ownership record NEXT TO the directory and a bare `rmSync(root)` leaves
    // it behind. `tests/fixture-cleanup.test.mjs` counts what a suite leaves in TMPDIR and caught
    // exactly that: the directories went, the `.owner` files accumulated.
    if (!remove(root)) remove(`${root}.owner`);
  }
}

const serialise = (report) => `${JSON.stringify(report, null, 2)}\n`;

/**
 * Run only when this file IS the command.
 *
 * Without this the module captured both fixtures and called `process.exit()` the moment anything
 * imported it — so `status-fixture-capture.test.mjs`, which imports `capture()`, ran one test and
 * then vanished with a clean exit. Four assertions disappeared and the run said `pass 1`. A file
 * that both exports and executes is a file that cannot be tested, and the test that would have
 * caught the drift was the first casualty.
 */
const INVOKED_DIRECTLY = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (!INVOKED_DIRECTLY) {
  // An importer wants `capture`, `FIXED_RAN_AT` and `FIXTURE_STORE`; it does not want a capture.
} else {
  await main();
}

async function main() {
const reports = { design: await capture('design'), live: await capture('live') };

if (argv.includes('--json')) {
  say(serialise(reports));
  process.exit(0);
}

let drifted = 0;
for (const [mode, report] of Object.entries(reports)) {
  const path = join(OUT, `status-${mode}.json`);
  const next = serialise(report);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === next) {
    say(`make-status-fixtures: status-${mode}.json is current\n`);
    continue;
  }
  if (argv.includes('--check')) {
    drifted += 1;
    say(`make-status-fixtures: status-${mode}.json has DRIFTED — `
      + 'run `node scripts/make-status-fixtures.mjs` and commit the result\n');
    continue;
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path, next);
  say(`make-status-fixtures: wrote status-${mode}.json\n`);
}
process.exit(drifted > 0 ? 1 : 0);
}
