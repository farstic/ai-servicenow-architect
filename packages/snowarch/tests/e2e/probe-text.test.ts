// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, expect, it } from 'vitest';

import { probeSummary } from '../../src/cli/instance.js';
import { PROBE_FIELDS, type LastProbe, type ProbeStatus } from '../../src/servicenow/probes.js';
import { FLAG_NAMES, type Flags } from '../../src/utils/permissions.js';
import { expectedProbeText } from './probe-text.js';

/**
 * ARC-09-C278 — what the live wizard case expects is what the wizard prints.
 *
 * The live case (`instance-wizard.e2e.test.ts`) runs only against an instance, behind `RUN_LIVE_E2E=1`, so
 * for as long as its expectation was spelled in the test, nothing in an ordinary run could say that the
 * spelling had gone stale: the case asserted `now_assist ok` and `fluent not installed` against a line that
 * says `now_assist: ok` and `fluent: ServiceNow SDK not installed`. This holds the expectation against the
 * wizard's own line, `probeSummary`, for every status a probe can come back with, and needs no instance.
 */
const ALL_ON = Object.fromEntries(FLAG_NAMES.map((flag) => [flag, 'true'])) as Flags;

const record = (status: ProbeStatus | undefined): LastProbe => ({
  at: '2026-11-15T00:00:00.000Z',
  auth: 'ok', write: 'ok', scripting: 'ok', cmdb: 'ok', atf: 'ok',
  nowAssist: status as ProbeStatus, fluent: status as ProbeStatus,
});

const STATUSES: ReadonlyArray<ProbeStatus | undefined> = [
  'ok', 'not licensed', 'not installed', 'role missing', 'auth failed', 'unreachable', 'error', 'skipped', undefined,
];

/** What the line says about one field: from its label to the next separator, without the line's closing full stop. */
const said = (line: string, label: string): string | undefined =>
  new RegExp(`${label}[^·]*`).exec(line)?.[0].replace(/\.$/, '').trimEnd();

describe('ARC-09-C278 — the live case expects the line the wizard prints', () => {
  it.each(STATUSES)('nowAssist and fluent that came back as %s are in the Saved line as the case expects them', (status) => {
    const probe = record(status);
    const line = probeSummary(probe, ALL_ON, false);
    for (const key of ['nowAssist', 'fluent'] as const) {
      const want = expectedProbeText(key, probe);
      const label = PROBE_FIELDS.find((f) => f.key === key)!.label;
      expect(line, `the case expects ${JSON.stringify(want)}, the wizard says ${JSON.stringify(said(line, label))}`).toContain(want);
    }
  });

  it('is not vacuous: for each field it names the label the product prints and says something after it', () => {
    for (const status of STATUSES) {
      for (const key of ['nowAssist', 'fluent'] as const) {
        const label = PROBE_FIELDS.find((f) => f.key === key)!.label;
        const text = expectedProbeText(key, record(status));
        expect(text.startsWith(label), `${text} does not start with ${label}`).toBe(true);
        expect(text.length, `${text} says nothing after the label`).toBeGreaterThan(label.length + 1);
      }
    }
  });
});
