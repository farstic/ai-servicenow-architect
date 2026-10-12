// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C1 — E-31, the licence: what the banner says, as a check, so `status` and the doctor say it too.
//
// A WARNING, NEVER A FAILURE, AND IN THE QUICK SET. Nobody had a licence before 2.0.12, so a failure
// here would fail bootstrap's closing check, the status panel and CI for every user — the opposite of
// the owner's first requirement. Enforcement does not change the severity: the refusals are the CLI's
// and the server's, and the doctor is one of the commands a person runs to see why.
//
// OFFLINE. It reads `.local/licence.json` and the cached list; the list is fetched only by a command a
// person started, or by a live server start.
//
// THE DATA NAMES THE STATE AND THE ID, never the licensee or the org: a report's `--json` and the
// banner's cache travel further than the licence file does.
import { REFUSED, REMEDY, bannerLine, daysLeftPhrase, licenceStatus } from '../../licence/state.mjs';
import { PRODUCT_KEYS } from '../../licence/keys.mjs';
import { defineCheck } from '../registry.mjs';
import { cliOf } from '../spell.mjs';
import { fail, ok, warn } from './result.mjs';

/**
 * ARC-11-C6 (ruling R1) — what a step or a check that cannot run without a licence says instead of running. B06 and
 * B08 skip with it, and the server checks that call a tool will report it (step 5). They are E-31's words, so
 * every one points at the check that names the state and its remedy, and none keeps a copy.
 */
export const NO_LICENCE_IN_FORCE = 'no licence in force (see E-31)';

/**
 * ARC-11-C6 step 6 — the last release that runs without a licence. 2.0.13 is the first that refuses (C6), so going back
 * to escape enforcement means this one, whichever release a checkout came from: "the release you came from" is the
 * wrong answer from 2.0.14 on, because that one enforces too. Named once, for E-31's remedy, U4's notice and the e2e.
 */
export const LAST_UNENFORCED_RELEASE = 'v2.0.12';

/**
 * The way back, a sentence a reader can paste: E-31's remedy ends with it, and U4 says it before a move to a release
 * that enforces. The bootstrap's skip notes do not carry it (the architect's ruling): the way back is the doctor's
 * and the upgrade's to offer, not an install step's.
 */
export const WAY_BACK = (cli) => `To go back to the last release that runs without a licence: ${cli} upgrade --to ${LAST_UNENFORCED_RELEASE}.`;

export function licenceChecks() {
  return [
    defineCheck({
      id: 'E-31',
      section: 'repo',
      title: 'the licence for this checkout',
      // ARC-11-C6 step 5 — a FAIL for a refused state, because nothing runs without a licence in force. The doctor
      // names this as the one cause, and the server check that would fail behind it skips with its reason.
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        // `licenceKeys` is a test seam: a suite injects the keys it generated. Nothing in the product sets it.
        const s = licenceStatus(ctx.root, { keys: ctx.licenceKeys ?? PRODUCT_KEYS, now: new Date(ctx.now()) });
        // `perpetual` because the status panel renders its Licence line from this data with the banner's
        // function, and a perpetual licence has no `validUntil` to print.
        const data = { state: s.state, id: s.id, scope: s.scope, validUntil: s.validUntil, perpetual: s.perpetual,
          enforced: s.enforced, listVersion: s.list?.version ?? null };
        const line = bannerLine(s);
        if (s.state === 'ok') return ok(line, data);
        const why = s.state === 'expiring' ? daysLeftPhrase(s.daysLeft) : (s.state === 'missing' ? null : s.reason);
        const cli = cliOf(ctx);
        // `expiring` is in force, so it is a warning; the refused states are what enforcement refuses (gate.ts).
        // A refused state's remedy ends with the way back; an expiring licence is in force, and has none to offer.
        const refused = REFUSED.includes(s.state);
        return (refused ? fail : warn)(why ? `${line} — ${why}` : line, {
          data,
          remedy: refused ? `${REMEDY(cli)}. ${WAY_BACK(cli)}` : REMEDY(cli),
          command: `${cli} licence check`,
        });
      },
    }),
  ];
}
