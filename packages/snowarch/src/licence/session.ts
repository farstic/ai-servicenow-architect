// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the licence for this server process: computed once at start, and what follows from it.
 *
 * ONE STATE PER PROCESS. The server serves one session over stdio, so the licence is read once at
 * start (`startLicence`, from `main()`), recomputed only when the start's background refresh of the
 * revocation list lands, and applies from the next call. Installing or removing a licence takes a restart,
 * as every other start-up setting of this server does.
 *
 * WHAT FOLLOWS FROM IT:
 *   `assertLicensed`      — the router's first act (ruling R1). On every build (ARC-11-C6), a missing,
 *                           invalid, expired or revoked licence refuses EVERY tool with LICENCE_NOT_VALID,
 *                           and so does a design-only licence, because a server that answers is live
 *                           (ruling (d)). No variable turns that off.
 *   `takeLicenceNotice`   — one extra content block on the session's first answer when the state is
 *                           anything but a live licence in force; `content[0]` is never touched.
 *   `licenceAuditField`   — `{ licence: id }` on an audit line only when the signature holds, so a
 *                           default checkout's audit lines are byte-identical to what they were.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { remedyFor } from '../errors/codes.js';
import { cliSpelling, bootstrapSpelling } from '../cli/tty.js';
import { ServiceNowError } from '../utils/errors.js';
import type { ProductKey } from './core.js';
import { PRODUCT_KEYS } from './keys.js';
import { refreshList, LIVE_BUDGET_MS, type RefreshResult } from './refresh.js';
import { licenceLine, licenceStatus, readLicenceText, REFUSED, type CheckoutStatus } from './state.js';

interface Options {
  root?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  keys?: readonly ProductKey[];
  now?: () => Date;
}

interface Session {
  root: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  keys: readonly ProductKey[];
  now: () => Date;
  status: CheckoutStatus;
  noticeTaken: boolean;
}

let session: Session | null = null;

/** The project directory: Claude Code's `CLAUDE_PROJECT_DIR`, else the working directory — as the store's. */
const projectRoot = (): string => {
  const dir = process.env.CLAUDE_PROJECT_DIR;
  return dir !== undefined && dir !== '' ? dir : process.cwd();
};

/** Read the licence and the cached list, and hold the result for this process. */
export function initLicence({ root = projectRoot(), env = process.env, keys = PRODUCT_KEYS, now = () => new Date() }: Options = {}): CheckoutStatus {
  const status = licenceStatus(root, { keys, now: now(), env });
  session = { root, env, keys, now, status, noticeTaken: false };
  return status;
}

/** This process's licence; read on first use when `main()` has not started it (a test's import). */
export function currentLicence(): CheckoutStatus {
  return (session ?? { status: initLicence() }).status;
}

/** Test seam: forget the session. Never called by the server. */
export function resetLicenceForTests(): void { session = null; }

const spell = () => ({ cli: cliSpelling(), bootstrap: bootstrapSpelling() });

/** Throws LICENCE_NOT_VALID when this licence does not cover a live call. */
export function assertLicensed(): void {
  const s = currentLicence();
  const { remedy } = remedyFor('LICENCE_NOT_VALID', spell());
  if (REFUSED.includes(s.state)) {
    throw new ServiceNowError(`licence ${s.state}${s.signatureValid ? ` (${s.id})` : ''} — no tool runs without a valid `
      + `licence. ${remedy}`, 'LICENCE_NOT_VALID');
  }
  if (s.scope === 'design-only') {
    throw new ServiceNowError(`licence ${s.id} covers design-only; live needs a live-scope licence. ${remedy}`,
      'LICENCE_NOT_VALID');
  }
}

/** Why the state is worth a notice, or `null` when it is not: a live licence in force says nothing. */
function noticeWhy(s: CheckoutStatus): string | null {
  if (s.state === 'ok') return s.scope === 'design-only' ? `licence ${s.id} covers design-only; live needs a live-scope licence` : null;
  if (s.state === 'expiring') return `${s.daysLeft} days left`;
  if (s.state === 'missing') return 'this checkout has no licence';
  return s.reason;
}

/**
 * The first answer's extra block, once per process — or `null`. Always the SECOND block: a caller that
 * parses `content[0]` as JSON reads exactly what it always read.
 */
export function takeLicenceNotice(): string | null {
  const s = currentLicence();
  if (!session || session.noticeTaken) return null;
  session.noticeTaken = true;
  const why = noticeWhy(s);
  if (why === null) return null;
  return `${licenceLine(s)} — ${why}. Run ${spell().cli} licence check for the details.`;
}

/** `{ licence: id }` when the licence's signature holds; `{}` otherwise, so a default audit line is unchanged. */
export function licenceAuditField(): { licence?: string } {
  const s = currentLicence();
  return s.signatureValid && s.id ? { licence: s.id } : {};
}

/** Why the router refused: a refused state, or `scope` for a design-only licence on a live server. */
export type RefusalState = 'revoked' | 'expired' | 'invalid' | 'missing' | 'scope';

/**
 * ARC-11-C1 polish 2 — what a refusal's audit line says about the licence: the id when its signature holds,
 * else `missing`, and why. A forged file's id is unverified text, and a line written from it would let
 * whoever edits the file write into the audit trail, so it is never written.
 */
export function licenceRefusalFields(): { licence: string; state: RefusalState } {
  const s = currentLicence();
  const state = REFUSED.includes(s.state) ? s.state as RefusalState : 'scope';
  return { licence: s.signatureValid && s.id ? s.id : 'missing', state };
}

function readConfig(root: string): unknown {
  try { return JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')); } catch { return null; }
}

/**
 * Refresh the revocation list in the background and recompute the state when it lands. Never rejects
 * and never throws: a refresh that cannot run is an unreachable list, and the cached state stands.
 */
export async function refreshLicenceList({ budgetMs = LIVE_BUDGET_MS }: { budgetMs?: number } = {}): Promise<RefreshResult> {
  const s = session ?? (initLicence(), session!);
  try {
    const result = await refreshList(s.root, { config: readConfig(s.root), keys: s.keys, now: s.now(),
      env: s.env as NodeJS.ProcessEnv, budgetMs });
    if (session === s) s.status = licenceStatus(s.root, { keys: s.keys, now: s.now(), env: s.env });
    return result;
  } catch (e) {
    return { outcome: 'unreachable', version: null, detail: e instanceof Error ? e.message : 'the refresh failed' };
  }
}

/**
 * `main()`'s call: read the licence, and — for a LIVE server with a licence installed — start the refresh
 * of the revocation list in the background, EVERY start, whatever the cached list's age (the architect's
 * ruling (a), for the owner's "revoke → it stops at the next start"). Returns that refresh's promise, or
 * `null` when there is none; `main()` does not wait for it.
 *
 * No licence, no fetch: there is nothing a list could revoke, and a checkout without a licence starts
 * exactly as it did before ARC-11 — the owner's first requirement.
 */
export function startLicence({ live, ...options }: Options & { live: boolean }): Promise<RefreshResult> | null {
  initLicence(options);
  const s = session!;
  if (!live || readLicenceText(s.root) === null) return null;
  return refreshLicenceList();
}
