// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the `Licence:` line, and nothing else, so that every surface can print it.
 *
 * A LEAF, BECAUSE THE STATUS PANEL READS IT. `doctor/panel.mjs` renders this line from E-31's data,
 * and `tests/doctor/panel.test.mjs` walks the panel's import graph and fails on `node:fs`,
 * `process.env` or a clock. `state.mjs`, where the line was written first, reads the licence file, so
 * the panel could not import it; the function moved here, imports nothing, and `state.mjs` re-exports
 * it. The same move `check-ids.mjs` made for the doctor's summary.
 *
 * ONE WORDING. The session-start banner, the doctor's E-31, `licence show`, `verify` and `check`, and
 * the status panel all print this; the server's notice renders it identically, and
 * `tools/snowarch/tests/licence-parity.test.mjs` holds the two.
 */

/**
 * The line. `ok` and `expiring` name the licence and its term. Enforcement is on every build (ARC-11-C6),
 * so no state carries a word for it: the state alone decides whether the session may go on.
 */
export function bannerLine(s) {
  const parts = [`Licence: ${s.state}`];
  if (s.state === 'ok' || s.state === 'expiring') {
    parts.push(s.id);
    if (s.scope === 'design-only') parts.push('design-only');
    parts.push(s.perpetual ? 'perpetual' : `until ${s.validUntil}`);
  }
  return parts.join(' · ');
}
