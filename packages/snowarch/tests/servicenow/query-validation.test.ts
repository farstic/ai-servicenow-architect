// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C172 — the `javascript:` guard on encoded queries: every GlideSystem date function the corpus documents
 * passes, code does not, and a refusal names what to send instead.
 *
 * The owner's live run of 2026-10-17 had `javascript:gs.minutesAgoStart(15)` refused, a function the platform's own
 * filter operators write into encoded queries (`markdown/platform-user-interface/r_OpAvailableFiltersQueries.md`) and
 * the GlideSystem API documents beside `minutesAgo` (`markdown/api-reference/server-api-reference/c_GlideSystemAPI.md`).
 * The allowlist held the plain `…Ago` functions and none of their `Start`, `End` or `Local` forms.
 */
import { describe, it, expect } from 'vitest';
import { validateQuery } from '../../src/servicenow/client.js';
import { ServiceNowError } from '../../src/utils/errors.js';

const refusal = (q: string): ServiceNowError | null => {
  try { validateQuery(q); return null; } catch (e) { return e as ServiceNowError; }
};

describe('ARC-09-C172 — the javascript: guard on encoded queries', () => {
  it('passes every documented GlideSystem …Ago date function', () => {
    for (const fn of ['daysAgo(7)', 'daysAgoStart(0)', 'daysAgoEnd(0)', 'daysAgoLocal(1)', 'hoursAgo(4)', 'hoursAgoStart(1)',
      'hoursAgoEnd(0)', 'minutesAgo(15)', 'minutesAgoStart(15)', 'minutesAgoEnd(0)', 'monthsAgo(1)', 'monthsAgoStart(1)',
      'monthsAgoEnd(0)', 'quartersAgo(1)', 'quartersAgoStart(1)', 'quartersAgoEnd(0)', 'yearsAgo(1)']) {
      expect(refusal(`sys_created_on>=javascript:gs.${fn}`), fn).toBeNull();
    }
    // The shape the platform's own "on" operators write: two expressions joined by @.
    expect(refusal('sys_created_onONLast 15 minutes@javascript:gs.minutesAgoStart(15)@javascript:gs.minutesAgoEnd(0)')).toBeNull();
  });

  it('refuses code, and the refusal says to send the value literally', () => {
    for (const q of ['sys_created_on>javascript:gs.getUser().getName()', 'active=true^sys_id=javascript:new GlideRecord("sys_user").query()',
      'name=javascript:gs.eval("x")']) {
      const e = refusal(q);
      expect(e, q).toBeInstanceOf(ServiceNowError);
      expect(e!.code).toBe('VALIDATION_ERROR');
      expect(e!.message).toMatch(/compute the value and send it literally/);
    }
  });
});
