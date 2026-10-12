// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the licence as this checkout holds it, and the one line that says so.
 *
 * TWO FILES. `.local/licence.json` is the installed licence, copied in by hand. `.local/revocations.json`
 * is the last revocation list a fetch brought back, with when it was checked — written only by
 * something a person started (`licence check --refresh`, `upgrade`, `upgrade --check`) or by a live
 * server start, never by the SessionStart hook, which reads it and nothing else.
 *
 * ENFORCED ON EVERY BUILD (ARC-11-C6, from 2.0.13). No variable, and no absence of one, turns it off:
 * `missing`, `invalid`, `expired` and `revoked` refuse every CLI command except the five a person needs
 * to repair the state, and every MCP tool (ruling R1). `expiring` is never refused. The architect rejected
 * an opt-out on 2026-10-12: beside C7's "a modified build still starts and works", a switch would be a
 * documented recipe for running without a licence.
 *
 * THE LINE (`bannerLine`) is the one wording the banner, the doctor, the status panel and the server's
 * notice print. It lives in `line.mjs`, a leaf the pure status panel can import, and is re-exported
 * here for every caller that already reads the state.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { checkLicence, readList } from './core.mjs';
import { PRODUCT_KEYS } from './keys.mjs';
import { licencePath, revocationsPath } from '../local-paths.mjs';

export { bannerLine } from './line.mjs';

/** The states enforcement refuses. `expiring` is not one: a licence in its last month is in force. */
export const REFUSED = Object.freeze(['missing', 'invalid', 'expired', 'revoked']);

/**
 * The commands that run without a licence: the five a person needs to see and repair the state (R1), and
 * `bootstrap` in full (ARC-11-C6, ruling A), because installing is how a checkout first reads one.
 */
export const CLI_ALLOWED = Object.freeze(['licence', 'doctor', 'status', 'version', 'upgrade', 'bootstrap']);

/**
 * And the forms of other commands that do: `mode design`, which deregisters a checkout before its folder is
 * deleted (INSTALL.md, Uninstall). `mode` itself, and `mode live`, are refused.
 */
export const CLI_ALLOWED_FORMS = Object.freeze({ mode: Object.freeze(['design']) });

/** Does this command, with these arguments, run without a licence? */
export const allowedCommand = (name, positional = []) => CLI_ALLOWED.includes(name)
  || (Object.hasOwn(CLI_ALLOWED_FORMS, name) && CLI_ALLOWED_FORMS[name].includes(positional[0]));

/**
 * A list checked longer ago than this is STALE: `licence show` and `licence check` say so. A live server
 * start refreshes the list every time; a design-only checkout, where no server starts, fetches it only
 * when somebody asks.
 */
export const LIST_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * What to do about a refusal — the same sentence as the server's `LICENCE_NOT_VALID` remedy, with the
 * launcher filled in (the parity test compares them).
 */
export const REMEDY = (cli) => `Run ${cli} licence check to see why, then install a valid licence as `
  + '.local/licence.json. A running Claude Code session keeps what it read at start, so restart it afterwards';

/** The installed licence's text, or `null` when there is none. */
export function readLicenceText(root) {
  const path = licencePath(root);
  try { return existsSync(path) ? readFileSync(path, 'utf8') : null; } catch { return null; }
}

/** The cache, or `null`. A malformed file is an absent one — the hook reads this, and must never crash. */
export function readListCache(root) {
  try {
    const raw = JSON.parse(readFileSync(revocationsPath(root), 'utf8'));
    return raw && typeof raw === 'object' && typeof raw.checkedAt === 'string' ? raw : null;
  } catch { return null; }
}

/**
 * Write the cache whole, atomically, 0600 — the same discipline as every other `.local/` file. A
 * half-written cache read by the banner at the wrong moment would be a list that is not there.
 */
export function writeListCache(root, { list = null, checkedAt, source }) {
  const path = revocationsPath(root);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify({ checkedAt, source, list }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

/** The cached list, verified with the shipped keys — or `null`, which is what an unverifiable one is. */
export function heldList(cache, keys = PRODUCT_KEYS) {
  if (!cache?.list) return null;
  const list = readList(cache.list, { keys });
  return list.ok ? list : null;
}

/** Is the cached list stale? No cache, an unreadable date or a date from the future all are. */
export function listStale(cache, now = new Date(), afterMs = LIST_REFRESH_MS) {
  const at = Date.parse(cache?.checkedAt ?? '');
  if (Number.isNaN(at)) return true;
  const age = now.getTime() - at;
  return age < 0 || age >= afterMs;
}

/**
 * This checkout's licence: the core's status, which list it was judged against, and `enforced`, which is
 * true on every build. Reads two files; fetches nothing, and reads no variable.
 */
export function licenceStatus(root, { keys = PRODUCT_KEYS, now = new Date() } = {}) {
  const cache = readListCache(root);
  const list = heldList(cache, keys);
  const status = checkLicence(readLicenceText(root), { keys, list, now });
  return { ...status, enforced: true, list: list ? { version: list.version, checkedAt: cache.checkedAt } : null };
}

/** What a refused command prints: the state, why it was refused, and the remedy. */
export const refusalLines = (name, s, cli) => [
  `snowarch ${name}: licence ${s.state}${s.signatureValid ? ` (${s.id})` : ''} — this command does not run `
    + 'without a valid licence',
  REMEDY(cli),
];

/** Is this command refused? For a refused state, every command but the allowed ones. */
export const refusesCommand = (name, s, positional = []) => REFUSED.includes(s.state) && !allowedCommand(name, positional);
