// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { PROBE_FIELDS, probeFieldText } from '../../src/servicenow/probes.js';

/** The two probe results that depend on the instance's licensing. */
export type LicensedProbeKey = 'nowAssist' | 'fluent';

/**
 * The text the live wizard case expects to find in the wizard's output for one probe result.
 *
 * ARC-09-C278 — THE RENDERER IS THE PRODUCT'S, NOT A SECOND SPELLING. ARC-07-C8 took the label from
 * `PROBE_FIELDS` and still wrote the line itself, as `<label> <stored value>`: `now_assist ok`. ARC-07-W16
 * had by then made `probeFieldText` the one renderer of a probe result for every surface, which prints
 * `now_assist: ok` and `fluent: ServiceNow SDK not installed`, so the case was stale against the wizard
 * it tests, and nothing noticed because the nightly ran a branch from September (`main`) and no unit
 * case held the two together. The expected text is what `probeFieldText` makes of the label and the
 * stored value, and `probe-text.test.ts` holds it against the line the wizard builds.
 */
export function expectedProbeText(
  key: LicensedProbeKey,
  probe: Readonly<Partial<Record<LicensedProbeKey, string>>> | undefined,
): string {
  const field = PROBE_FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`PROBE_FIELDS no longer carries ${key}`);
  return probeFieldText(field.label, probe?.[key]);
}
