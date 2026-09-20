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
import { execFileSync } from 'node:child_process';
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
 * EVERY FACT ABOUT THE CAPTURING MACHINE, pinned to a sample value — by name, in one table.
 *
 * The fixture is a SAMPLE, not a measurement of whoever ran the capture. The first version pinned
 * the clock and the shell and nothing else, and the drift test then held only on the machine that
 * made the file: CI's macOS node-20 and node-22 cells failed with `2.55.0` vs `2.39.5` (git),
 * `22.23.2` vs `24.16.0` (node, in three places) and a capability pack the runner lacked, while the
 * node-24 cells passed — for the same reason.
 *
 * The rule the list encodes: **if the value would differ between two correct captures on two
 * correct machines, it is the machine's and it is pinned.** The product's own facts — version,
 * contract sha, docs pin, the floors, which checks ran and what they concluded — are captured
 * verbatim, because those are what the fixture is for and they are meant to move with a release.
 *
 * ADD TO THIS LIST, not to the diff. The next ambient field belongs here the day it appears; a
 * capture that starts differing between machines is this table being out of date, not the test
 * being wrong. `assertNoHostValues` below is what makes that discoverable on the machine that
 * would otherwise commit it.
 */
export const HOST_FACTS = Object.freeze({
  /** `prereqs.os`. One platform's name has to be in a sample; this is the one the docs show. */
  os: 'darwin',
  /** `prereqs.shell`. `guessShell` walks the PARENT process — `zsh` from a terminal, `unknown`
   *  under `node --test`. A fact about who typed the command. */
  shell: 'unknown',
  /** `engine.node`, `prereqs.node.version`, E-02's detail and data. */
  node: '24.0.0',
  /** E-01's detail: the git on PATH. */
  git: '2.40.0',
  /** `prereqs.node.ok`, `prereqs.deps.ok` — a runner missing a dependency must not bake a `false`
   *  into a sample that the docs present as a healthy install. */
  ok: true,
  /** The clock: `ranAt`, and every `durationMs` in the report and its checks. */
  ranAt: '2026-09-20T09:00:00.000Z',
  /**
   * `.local/`'s file mode — E-11's `data.mode` and the ` · file modes: …` half of its detail.
   * POSIX reports `700`; Windows has no POSIX mode and reports `acl-inherited`. A property of the
   * filesystem, not of the checkout.
   */
  fileMode: '700',
  /**
   * E-05's `detail`, `data.root` and `data.toplevel` — WHERE THE CAPTURE RAN.
   *
   * On POSIX the capture's temp checkout sits outside HOME and the masker leaves `~`. On Windows
   * the temp directory lives UNDER HOME, so the same value arrives as
   * `~/AppData/Local/Temp/snowarch-doctor-lffMzB` — home-relative, with the run's random suffix.
   * I argued this one should stay unpinned because "the value being `~` is the assertion"; that
   * holds only where TMPDIR sits outside HOME, which is two platforms out of three. The masker
   * regression it was guarding is held by `json-boundary`'s C1 and by the two-TMPDIR test's
   * explicit `/private~` and `var/folders` absence assertions, so the pin removes nothing.
   */
  checkoutPath: '~',
  /**
   * `engine.docs.present` / `.head` / `.headMatchesPin` — whether the SUBMODULE IS CHECKED OUT.
   *
   * The `test` job checks out without `vendor/ServiceNowDocs`, the `bootstrap` job with it: two
   * correct jobs on one commit, two byte streams. By the rule, the corpus's presence is the
   * checkout's and not the product's. `docs.pin` and `docs.family` stay verbatim — they come from
   * `engine.config.json` and are the product's own answer, and `head` is pinned TO the pin, which
   * is what a checked-out corpus at the pin reports.
   */
  docsPresent: true,
});

/** Kept as a separate export because three places read the instant and none should retype it. */
export const FIXED_RAN_AT = HOST_FACTS.ranAt;

/** The checks whose RESULT is a fact about the host rather than about the checkout. */
const HOST_CHECKS = Object.freeze({
  'E-01': (c) => ({ ...c, detail: HOST_FACTS.git }),
  // Where the capture ran. Masked to `~` on POSIX already; home-relative with a random suffix on
  // Windows, where the temp directory lives under HOME.
  'E-05': (c) => ({
    ...c,
    detail: HOST_FACTS.checkoutPath,
    ...(c.data ? { data: { ...c.data, root: HOST_FACTS.checkoutPath,
      toplevel: HOST_FACTS.checkoutPath } } : {}),
  }),
  // `.local/`'s file mode, and the half of the detail that quotes it. Rebuilt rather than
  // overwritten — the rest of the sentence is the checkout's state and is what the fixture shows.
  'E-11': (c) => ({
    ...c,
    detail: String(c.detail ?? '').replace(/\s*·\s*file modes: [^·]*/i, ''),
    ...(c.data ? { data: { ...c.data, mode: HOST_FACTS.fileMode } } : {}),
  }),
  'E-02': (c) => {
    const data = c.data ? { ...c.data, version: HOST_FACTS.node } : c.data;
    return { ...c, detail: `${HOST_FACTS.node} (floor ${data?.floor ?? '?'})`, data };
  },
});

function pinMachine(report) {
  const prereqs = report.prereqs ? {
    ...report.prereqs,
    os: HOST_FACTS.os,
    shell: HOST_FACTS.shell,
    ...(report.prereqs.node ? { node: { ...report.prereqs.node, ok: HOST_FACTS.ok, version: HOST_FACTS.node } } : {}),
    ...(report.prereqs.deps ? { deps: { ...report.prereqs.deps, ok: HOST_FACTS.ok } } : {}),
  } : report.prereqs;

  const docs = report.engine?.docs ? {
    ...report.engine.docs,
    present: HOST_FACTS.docsPresent,
    head: report.engine.docs.pin ?? null,
    headMatchesPin: report.engine.docs.pin ? true : null,
  } : report.engine?.docs;

  return {
    ...report,
    ranAt: HOST_FACTS.ranAt,
    durationMs: 0,
    prereqs,
    engine: { ...report.engine, node: HOST_FACTS.node, docs },
    checks: report.checks.map((c) => {
      const pinned = HOST_CHECKS[c.id] ? HOST_CHECKS[c.id](c) : c;
      return pinned.durationMs === undefined ? pinned : { ...pinned, durationMs: 0 };
    }),
  };
}

/**
 * Refuse to write a fixture that still carries THIS machine's values.
 *
 * The list above is a list, and a list goes out of date. This is what makes that discoverable here
 * rather than on somebody else's CI run: the real node version and the real git version are looked
 * for in the serialised report, and finding either means a field was added that nobody pinned.
 *
 * It cannot check `os` the same way — a sample has to name some platform, and on that platform the
 * pinned value and the real one are the same string. `prereqs.os` is pinned explicitly above and is
 * the only place it appears.
 */
function assertNoHostValues(report, mode) {
  const text = JSON.stringify(report);
  const real = {
    node: process.versions.node,
    git: (() => {
      try {
        return /(\d+\.\d+\.\d+)/.exec(
          execFileSync('git', ['--version'], { encoding: 'utf8' }))?.[1] ?? null;
      } catch { return null; }
    })(),
  };
  for (const [what, value] of Object.entries(real)) {
    if (value && value !== HOST_FACTS[what] && text.includes(value)) {
      die(`${mode}: this machine's ${what} version (${value}) survived into the fixture — `
        + 'add the field that carries it to HOST_FACTS in this file');
    }
  }
}

/**
 * `{ pin: false }` returns the report as the doctor produced it, before the table above touches it.
 *
 * ARC-08-C20 — the pinning made an assertion that could not fail. The three-layout test checked the
 * captured text for `/private~` and for surviving `var/folders` paths, and once `toplevel` and
 * `data.root` were pinned those strings were gone from the PINNED bytes whether the masker worked
 * or not: reverting the masker failed one test where it had failed three, and the two assertions
 * naming the bug ran on a value that no longer carried it. A check that cannot fail, presented as
 * the thing holding the line — the defect this programme keeps finding, this time in my own test.
 *
 * So the byte-identity and committed-file comparisons take the PINNED report, which is what is
 * committed; the masker assertions take the RAW one, which is where a leak would actually be.
 */
export async function capture(mode, { pin = true } = {}) {
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
    const report = JSON.parse(text);
    // The raw report legitimately carries this machine's values — that is what it is for — so the
    // host-value guard applies only to what would be written.
    if (!pin) return report;
    const pinned = pinMachine(report);
    assertNoHostValues(pinned, mode);
    return pinned;
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
