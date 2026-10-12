// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 step 2 — every test that calls the router in its own process starts a licensed session first.
 *
 * From 2.0.13 the router refuses every tool without a valid licence, whatever the environment says (C6). A
 * spawned server takes the test-only hook through `licensedEnv()` (step 1), but a test that calls
 * `routeToolInvocation` in-process cannot: the shipped keys module is already loaded in its process. It passes
 * the keys instead, through `initLicence`'s `keys` parameter, as the licence suites do, and
 * `useLicensedSession()` (`tests/helpers/licensed-session.ts`) is the one way to do that. A file that builds
 * its own sessions (`licence/router.test.ts`) calls `initLicence` itself.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS = join(dirname(fileURLToPath(import.meta.url)), '..');

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...testFiles(p));
    else if (e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('ARC-11-C6 step 2 — in-process router calls', () => {
  it('every test file that calls routeToolInvocation starts a licensed session first', () => {
    const callers = testFiles(TESTS).filter((f) => /\brouteToolInvocation\(/.test(readFileSync(f, 'utf8')));
    // 14 files on 2026-10-12, this one not among them: an instrument that found none would prove nothing.
    expect(callers.length).toBeGreaterThanOrEqual(12);
    const bare = callers
      .filter((f) => !/\buseLicensedSession\(\)|\binitLicence\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(TESTS, f).split('\\').join('/'));
    expect(bare, `${bare.length} file(s) call the router in-process with no licensed session`).toEqual([]);
  });
});
