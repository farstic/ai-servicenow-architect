import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES, ERROR_CODE_NAMES, remedyFor } from '../../src/errors/codes.js';
import { labelExists } from '../../src/cli/instance.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

/**
 * The registry is the single source ARC-05's TROUBLESHOOTING generator reads. A registry
 * nobody checks drifts from the code inside one story, so this derives the truth from `src/`
 * and fails on a code that is produced but not registered.
 *
 * Both directions matter: an unregistered code means the generator will not document a
 * failure users will hit, and a registered code nothing produces means it will document one
 * that cannot happen.
 *
 * PRINTED, not only thrown — added in ARC-07-S05's rework. `LABEL_EXISTS` reached users as a
 * literal in a wizard sentence for a whole story: nothing throws it, so the scan could not see
 * it, so TROUBLESHOOTING documented every other failure of `instance add` and not that one. A
 * code a user is told to search for is a code the registry owes them a remedy for, whichever
 * way the program emitted it. The sentence shape `CODE — …` is the house form, and requiring an
 * underscore is what separates a code from an English word in prose (`PATH — `, `URL — `); the
 * three errno names that carry none (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`) come from Node
 * and are never invented here, so nothing new can hide behind that.
 */
function producedCodes(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts')) continue;
      const text = readFileSync(p, 'utf8');
      // Comments are prose about codes, not codes: a block comment naming one is documentation.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of code.matchAll(/([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+) —/g)) found.add(m[1]);
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
    const missing = [...producedCodes()].filter((c) => !ERROR_CODE_NAMES.has(c)).sort();
    expect(missing, `add these to src/errors/codes.ts with a remedy:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('every registered code is actually produced somewhere', () => {
    // The other direction. A code the generator documents but nothing produces sends a
    // reader looking for a failure that cannot happen.
    const produced = producedCodes();
    const unused = ERROR_CODES.map((e) => e.code).filter((c) => !produced.has(c)).sort();
    expect(unused, `these are registered but never produced:\n  ${unused.join('\n  ')}`).toEqual([]);
  });

  it('every code has a non-empty remedy and appears once', () => {
    for (const e of ERROR_CODES) expect(e.remedy.trim().length, `${e.code} has no remedy`).toBeGreaterThan(0);
    const names = ERROR_CODES.map((e) => e.code);
    expect(names.length).toBe(new Set(names).size);
  });

  it('finds a plausible number of codes — the extractor is not silently matching nothing', () => {
    expect(producedCodes().size).toBeGreaterThan(30);
  });

  it('sees a code that is PRINTED rather than thrown — the gap this scan was widened to close', () => {
    // Non-vacuous by construction: the one code in the registry that nothing throws is the one
    // the wizard prints. If the printed arm of the extractor stops matching, this goes red while
    // every other assertion here stays green.
    expect(producedCodes().has('LABEL_EXISTS')).toBe(true);
    expect(labelExists('pdi')).toContain('LABEL_EXISTS — "pdi" already exists.');
    // And the remedy the user reads is the registry's, not a second copy beside it.
    expect(labelExists('pdi').toLowerCase()).toContain(remedyFor('LABEL_EXISTS').remedy.slice(1).toLowerCase());
  });
});
