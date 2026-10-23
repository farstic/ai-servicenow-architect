// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.

/**
 * ARC-09-C222 — a size cap on `docs/PLATFORM-NOTES.md`.
 *
 * The notes are an evidence archive, and every live sitting adds to them: 24 entries in 49,230 bytes when the cap
 * was set, about 2 KB an entry. What an entry teaches belongs in the skill or tool that acts on it. The file is read
 * whole by several checks and its ids are cited from 59 files, so at the cap it is split by area behind an index
 * that keeps every id where it was; the plan is a section of `docs/CONTRIBUTING.md`, and the message names it.
 *
 * It fails at the cap and does nothing before it: a warning that never fails is one nobody reads, and the pull
 * request that crosses the cap carries the split as part of its own work.
 *
 * Pure: the caller reads the file. Bytes, not characters, counted with LF line ends, so a checkout that turned
 * them into CRLF measures what git stores.
 */
export const NOTES = 'docs/PLATFORM-NOTES.md';
export const CAP = 80_000;
export const PLAN_HEADING = 'The platform notes have a size cap';

const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The size the cap is measured in: UTF-8 bytes, with every CRLF counted as one LF. */
export const notesBytes = (text) => Buffer.byteLength(text.replace(/\r\n/g, '\n'), 'utf8');

/** `{ verdict: 'ok', bytes }` under the cap; at it or over it, `{ verdict: 'split', bytes, message }`. */
export function sizeVerdict(text, { cap = CAP, path = NOTES } = {}) {
  const bytes = notesBytes(text);
  if (bytes < cap) return { verdict: 'ok', bytes };
  return {
    verdict: 'split',
    bytes,
    message: `${path} is ${grouped(bytes)} bytes, at or over the cap of ${grouped(cap)}: split it by area in this `
      + `pull request, as docs/CONTRIBUTING.md § "${PLAN_HEADING}" lays out`,
  };
}
