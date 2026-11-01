// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C259 — one megabyte. The product counted it two ways: the bootstrap's `[docs]` line, B00's disk check, B04's install
 * size and the release's install-metrics table divided by 2^20, while `./snowarch docs status`, docs-real and the install page
 * divided by 10^6, so the same working tree read 279 MB in the bootstrap and 293 MB on the page. `lib/size.mjs` is the one
 * definition, the decimal one (the architect's ruling of 2026-11-01), and tests/size-unit.test.mjs guards that no other
 * byte divisor appears.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GB, MB, gigabytes, megabytes } from '../lib/size.mjs';

test('ARC-09-C259 — a megabyte is 10^6 bytes and a gigabyte 10^9, and the tree the bootstrap called 279 MB is the page\'s 293', () => {
  assert.equal(MB, 1_000_000);
  assert.equal(GB, 1_000_000_000);
  // 292,552,704 bytes are 279 megabytes of 2^20 bytes, as the bootstrap printed them (written out: tests/size-unit.test.mjs lets no
  // binary megabyte be spelled under tools/), and 293 of 10^6, as `docs status` and the install page print them.
  assert.equal(megabytes(292_552_704), 293, 'the 279 MB of the bootstrap and the 293 MB of docs status are one tree');
  assert.equal(gigabytes(12_000_000_000), '12.0');
  assert.equal(gigabytes(1.5 * GB), '1.5');
  assert.equal(gigabytes(900_000_000), '0.9');
});

test('ARC-09-C259 — megabytes rounds as docs status and assert-docs always rounded: half up, at 500,000 bytes', () => {
  for (const [bytes, mb] of [[0, 0], [499_999, 0], [500_000, 1], [1_499_999, 1], [1_500_000, 2], [293_000_000, 293],
    [299_499_999, 299], [299_500_000, 300]]) {
    assert.equal(megabytes(bytes), mb, `${bytes} bytes`);
    // The two functions this one replaces, as they were written: docs/status.mjs and scripts/ci/assert-docs.mjs. No output changes. (This
    // file and size.mjs are the two places tests/size-unit.test.mjs lets a decimal divisor be written: the unit and the test of the unit.)
    assert.equal(megabytes(bytes), Math.round(bytes / 1_000_000), `${bytes}: not what docs status computed`);
    assert.equal(megabytes(bytes), Math.round(bytes / 1e6), `${bytes}: not what assert-docs computed`);
  }
});
