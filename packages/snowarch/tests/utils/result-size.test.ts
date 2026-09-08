import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  DEFAULT_MAX_RESULT_CHARS, META_CAP_FIELD, capResult, resolveCap,
} from '../../src/utils/result-size.js';

/**
 * Isolated from the server: the cap is a pure function of (result, number), so it is asserted
 * as one. The stdio probe in tests/server/ asserts that CallTool actually applies it — these
 * two claims are separate, and a suite that only drove the server would leave the arithmetic
 * below (the envelope counting against its own budget) untested at the boundaries.
 */
const records = (n: number, pad = 'x'.repeat(200)) =>
  ({ count: n, records: Array.from({ length: n }, (_, i) => ({ sys_id: `r${i}`, pad })) });

afterEach(() => { vi.unstubAllEnvs(); });

describe('resolveCap', () => {
  it('the default when nothing says otherwise', () => {
    expect(resolveCap(undefined, {})).toBe(DEFAULT_MAX_RESULT_CHARS);
  });

  it('_meta wins when it is a positive number', () => {
    expect(resolveCap({ [META_CAP_FIELD]: 25_000 }, { SNOW_MAX_RESULT_CHARS: '9000' })).toBe(25_000);
  });

  it.each([0, -1, Number.NaN, Infinity, '25000', null, {}])(
    '_meta %p is ignored and the env is used instead', (bad) => {
      expect(resolveCap({ [META_CAP_FIELD]: bad }, { SNOW_MAX_RESULT_CHARS: '9000' })).toBe(9000);
    });

  it('a fractional _meta is floored rather than used as a fraction', () => {
    expect(resolveCap({ [META_CAP_FIELD]: 1234.9 }, {})).toBe(1234);
  });

  it('the env is used when _meta is absent', () => {
    expect(resolveCap(undefined, { SNOW_MAX_RESULT_CHARS: '512' })).toBe(512);
  });

  it('a malformed env falls back to the default AND says so on stderr', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveCap(undefined, { SNOW_MAX_RESULT_CHARS: '100k' })).toBe(DEFAULT_MAX_RESULT_CHARS);
    // Silent fallback is the failure mode: it looks identical to the variable working.
    expect(warn.mock.calls[0][0]).toContain('SNOW_MAX_RESULT_CHARS="100k"');
    warn.mockRestore();
  });

  it('reads process.env by default, not a snapshot taken at import', () => {
    vi.stubEnv('SNOW_MAX_RESULT_CHARS', '777');
    expect(resolveCap()).toBe(777);
  });
});

describe('a result under the cap is untouched', () => {
  it('no truncated key is added — absent, not false', () => {
    const r = capResult(records(2), 100_000);
    expect(r.truncated).toBe(false);
    expect(r.strategy).toBeNull();
    const parsed = JSON.parse(r.text);
    expect(Object.keys(parsed)).toEqual(['count', 'records']);
    expect('truncated' in parsed).toBe(false);
    expect(parsed.records).toHaveLength(2);
  });

  it('a plain string result passes through as itself, not as JSON', () => {
    expect(capResult('done', 100).text).toBe('done');
  });

  it('exactly at the cap is not truncated — the boundary is <=, not <', () => {
    const text = 'y'.repeat(50);
    expect(capResult(text, 50)).toEqual({ text, truncated: false, strategy: null });
  });
});

describe('a records-shaped result drops whole records from the end', () => {
  const CAP = 4000;
  const capped = capResult(records(500), CAP);
  const parsed = JSON.parse(capped.text);

  it('the strategy is records, and the text is still valid JSON', () => {
    expect(capped.strategy).toBe('records');
    expect(capped.truncated).toBe(true);
    expect(parsed.truncated).toBe(true);
  });

  it('it fits — including the envelope it just added', () => {
    // The envelope counts against its own budget. Sizing the cut from the oversized text and
    // then adding four fields is how this goes over the cap while looking correct.
    expect(capped.text.length).toBeLessThanOrEqual(CAP);
  });

  it('returned and total_fetched describe what happened', () => {
    expect(parsed.returned).toBe(parsed.records.length);
    expect(parsed.total_fetched).toBe(500);
    expect(parsed.returned).toBeGreaterThan(0);
    expect(parsed.returned).toBeLessThan(500);
  });

  it('the records kept are the FIRST ones, in order', () => {
    expect(parsed.records[0].sys_id).toBe('r0');
    expect(parsed.records.map((r: { sys_id: string }) => r.sys_id))
      .toEqual(Array.from({ length: parsed.returned }, (_, i) => `r${i}`));
  });

  it('it keeps as many as fit — one more record would not fit', () => {
    // Without this, a cut that kept a SINGLE record would satisfy every assertion above. The
    // envelope is rebuilt here rather than imported so the test states the shape it expects
    // instead of agreeing with the implementation by construction.
    const envelope = (n: number) => JSON.stringify({
      ...records(500), records: records(500).records.slice(0, n),
      truncated: true, returned: n, total_fetched: 500,
      hint: 'Narrow the query or lower `limit`; the dropped records were taken from the end.',
    }, null, 2);
    expect(envelope(parsed.returned).length).toBeLessThanOrEqual(CAP);
    expect(envelope(parsed.returned + 1).length).toBeGreaterThan(CAP);
  });

  it('the hint tells the caller what to do about it', () => {
    expect(parsed.hint).toContain('limit');
  });

  it('sibling fields of records survive the cut', () => {
    expect(parsed.count).toBe(500);
  });
});

describe("criterion 5 - the story's own numbers", () => {
  // 100 records of ~3,000 characters each, capped at 50,000. Stated as the story states it so
  // the criterion is satisfied literally rather than by a similar-looking case.
  const hundred = { count: 100, records: Array.from({ length: 100 }, (_, i) => ({
    sys_id: `r${i}`, description: 'd'.repeat(3000),
  })) };

  it('≤ 50,000 chars, truncated: true, returned < 100', () => {
    const r = capResult(hundred, 50_000);
    const parsed = JSON.parse(r.text);
    expect(r.text.length).toBeLessThanOrEqual(50_000);
    expect(parsed.truncated).toBe(true);
    expect(parsed.returned).toBeLessThan(100);
    expect(parsed.returned).toBeGreaterThan(0);
    expect(parsed.total_fetched).toBe(100);
  });

  it('and the uncapped serialisation really was over the cap', () => {
    // Otherwise the test above would pass against a fixture that never needed cutting.
    expect(JSON.stringify(hundred, null, 2).length).toBeGreaterThan(50_000);
  });
});

describe('anything else is cut as text', () => {
  it('a long string gets the marker and lands exactly on the cap', () => {
    const r = capResult('z'.repeat(5000), 200);
    expect(r.strategy).toBe('chars');
    expect(r.text.length).toBe(200);
    expect(r.text.endsWith('… [truncated at 200 chars]')).toBe(true);
  });

  it('an object with no records array is cut as text, not silently returned whole', () => {
    const r = capResult({ blob: 'q'.repeat(5000) }, 300);
    expect(r.strategy).toBe('chars');
    expect(r.text.length).toBeLessThanOrEqual(300);
  });

  it('an ARRAY of records is not records-shaped — the key is what matters', () => {
    // A bare array has no `records` key to rebuild around, and inventing one would change the
    // result's type on the way out.
    expect(capResult(records(500).records, 2000).strategy).toBe('chars');
  });

  it('records: not-an-array is not records-shaped either', () => {
    expect(capResult({ records: 'lots'.repeat(2000) }, 500).strategy).toBe('chars');
  });

  it('a cap too small even for an empty envelope still never exceeds the cap', () => {
    const r = capResult(records(500), 40);
    expect(r.text.length).toBeLessThanOrEqual(40);
    expect(r.truncated).toBe(true);
  });

  it('a cap smaller than the marker itself is still honoured', () => {
    expect(capResult('z'.repeat(500), 5).text.length).toBe(5);
  });
});
