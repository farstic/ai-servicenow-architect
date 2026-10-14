// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getPackageVersion } from '../../src/utils/version.js';

describe('getPackageVersion', () => {
  it('reports the real package.json version (no hardcoded drift)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(getPackageVersion()).toBe(pkg.version);
    expect(getPackageVersion()).not.toBe('4.0.0'); // the old hardcoded value
  });
});
