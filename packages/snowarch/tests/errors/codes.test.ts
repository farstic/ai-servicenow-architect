import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES, ERROR_CODE_NAMES } from '../../src/errors/codes.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

/**
 * The registry is the single source ARC-05's TROUBLESHOOTING generator reads. A registry
 * nobody checks drifts from the code inside one story, so this derives the truth from `src/`
 * and fails on a code that is thrown but not registered.
 *
 * Both directions matter: an unregistered code means the generator will not document a
 * failure users will hit, and a registered code nothing throws means it will document one
 * that cannot happen.
 */
function thrownCodes(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts')) continue;
      const text = readFileSync(p, 'utf8');
      // `new ServiceNowError(<message>, 'CODE')` and object literals carrying `code: 'CODE'`.
      for (const m of text.matchAll(/new ServiceNowError\(\s*(?:[^,]|,(?![\s\n]*'))*?,\s*'([A-Z][A-Z0-9_]{2,})'/gs)) found.add(m[1]);
      for (const m of text.matchAll(/code:\s*'([A-Z][A-Z0-9_]{2,})'\s*[,}]/g)) found.add(m[1]);
    }
  };
  walk(SRC);
  return found;
}

describe('the error-code registry is complete and honest', () => {
  it('every code thrown in src/ is registered with a remedy', () => {
    const missing = [...thrownCodes()].filter((c) => !ERROR_CODE_NAMES.has(c)).sort();
    expect(missing, `add these to src/errors/codes.ts with a remedy:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('every registered code is actually thrown somewhere', () => {
    // The other direction. A code the generator documents but nothing produces sends a
    // reader looking for a failure that cannot happen.
    const thrown = thrownCodes();
    const unused = ERROR_CODES.map((e) => e.code).filter((c) => !thrown.has(c)).sort();
    expect(unused, `these are registered but never thrown:\n  ${unused.join('\n  ')}`).toEqual([]);
  });

  it('every code has a non-empty remedy and appears once', () => {
    for (const e of ERROR_CODES) expect(e.remedy.trim().length, `${e.code} has no remedy`).toBeGreaterThan(0);
    const names = ERROR_CODES.map((e) => e.code);
    expect(names.length).toBe(new Set(names).size);
  });

  it('finds a plausible number of codes — the extractor is not silently matching nothing', () => {
    expect(thrownCodes().size).toBeGreaterThan(30);
  });
});
