import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS, FLAG_NAMES } from '../../src/utils/permissions.js';

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

function check(): { code: number; stderr: string } {
  try {
    execFileSync(process.execPath, [GEN, '--check'], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { code: err.status ?? -1, stderr: err.stderr ?? '' };
  }
}

describe('criterion 1 - the generated blocks are current, and drift is caught', () => {
  it('--check exits 0 on the committed README', () => {
    expect(check().code).toBe(0);
  });

  it('and exits 1 after a hand edit inside a block, naming the command', () => {
    const original = readFileSync(README, 'utf8');
    try {
      // A plausible edit: someone "corrects" a preset row. Inside the markers, so the generator
      // owns it — and the point is that the reader is told to run the generator rather than
      // hunting for which sentence to fix, because the answer is none of them.
      writeFileSync(README, original.replace('| `read-only` |', '| `read-only-x` |'));
      const r = check();
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('gen-readme-tables.mjs');
      expect(r.stderr).toContain('Do not edit text between');
    } finally {
      writeFileSync(README, original);
    }
  });

  it('and the README is restored', () => {
    // A test that edits a tracked file leaves every later assertion depending on its cleanup.
    // ARC-04-S12 learned this the expensive way, with a shared build artefact and parallel
    // workers; this one is a single file in a single suite, so restoring plus asserting is
    // enough — but the assertion is not optional.
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
