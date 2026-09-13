import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-04 acceptance, B04-05 — ARC-04-S01 criterion 4 and ARC-04-S02 criterion 6, made true again.
 *
 * The criterion is `grep -rn "servicenow-mcp\|registry.npmjs.org\|npm link\|smithery\|server.json"
 * packages/snowarch/src packages/snowarch/package.json` returns nothing. It has been false since
 * ARC-07-S08: `src/cli/import-legacy.ts` implements `instance import --from-legacy`, whose entire
 * job is to find the legacy store — `~/.config/servicenow-mcp/instances.json` — so it must name the
 * path the criterion forbids. Four of the five literals are genuinely gone; one has a carrier.
 *
 * A ratchet rather than a grep, in both directions, and keyed on the FILE'S ROLE rather than its
 * name: a file that carries the legacy path must be one of the listed carriers, and a listed
 * carrier that no longer carries it must be removed from the list. That is the shape the engine's
 * `LEGACY_MENTIONS` ratchet uses for the retired script directory — named here by description and
 * not by path, because spelling that path is exactly what that ratchet exists to catch, and it
 * caught this comment when it did — and it is what stops an exemption outliving its
 * reason — which is how this criterion went stale in the first place.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '../..');

/** The five the two criteria name, as literals. */
const LITERALS = ['servicenow-mcp', 'registry.npmjs.org', 'npm link', 'smithery', 'server.json'];

/**
 * Files allowed to contain a literal, with WHY. One entry: the legacy importer, which cannot do its
 * job without naming the legacy path.
 */
const CARRIERS = new Map([
  ['src/cli/import-legacy.ts', { literal: 'servicenow-mcp', why: 'implements `instance import --from-legacy`; the legacy store path is its input' }],
]);

/** Tracked files under the package's src/ plus its package.json. */
const tracked = (): string[] => execFileSync('git', ['ls-files', '--cached', '--others',
  '--exclude-standard', 'src', 'package.json'], { cwd: pkg, encoding: 'utf8' })
  .split('\n').filter(Boolean);

describe('B04-05 — the retired names stay out of the shipped package', () => {
  const hits = (): Map<string, string[]> => {
    const found = new Map<string, string[]>();
    for (const rel of tracked()) {
      let text: string;
      try { text = readFileSync(join(pkg, rel), 'utf8'); } catch { continue; }
      const matched = LITERALS.filter((l) => text.includes(l));
      if (matched.length) found.set(rel, matched);
    }
    return found;
  };

  it('every file that still carries a retired name is a listed carrier, for its listed literal', () => {
    for (const [file, matched] of hits()) {
      const carrier = CARRIERS.get(file);
      expect(carrier, `${file} carries ${matched.join(', ')} and is not a listed carrier`).toBeDefined();
      expect(matched).toEqual([carrier!.literal]);
    }
  });

  it('every listed carrier still carries its literal — an exemption may not outlive its reason', () => {
    // The direction the original grep could never have: a carrier kept after its file stopped
    // needing it is a hole in the ratchet that nothing would ever report.
    const found = hits();
    for (const [file, { literal }] of CARRIERS) {
      expect(found.get(file), `${file} is listed as a carrier and no longer carries anything`).toBeDefined();
      expect(found.get(file)).toContain(literal);
    }
  });

  it('four of the five are gone from the package entirely, and that is asserted per literal', () => {
    const found = hits();
    const carried = new Set([...CARRIERS.values()].map((c) => c.literal));
    for (const literal of LITERALS.filter((l) => !carried.has(l))) {
      const files = [...found].filter(([, ls]) => ls.includes(literal)).map(([f]) => f);
      expect(files, `${literal} is back in the package`).toEqual([]);
    }
    // Not vacuous: the scan must actually be reading files, or every assertion above is empty.
    expect(tracked().length).toBeGreaterThan(20);
    expect(found.size).toBeGreaterThan(0);
  });
});
