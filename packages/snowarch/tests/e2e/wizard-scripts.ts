// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { AUTH_RETRY_CHOICES, MAX_ATTEMPTS, PASSWORD_PROMPT, authFailedRetry } from '../../src/cli/instance.js';
import type { PtyOptions } from '../helpers/pty.js';

/** The answers a live case types into the wizard's terminal, each after the prompt it waits for. */
export type Script = NonNullable<PtyOptions['script']>;

/**
 * ARC-09-C286 — THE WIZARD'S WORDS ARE THE PRODUCT'S, NOT A SECOND SPELLING.
 *
 * The live cases waited for `Password:` and `attempt 2 of 3` and answered `y`, written by hand in the file that runs only at night and
 * only with an instance. ARC-07-W3 reworded the password prompt (2026-09-26) and ARC-07-W10 made the retry question a numbered menu
 * that prints `Attempt 2 of 3.` and takes 1, 2, 3 or Enter; the cases were not changed and would have stood at the first prompt until
 * their timeout. It is the defect ARC-09-C278 found in the probe line, and the answer is the same: a pattern is what the product
 * prints, asked of the product, and `wizard-scripts.test.ts` runs these scripts through the wizard in every pull request.
 */
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The prompt for the password, as the wizard prints it. */
export const passwordPrompt = new RegExp(escapeRegExp(PASSWORD_PROMPT));

/** The question after a rejected login, for the attempt that is about to be made: the failure line the wizard writes above its menu. */
export const retryPrompt = (attempt: number): RegExp => new RegExp(escapeRegExp(authFailedRetry(attempt)));

/** The number that picks `key` in the retry menu: its position in the menu the wizard prints. */
export function retryChoice(key: string): string {
  const at = AUTH_RETRY_CHOICES.findIndex((choice) => choice.key === key);
  if (at < 0) throw new Error(`the retry menu has no "${key}" choice any more`);
  return String(at + 1);
}

/**
 * Case 1 — the happy path: the password, then Enter on the review screen. The footer of that screen has no constant of its own, so its
 * words are here and `wizard-scripts.test.ts` holds them against the screen the wizard prints (ARC-07-C14 renamed it once).
 */
export const happyPathScript = (password: string): Script => [
  { waitFor: passwordPrompt, send: `${password}\n` },
  { waitFor: /Enter = apply as shown/, send: '\n' },
];

/** Case 3 — a wrong password for every attempt the wizard allows, `re-enter the password (same account)` each time it is offered. */
export function threeFailuresScript(wrong: string): Script {
  const script: Script = [{ waitFor: passwordPrompt, send: `${wrong}\n` }];
  for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
    script.push({ waitFor: retryPrompt(attempt), send: `${retryChoice('password')}\n` });
    script.push({ waitFor: passwordPrompt, send: `${wrong}\n` });
  }
  return script;
}
