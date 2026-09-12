// ARC-08-C1 — what the `--json` form may carry, and what it may not.
//
// `--json` IS THE FORM THAT TRAVELS. The text report, the banner and the doctor cache are local to
// one machine and keep the user's own words; the JSON is what an issue template asks a stranger to
// paste into a public tracker, and a validation record's lint would refuse the same content
// (ARC-10-S07). So this masks at the boundary rather than at each site that writes a string.
//
// MEASURED, on a live fixture at ARC-10-S10: the label appeared in SEVEN fields across four shapes
// — `modeLine`, `modeLineDetailed`, `server.instances[].label`, two check `detail` strings and two
// `data.fix*.label` payloads. That is the argument for masking BY VALUE rather than by field: the
// eighth field arrives without anyone remembering the ruling that created this file.
//
// The host was NOT in that JSON. It is masked anyway, with the same shape the cache guard uses
// (ARC-09-C9's `INSTANCE_HOST`, imported rather than rewritten): the guard exists because
// `redact()` leaves an instance address alone, and a report that only happens not to carry one is
// not the same as a report that cannot.
import { INSTANCE_HOST } from '../doctor-cache.mjs';

export const LABEL_MASK = '<label>';
export const HOST_MASK = '<host>';

/** `\b` around a label, escaped — a label is a user's word, not a pattern. */
const wordRe = (s) => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'g');

/**
 * Every instance label the report knows about.
 *
 * Read from the report rather than from the store: the boundary masks what it is about to EMIT,
 * and a label that reached the object by some path nobody listed is exactly the case this is for.
 */
export function labelsIn(report) {
  const out = new Set();
  for (const i of report?.server?.instances ?? []) {
    if (typeof i?.label === 'string' && i.label.length > 0) out.add(i.label);
  }
  return [...out];
}

/**
 * The report as it leaves the process.
 *
 * WORD-BOUNDED, and the cost is stated rather than special-cased: a user whose label is `dev` also
 * masks the environment token, so `(dev)` reads `(<label>)`. That is the right trade — `dev` is
 * still the user's word for their instance, and a rule with an exception list is a rule whose
 * exceptions are wrong for somebody. The collision is asserted in the test, so it is documented
 * behaviour rather than a discovery.
 */
export function maskForJson(report, labels = labelsIn(report)) {
  const res = [...labels].sort((a, b) => b.length - a.length).map((l) => [wordRe(l), LABEL_MASK]);
  const maskString = (s) => {
    let out = s.replace(INSTANCE_HOST, HOST_MASK);
    for (const [re, to] of res) out = out.replace(re, to);
    return out;
  };
  const walk = (v) => {
    if (typeof v === 'string') return maskString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(report);
}
