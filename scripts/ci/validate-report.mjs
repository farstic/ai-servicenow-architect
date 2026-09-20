#!/usr/bin/env node
/**
 * ARC-08-C25 — hold a doctor report a CI job produced to the SAME schema the product promises.
 *
 * The `doctor-<label>` artifact carries three files with three different shapes — the full
 * `--json` report, the PowerShell run's copy of it, and `doctor-snapshot`'s deliberately stripped
 * normalisation — and nothing checked any of them. A reviewer pulling one to answer a question
 * about the quick run's `durationMs` got the stripped file, concluded the artifact was a legacy
 * shape, and could not answer the question. The bundle was right and unlabelled; the report that
 * would have answered it, `doctor-quick.json`, was written by the job and never uploaded at all.
 *
 * So: the reports that CLAIM to be schema-v1 are validated here with `validateReport` — the SAME
 * function the product's own tests hold `--json` to, imported rather than reimplemented, because a
 * second copy of a schema is how the artifact and the product drift apart in the first place. The
 * normalised snapshot is exempt BY NAME: it is not a report and does not pretend to be.
 *
 * Usage: node scripts/ci/validate-report.mjs <file> [<file> …]
 * Exit 0 valid (or the file is absent, which some cells legitimately are) · 1 invalid.
 */
import { existsSync, readFileSync, writeSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReport } from '../../tools/snowarch/lib/doctor/report-json.mjs';

/**
 * Files in the artifact that are NOT schema-v1 reports, listed by name with the reason.
 *
 * An allow-list rather than a pattern: the next file added to the bundle should have to say which
 * of the two it is, and a pattern would quietly absorb it.
 */
export const NOT_A_REPORT = new Map([
  ['doctor-normalised.json', 'doctor-snapshot.mjs strips the clock, the machine and the counts '
    + 'on purpose — it is a comparison key, not a report'],
]);

/** The keys a report must carry for the questions the artifact exists to answer. */
export const MUST_ANSWER = Object.freeze(['ranAt', 'durationMs', 'summary', 'checks']);

export function problemsFor(file, text) {
  const name = basename(file);
  if (NOT_A_REPORT.has(name)) return [];
  let report;
  try {
    report = JSON.parse(text);
  } catch (e) {
    return [`${name}: not JSON — ${e.message}`];
  }
  const problems = validateReport(report).map((p) => `${name}: ${p}`);
  // Present AND not null: `durationMs` is the number ARC-08-C19's budget question needed, and a
  // report that carried the key with nothing in it would have answered the same way as one that
  // did not carry it at all.
  for (const key of MUST_ANSWER) {
    if (report[key] === undefined || report[key] === null) {
      problems.push(`${name}: ${key} is ${report[key] === undefined ? 'missing' : 'null'} — `
        + 'the artifact cannot answer what it is collected for');
    }
  }
  return problems;
}

/**
 * Run only when this file IS the command.
 *
 * THE THIRD TIME I have written a `scripts/` file that exports helpers and also executes on
 * import: ARC-08-C20's fixture capture exited the test that imported it (`pass 1`, four assertions
 * gone), ARC-08-C22's help generator did the same a day later, and this one did it again. The
 * guard is not the lesson — remembering it is not a strategy I have evidence for. So
 * `tests/scripts-are-importable.test.mjs` now imports every exporting script in a child process
 * and fails if any of them runs or exits.
 */
const INVOKED_DIRECTLY = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (INVOKED_DIRECTLY) main();

function main() {
const files = process.argv.slice(2);
if (files.length === 0) {
  writeSync(2, 'validate-report: no files given\n');
  process.exit(1);
}

let bad = 0;
for (const file of files) {
  // A cell that did not produce this file is not a failure: the quick report is written only by
  // the cells that measure timings, and `if-no-files-found: ignore` is how the upload says so.
  if (!existsSync(file)) {
    writeSync(1, `validate-report: ${basename(file)} absent — skipped\n`);
    continue;
  }
  const problems = problemsFor(file, readFileSync(file, 'utf8'));
  if (problems.length === 0) {
    writeSync(1, `validate-report: ${basename(file)} is a valid schema-v1 report\n`);
    continue;
  }
  bad += 1;
  for (const p of problems) writeSync(2, `validate-report: ${p}\n`);
}
process.exit(bad > 0 ? 1 : 0);
}
