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
import { REMEDY, bannerLine, licenceStatus } from '../../licence/state.mjs';
import { PRODUCT_KEYS } from '../../licence/keys.mjs';
import { defineCheck } from '../registry.mjs';
import { cliOf } from '../spell.mjs';
import { ok, warn } from './result.mjs';

export function licenceChecks() {
  return [
    defineCheck({
      id: 'E-31',
      section: 'repo',
      title: 'the licence for this checkout',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        // `licenceKeys` is a test seam: a suite injects the keys it generated. Nothing in the product sets it.
        const s = licenceStatus(ctx.root, { keys: ctx.licenceKeys ?? PRODUCT_KEYS, now: new Date(ctx.now()), env: ctx.env ?? {} });
        const data = { state: s.state, id: s.id, scope: s.scope, validUntil: s.validUntil, enforced: s.enforced,
          listVersion: s.list?.version ?? null };
        const line = bannerLine(s, { enforced: s.enforced });
        if (s.state === 'ok') return ok(line, data);
        const why = s.state === 'expiring' ? `${s.daysLeft} days left` : (s.state === 'missing' ? null : s.reason);
        const cli = cliOf(ctx);
        return warn(why ? `${line} — ${why}` : line, {
          data,
          remedy: s.enforced ? REMEDY(cli)
            : 'information only while SNOW_LICENCE_ENFORCE is off; to install a licence, copy the file you were given '
              + 'to .local/licence.json',
          command: `${cli} licence check`,
        });
      },
    }),
  ];
}
