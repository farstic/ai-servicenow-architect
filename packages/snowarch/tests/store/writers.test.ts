// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C307 — every place that writes the store is on a list, with the reason it may.
 *
 * The defect was three writers (`instance add`, the 1.x import, the installer) that each started from "whatever `loadStore` gave, or an
 * empty store", and so wrote over a store that existed and did not load. The fix is one function a writer starts from (`openStoreForWrite`),
 * and the rule "no write replaces a store file that did not load". A rule that lives in the callers is only as good as the next caller, so
 * this reads the SOURCE: each file that calls `saveStore` is named here with how many calls it has and what makes each one safe, and a new
 * call, in a file on the list or off it, fails this case until somebody has said why it may.
 *
 * What makes a call safe is one of three things:
 *   - it STARTS FROM `openStoreForWrite` (a path with nothing at it is a new store; anything else is the store, or a refusal);
 *   - it STARTS FROM `openStore` (the manage commands) or `loadStore`, which refuse on any error and only treat a missing file as new;
 *   - it is an EXPLICIT replacement the user asked for (`store restore`, after `Proceed?`), or a migration that reads the file as JSON and
 *     keeps a copy of it first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');

interface Writer { file: string; calls: number; safe: string }

/** The calls to `saveStore` in product source, by file, each with what makes it safe. */
const WRITERS: readonly Writer[] = [
  { file: 'packages/snowarch/src/store/index.ts', calls: 1,
    safe: 'updateInstance: loads the store first and returns the loader\'s error; it patches one entry and refuses a credential key' },
  { file: 'packages/snowarch/src/store/migrations/index.ts', calls: 2,
    safe: 'migrateStore reads the file as JSON, refuses a file that is not (STORE_UNREADABLE), keeps a copy of the bytes first and refuses a migration that touches a credential; restoreBackup is `store restore`: the user names the file and answers Proceed?, and the backup is parsed before the current store is replaced' },
  { file: 'packages/snowarch/src/cli/instance.ts', calls: 4,
    safe: 'runAdd starts from openStoreForWrite; writeEntry, set-default and remove start from openStore, which refuses on any loader error' },
  { file: 'packages/snowarch/src/cli/import-legacy.ts', calls: 1,
    safe: 'runImport starts from openStoreForWrite, before it plans, asks or probes anything, even for a dry run' },
  { file: 'tools/snowarch/lib/steps/B06.mjs', calls: 1,
    safe: 'fromInstanceFile asks openStoreForWrite before it probes, and run() refuses a store that cannot be read before it starts the wizard or reads the instance file' },
];

const SKIP = new Set(['node_modules', 'dist', '.git']);
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (/\.(ts|mjs|js)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** A call, not the declaration and not a mention in a comment or a string of prose. */
function callsOf(text: string): number {
  return text.split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && !/export function saveStore\(/.test(line))
    .reduce((n, line) => n + (line.match(/\bsaveStore\(/g) ?? []).length, 0);
}

describe('every call to saveStore in product source is on the list, with its reason', () => {
  const found = new Map<string, number>();
  for (const base of ['packages/snowarch/src', 'tools/snowarch/lib']) {
    for (const file of sources(join(ROOT, base))) {
      const n = callsOf(readFileSync(file, 'utf8'));
      if (n > 0) found.set(relative(ROOT, file).split('\\').join('/'), n);
    }
  }

  it('the files that call it, and how many calls each has, are the list', () => {
    expect(Object.fromEntries([...found].sort())).toEqual(Object.fromEntries(WRITERS.map((w) => [w.file, w.calls]).sort()));
  });

  it('every entry says why its calls are safe, and the list is not vacuous', () => {
    expect(WRITERS.length).toBeGreaterThanOrEqual(5);
    for (const w of WRITERS) expect(w.safe.length, w.file).toBeGreaterThan(40);
  });

  it('the three writers that started from "the loader\'s answer or an empty store" start from the one function now', () => {
    for (const file of ['packages/snowarch/src/cli/instance.ts', 'packages/snowarch/src/cli/import-legacy.ts', 'tools/snowarch/lib/steps/B06.mjs']) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).toContain('openStoreForWrite(');
    }
    // The shapes that were the defect, as they were written: an error read as "no store", and a missing file as the only case of a store that is not there.
    const add = readFileSync(join(ROOT, 'packages/snowarch/src/cli/instance.ts'), 'utf8');
    expect(add).not.toMatch(/const existing = loadStore\(storePath\);\s*const store: Store = 'store' in existing/);
    const imp = readFileSync(join(ROOT, 'packages/snowarch/src/cli/import-legacy.ts'), 'utf8');
    expect(imp).not.toMatch(/existsSync\(target\.path\) \? loadStore\(target\.path\) : null/);
  });

  it('the instrument counts: a call is found, and a mention in a comment or the declaration is not', () => {
    expect(callsOf('saveStore(path, next);\nconst x = saveStore(a, b, { lock: \'always\' });')).toBe(2);
    expect(callsOf('// saveStore(path, next) is what the wizard calls\n * saveStore(x)\nexport function saveStore(path: string) {}')).toBe(0);
    expect(callsOf('await store.saveStore(p, s)')).toBe(1);
  });
});
