// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import type { PtyOptions } from '../helpers/pty.js';

/** The answers a live case types into the wizard's terminal, each after the prompt it waits for. */
export type Script = NonNullable<PtyOptions['script']>;

/**
 * Case 1 — the happy path: the password, then Enter on the review screen. These are the patterns the live
 * file carried inline until ARC-09-C286, copied as they were.
 */
export const happyPathScript = (password: string): Script => [
  { waitFor: /Password:/, send: `${password}\n` },
  { waitFor: /Enter = apply as shown/, send: '\n' },
];

/** Case 3 — a wrong password three times, `y` to the retry question each time it is asked. As the live file had it. */
export const threeFailuresScript = (wrong: string): Script => [
  { waitFor: /Password:/, send: `${wrong}\n` },
  { waitFor: /attempt 2 of 3/, send: 'y\n' },
  { waitFor: /Password:/, send: `${wrong}\n` },
  { waitFor: /attempt 3 of 3/, send: 'y\n' },
  { waitFor: /Password:/, send: `${wrong}\n` },
];
