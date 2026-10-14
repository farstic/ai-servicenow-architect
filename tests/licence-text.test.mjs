// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
//
// ARC-11-C5 — `LICENSE` is the Business Source License 1.1 (ADR-0011).
//
// THE TERMS are the licence's own. From the second "Business Source License 1.1" heading to the
// fourth covenant, not one byte may change: covenant 4 binds the Licensor "not to modify this License
// in any other way". The bytes were taken from MariaDB's own plain-text copy (MaxScale,
// `licenses/LICENSE2408.TXT`) and match SPDX's (`license-list-data`, `text/BUSL-1.1.txt`) word for
// word; the hash below is of those bytes.
//
// THE PARAMETERS are the Licensor's to set. Licensor, Licensed Work, Additional Use Grant and Change
// Date are the owner's; the Change License is the Apache License, Version 2.0. Until the owner sets
// them they are placeholders, and the last case below fails: that is what keeps an unfilled licence
// from merging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE = readFileSync(join(ROOT, 'LICENSE'), 'utf8');

const TERMS_HEAD = '-----------------------------------------------------------------------------\n\nBusiness Source License 1.1\n\nTerms\n';
const TERMS_TAIL = '4. Not to modify this License in any other way.\n';
const TERMS_SHA256 = '8b5ba7713c0d226337aa775edff3809689a937a2d64a621d74c827e98f6f1918';
const PARAMETERS = ['Licensor', 'Licensed Work', 'Additional Use Grant', 'Change Date', 'Change License'];

/** The parameters still waiting for the owner. */
const placeholdersIn = (text) => [...text.matchAll(/\[TO BE FILLED BY THE OWNER: ([^\]]+)\]/g)].map((m) => m[1]);

/** The terms block, from the separator above the second heading to the end of the fourth covenant. */
function termsOf(text) {
  const start = text.indexOf(TERMS_HEAD);
  const end = text.indexOf(TERMS_TAIL);
  if (start < 0 || end < start) return null;
  return text.slice(start, end + TERMS_TAIL.length);
}

test('ARC-11-C5 — LICENSE carries the Business Source License 1.1 terms, byte for byte', () => {
  const terms = termsOf(LICENSE);
  assert.ok(terms, 'LICENSE has no BSL 1.1 terms block');
  assert.equal(createHash('sha256').update(terms).digest('hex'), TERMS_SHA256,
    'the BSL 1.1 terms have changed; covenant 4 forbids it');
  assert.ok(LICENSE.endsWith(terms), 'something follows the fourth covenant');
});

test('ARC-11-C5 — the five parameters, in the licence\'s order, and the Change License is Apache-2.0', () => {
  const head = LICENSE.slice(0, LICENSE.indexOf(TERMS_HEAD));
  const at = PARAMETERS.map((p) => head.search(new RegExp(`^${p}: `, 'm')));
  assert.ok(at.every((i) => i >= 0), `a parameter is missing: ${PARAMETERS.filter((_, i) => at[i] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'the parameters are out of order');
  assert.match(head, /^Change License: +Apache License, Version 2\.0$/m);
});

test('ARC-11-C5 — the check sees a changed term, and a parameter left unset', () => {
  const changed = LICENSE.replace('make non-production use', 'make any use');
  assert.notEqual(changed, LICENSE, 'the control planted nothing');
  assert.notEqual(createHash('sha256').update(termsOf(changed) ?? '').digest('hex'), TERMS_SHA256);
  assert.deepEqual(placeholdersIn('Licensor:             [TO BE FILLED BY THE OWNER: Licensor]\n'), ['Licensor']);
  assert.deepEqual(placeholdersIn('Licensor:             Example Ltd\n'), []);
});

test('ARC-11-C5 — every parameter is set: no placeholder is left for the owner to fill', () => {
  const left = placeholdersIn(LICENSE);
  assert.deepEqual(left, [], `LICENSE still waits for the owner: ${left.join(', ')}`);
});
