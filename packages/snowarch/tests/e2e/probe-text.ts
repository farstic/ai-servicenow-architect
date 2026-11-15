// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { PROBE_FIELDS } from '../../src/servicenow/probes.js';

/** The two probe results that depend on the instance's licensing. */
export type LicensedProbeKey = 'nowAssist' | 'fluent';

/**
 * The text the live wizard case expects to find in the wizard's output for one probe result: the label
 * the product derives from the flag, then the value the store holds for it.
 *
 * This is the spelling the live case has carried since ARC-07-C8, moved here unchanged so that a case
 * that needs no instance can hold it against what the wizard prints.
 */
export function expectedProbeText(
  key: LicensedProbeKey,
  probe: Readonly<Partial<Record<LicensedProbeKey, string>>> | undefined,
): string {
  const field = PROBE_FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`PROBE_FIELDS no longer carries ${key}`);
  return `${field.label} ${probe?.[key]}`;
}
