import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-09-C93 — the live-run procedure is a claim, and a claim about a count is pinned.
 *
 * `tests/live/README.md` tells whoever runs it which name to send and what to expect back: a name of
 * 41 characters, `sent_length: 41`, `stored_length: 40`. A first draft of that file gave a name of 39
 * characters. Nothing is cut at 39, step 1 would have come back with no warning, and the sitting would
 * have recorded the premise of the whole design as FAILED because of a miscounted string. This test
 * reads the procedure and counts.
 */
const README = resolve(dirname(fileURLToPath(import.meta.url)), '../live/README.md');
const text = readFileSync(README, 'utf8');
const section = text.slice(text.indexOf('## ARC-09-C92 and C93'));
const COLUMN = 40;

const names = [...new Set([...section.matchAll(/"(c93-live-probe-[0-9A-Za-z-]*)"/g)].map((m) => m[1]!))];

describe('tests/live/README.md - the ARC-09-C92 and C93 procedure', () => {
  it('has the section, and names at least the long probe and the short one', () => {
    expect(section.startsWith('## ARC-09-C92 and C93')).toBe(true);
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it('exactly one probe name is longer than the column, and it is the length the pass condition states', () => {
    const longer = names.filter((n) => n.length > COLUMN);
    expect(longer).toHaveLength(1);
    expect(longer[0]).toHaveLength(COLUMN + 1);
    expect(section).toContain(`sent_length: ${longer[0]!.length}`);
    expect(section).toContain(`stored_length: ${COLUMN}`);
    expect(section).toContain(`column_limit: ${COLUMN}`);
    expect(section).toContain(`the name is ${longer[0]!.length} characters`);
  });

  it('every other probe name fits, so the negative control cannot be cut by accident', () => {
    for (const n of names.filter((x) => x.length <= COLUMN)) expect(n.length, n).toBeLessThanOrEqual(COLUMN);
    expect(names.some((n) => n.length <= COLUMN)).toBe(true);
  });

  it('the update path and the false-alarm step are in the procedure', () => {
    expect(section).toMatch(/snow_scr_business_rule_modify/);
    expect(section).toMatch(/operation: "update"/);
    expect(section).toMatch(/number=INC0000000\^"/);
  });
});
