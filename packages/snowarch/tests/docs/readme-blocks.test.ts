// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS, FLAG_NAMES } from '../../src/utils/permissions.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';

/**
 * The README's generated blocks, and the negative that proves the check is a check.
 *
 * Criterion 6 asks that the presets table equal `permissions.ts`. It does by construction — the
 * generator imports the built module — so asserting only that would be asserting that an
 * assignment works. What is worth asserting is that a HAND EDIT inside a block is caught, which
 * is the failure mode the marker convention actually invites: someone improves a row, the
 * generator overwrites it next run, and nobody knows which was right.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const README = resolve(HERE, '../../README.md');
const GEN = resolve(ROOT, 'scripts/gen-readme-tables.mjs');

/**
 * ARC-09-C131 — the tracked README as it was before any case here ran. Another vitest worker reads this file
 * (B04-06 in `tests/cli/contract-cli.test.ts`), so a case that writes it, even to restore it, is a case another
 * file can read half-written.
 */
const BEFORE = { bytes: readFileSync(README), mtimeMs: statSync(README).mtimeMs };

function check(gen = GEN, cwd = ROOT): { code: number; stderr: string } {
  try {
    execFileSync(process.execPath, [gen, '--check'], { cwd, encoding: 'utf8' });
    return { code: 0, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { code: err.status ?? -1, stderr: err.stderr ?? '' };
  }
}

/**
 * ARC-09-C131 — every tracked file, copied into a root of its own: the working tree's content, not HEAD's, as
 * `tests/gen-readme-tables.test.mjs` copies it for the fresh clone. The generator finds its README from its own
 * path, so the copy's generator reads the copy's README, and the drift case never writes the tracked one.
 */
const copies: string[] = [];
afterAll(() => { for (const dir of copies) removeTempDir(dir); });

function copyTracked(): string {
  const dest = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-readme-blocks-')));
  copies.push(dest);
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n').filter(Boolean);
  for (const rel of files) {
    const from = join(ROOT, rel);
    // A gitlink (`vendor/ServiceNowDocs`) is listed like a file and is a directory; the generator reads none of it.
    let file = false;
    try { file = statSync(from).isFile(); } catch { /* deleted in the working tree: not in the copy either */ }
    if (!file) continue;
    mkdirSync(join(dest, dirname(rel)), { recursive: true });
    cpSync(from, join(dest, rel));
  }
  return dest;
}

describe('criterion 1 - the generated blocks are current, and drift is caught', () => {
  it('--check exits 0 on the committed README', () => {
    expect(check().code).toBe(0);
  });

  it('and exits 1 after a hand edit inside a block, naming the command, on a copy of the tracked files', () => {
    const copy = copyTracked();
    const readme = join(copy, 'packages', 'snowarch', 'README.md');
    const original = readFileSync(readme, 'utf8');
    // A plausible edit: someone "corrects" a preset row. Inside the markers, so the generator
    // owns it — and the point is that the reader is told to run the generator rather than
    // hunting for which sentence to fix, because the answer is none of them.
    const edited = original.replace('| `read-only` |', '| `read-only-x` |');
    expect(edited, 'the preset row this case edits is not in the README').not.toBe(original);
    writeFileSync(readme, edited);
    const r = check(join(copy, 'scripts', 'gen-readme-tables.mjs'), copy);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('gen-readme-tables.mjs');
    expect(r.stderr).toContain('Do not edit text between');
    // The mid-read: what a reader of the tracked README in another worker sees while the drift is in place.
    expect(readFileSync(README).equals(BEFORE.bytes), 'the tracked README changed while the drift was in place').toBe(true);
    expect(statSync(README).mtimeMs, 'the tracked README was written while the drift was in place').toBe(BEFORE.mtimeMs);
  }, 60_000);

  it('and the tracked README was never written: its bytes and its mtime are what they were before this file ran', () => {
    // A test that edits a tracked file leaves every later assertion depending on its cleanup, and a restore is a
    // second write. ARC-04-S12 learned this with a shared build artefact and parallel workers; ARC-09-C131 with
    // this file, whose restore did not stop B04-06 reading it truncated from another worker.
    expect(readFileSync(README).equals(BEFORE.bytes)).toBe(true);
    expect(statSync(README).mtimeMs).toBe(BEFORE.mtimeMs);
    expect(check().code).toBe(0);
  });
});

describe('criterion 6 - the presets block is the code, not a copy of it', () => {
  const block = /<!-- generated:presets -->([\s\S]*?)<!-- \/generated:presets -->/
    .exec(readFileSync(README, 'utf8'))?.[1] ?? '';

  it('there is a block to read', () => {
    expect(block.length).toBeGreaterThan(100);
  });

  it('every preset in permissions.ts has a row, and no row is invented', () => {
    const rows = block.split('\n').filter((l) => /^\| `[a-z-]+` \|/.test(l));
    expect(rows.map((l) => /^\| `([a-z-]+)` \|/.exec(l)![1]).sort())
      .toEqual(Object.keys(PRESETS).sort());
  });

  it('every cell matches the flag value the server enforces', () => {
    for (const [name, flags] of Object.entries(PRESETS)) {
      const row = block.split('\n').find((l) => l.startsWith(`| \`${name}\` |`))!;
      const cells = row.split('|').slice(2, -1).map((c) => c.trim());
      expect(cells, `${name} has the wrong number of columns`).toHaveLength(FLAG_NAMES.length);
      FLAG_NAMES.forEach((f, i) => {
        expect(cells[i], `${name}.${f}`).toBe(flags[f] === 'true' ? 'on' : 'off');
      });
    }
  });

  it('the column order is FLAG_NAMES order', () => {
    // Otherwise every cell could be individually right and the table still misread: a row of
    // on/off values means nothing without the header it belongs to.
    const header = block.split('\n').find((l) => l.startsWith('| Preset |'))!;
    const columns = header.split('|').slice(2, -1).map((c) => c.trim().replace(/`/g, ''));
    expect(columns).toEqual(FLAG_NAMES.map((f) => f.replace('_ENABLED', '')));
  });
});
