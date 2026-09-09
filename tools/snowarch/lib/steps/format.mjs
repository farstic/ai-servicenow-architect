// ARC-06-S03 — the step line, in one place, because three programs print it.
//
// The Node CLI prints it; `bootstrap.sh` (S10) and `bootstrap.ps1` (S11) print the same lines with
// no Node at all. Three implementations of one format is three chances for a user to see two
// different vocabularies for the same event depending on whether Node happened to be installed —
// so the wording lives in ONE table here, and S10/S11 render from this file's constants rather
// than from a bash string somebody retyped.
export const WORDING = Object.freeze({
  ok: 'ok',
  cached: 'ok (cached)',
  warn: 'warn',
  fail: 'FAIL',
  skipped: 'skipped',
  running: '…',
});

/**
 * `(48 s)` — and `(0.4 s)` for anything under a second.
 *
 * The convention's example is whole seconds, which reads as `(0 s)` for the many steps that finish
 * in a few hundred milliseconds. That is not a duration, it is a shrug. Sub-second gets one decimal
 * so the line still says something true.
 */
export function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms < 950 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

/**
 * `[B02/09] docs … ok (48 s)`
 *
 * The denominator is derived from the last step's id, never typed: a tenth step would otherwise
 * leave nine printed on every line of a ten-step run.
 */
export function stepLine({ id, title, status, detail = null, note = null, durationMs = null, last }) {
  // `[B02/09]` — the id keeps its letter, the denominator does not. That asymmetry is the
  // conventions block's, not a slip: the left half is a name you can grep for in the state file and
  // in `--from B06`, the right half is a count.
  const total = String(last).replace(/^B/, '');
  const head = `[${id}/${total}] ${title} ${WORDING.running} `;

  // `note` is the CONSEQUENCE of a skip, not the reason for it: `(--docs skip)` says what the
  // operator asked for, and the note says what it will cost them. Optional, because most skips cost
  // nothing — a live-only step skipped in design-only is simply not applicable.
  if (status === 'skipped') {
    return `${head}${WORDING.skipped} (${detail})${note ? ` — ${note}` : ''}`;
  }
  if (status === 'cached') return `${head}${WORDING.cached}`;
  if (status === 'fail') return `${head}${WORDING.fail}`;

  const d = humanDuration(durationMs);
  const suffix = d ? ` (${d})` : '';
  return `${head}${status === 'warn' ? WORDING.warn : WORDING.ok}${suffix}`;
}

/**
 * The three lines that follow a FAIL, in the order the conventions fix them.
 *
 * A cause with no remedy is a bug report addressed to the user, so the remedy is not optional here:
 * a step that fails without one gets a sentence saying so, which is at least honest and shows up in
 * review as something to fix.
 */
export function failureBlock({ id, cause, remedy, launcher = './bootstrap.sh' }) {
  return [
    `${WORDING.fail} ${id}: ${cause}`,
    `Remedy: ${remedy || `none recorded — please report this with the log from .local/logs/`}`,
    `Re-run ${launcher} to resume at ${id}.`,
  ];
}

/**
 * The sentences the Node-FREE launchers print about the corpus.
 *
 * S10 and S11 have no Node and cannot run `verifyCitations`, so they check only that every area in
 * `vendor/docs-areas.txt` exists as a directory and say so. Those exact bytes have to match what the
 * Node path prints for the same situation, or an operator gets two vocabularies for one corpus
 * depending on whether Node happened to be installed. They live here, beside the step-line wording,
 * for the same reason that does: one table, three programs.
 */
export const CORPUS_TEXT = Object.freeze({
  citationsUnverified: 'citations: not verified until Node 20+ is installed',
  // The consequence of `--docs skip`, said at the moment the operator chooses it rather than left
  // for the doctor to spring on them later. It rides on the step line as `skipNote`.
  skipConsequence: 'the doctor will report the corpus as FAIL until you run ./snowarch docs sync',
  areasPresent: (present, total) => `areas: ${present}/${total} present`,
  areaMissing: (area) => `area ${area} missing — run ./snowarch docs sync once Node is installed, `
    + 'or re-run ./bootstrap.sh',
});
