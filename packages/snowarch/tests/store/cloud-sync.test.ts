import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLOUD_SYNC_SEGMENTS, detectCloudSync, isUnderCloudSyncFolder } from '../../src/store/paths.js';

/**
 * ARC-07-S07, AC 3 — the provider list, read from the file all three implementations answer to.
 *
 * The cases are NOT written here. `tests/fixtures/cloud-sync-paths.json` is the list, and the
 * bootstrap's stdlib re-implementation (ARC-06-S05) and the doctor's E-25 (ARC-08-S03) read the
 * same file: three tables that merely looked alike would drift, and would disagree about a path
 * exactly when it mattered.
 *
 * Every path in it is synthetic — none exists on any machine, and none is anyone's real home — so
 * `realpath` is stubbed to the identity. That is also what the product does for a path that is not
 * there yet, which is most of them: a store being planned has no directory to resolve.
 */
const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE = resolve(here, '../fixtures/cloud-sync-paths.json');

interface Fixture {
  synced: Array<{ path: string; provider: string; root: string; why: string }>;
  quiet: Array<{ path: string; why: string }>;
  env: Array<{ path: string; set: Record<string, string>; provider: string | null; root: string | null; why: string }>;
}
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
const asis = (p: string): string => p;

describe('detectCloudSync — the fixture is the specification', () => {
  it('finds every provider the fixture says is there, and names the folder to move out of', () => {
    // Non-vacuous: an empty fixture would make every `for` below a no-op.
    expect(fixture.synced.length).toBeGreaterThan(5);
    for (const row of fixture.synced) {
      const hit = detectCloudSync(row.path, { env: {}, realpath: asis });
      expect(hit, `${row.path} — ${row.why}`).not.toBeNull();
      expect(hit?.provider, row.path).toBe(row.provider);
      // The root is compared with separators normalised: a Windows path can reach a POSIX runner,
      // and the story's own fixture rows carry both.
      expect(hit?.root.replace(/\\/g, '/'), row.path).toBe(row.root.replace(/\\/g, '/'));
    }
  });

  it('stays quiet about everything the fixture says is not synced', () => {
    expect(fixture.quiet.length).toBeGreaterThan(3);
    for (const row of fixture.quiet) {
      expect(detectCloudSync(row.path, { env: {}, realpath: asis }), `${row.path} — ${row.why}`).toBeNull();
    }
  });

  it('reads the Windows environment roots — the only detector Known Folder Move has', () => {
    expect(fixture.env.length).toBeGreaterThan(2);
    for (const row of fixture.env) {
      const hit = detectCloudSync(row.path, { env: row.set, realpath: asis });
      if (row.provider === null) {
        expect(hit, `${row.path} — ${row.why}`).toBeNull();
      } else {
        expect(hit?.provider, `${row.path} — ${row.why}`).toBe(row.provider);
        expect(hit?.root.replace(/\\/g, '/')).toBe((row.root as string).replace(/\\/g, '/'));
      }
    }
    // And a variable that is set changes nothing for a path outside it — asserted above by the
    // `provider: null` row, which exists so this cannot degrade into "any set variable means yes".
  });

  it('resolves a symlink before matching — a link into a synced folder IS a synced path', () => {
    const link = '/Users/me/work/repo';
    const target = '/Users/me/Dropbox/repo';
    expect(detectCloudSync(link, { env: {}, realpath: asis })).toBeNull();
    expect(detectCloudSync(link, { env: {}, realpath: (p) => (p === link ? target : p) })?.provider)
      .toBe('Dropbox');
  });

  it('isUnderCloudSyncFolder is the same question, asked for a boolean', () => {
    for (const row of fixture.synced) expect(isUnderCloudSyncFolder(row.path), row.path).toBe(true);
    for (const row of fixture.quiet) expect(isUnderCloudSyncFolder(row.path), row.path).toBe(false);
  });

  it('the pattern list is data, and every entry names a provider a user would recognise', () => {
    expect(CLOUD_SYNC_SEGMENTS.length).toBeGreaterThan(4);
    for (const { pattern, provider } of CLOUD_SYNC_SEGMENTS) {
      expect(pattern.flags, `${provider}: case must not decide`).toContain('i');
      expect(provider.length).toBeGreaterThan(0);
    }
  });
});
