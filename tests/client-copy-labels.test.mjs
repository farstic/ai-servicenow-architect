// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C232 — environment names in a client copy, as the architect ruled: a PDI, or a personal developer instance,
// is always internal; another engagement's instance label is a hit only when this engagement's state file names its
// own labels on an `Instances:` line, so the client's own instance names are never flagged and stripped by mistake.
// With no such line, only a PDI is checked. A label under 4 characters, or a common word, is never a name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  MARKERS, clientCopy, engagementInstances, otherInstanceLabels, scanInternal,
} from '../tools/snowarch/lib/client-copy.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

function world(t, { state = null, labels = ['acme-dev', 'globex-prod', 'dev'] } = {}) {
  const root = tempDir('snowarch-c232l-', t);
  const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  if (state !== null) put('clients/acme/acme-engagement-state.md', state);
  put('.local/instances.json', `${JSON.stringify({ version: 1, instances: Object.fromEntries(labels.map((l) => [l,
    { url: `https://${l}.example.invalid` }])) })}\n`);
  put('clients/acme/hld.md', '# HLD\n\nBuilt on acme-dev.\n\nCompared with globex-prod.\n\nThe dev team signs off.\n\n'
    + `${MARKERS.markdown}\n`);
  return root;
}

test('ARC-09-C232 — a PDI, or a personal developer instance, is always internal', () => {
  assert.deepEqual(scanInternal('Tested on a PDI.\nTried on a personal developer instance first.')
    .map((h) => [h.line, h.term]), [[1, 'PDI'], [2, 'PDI']]);
});

test('ARC-09-C232 — the engagement\'s own labels are read from its state file\'s Instances: line', (t) => {
  assert.deepEqual(engagementInstances(world(t, { state: '# Acme\n\nInstances: acme-dev, acme-prod\n' }), 'acme'),
    ['acme-dev', 'acme-prod']);
  assert.deepEqual(engagementInstances(world(t, { state: '# Acme\n\n- **Instances:** `acme-dev`\n' }), 'acme'), ['acme-dev']);
  assert.equal(engagementInstances(world(t, { state: '# Acme\n\nRelease family: zurich\n' }), 'acme'), null);
  assert.equal(engagementInstances(world(t), 'acme'), null, 'no state file');
});

test('ARC-09-C232 — another engagement\'s labels are those configured and not named, less the short and the common', () => {
  const configured = ['acme-dev', 'globex-prod', 'dev', 'uat', 'abc', 'Initech-UAT'];
  assert.deepEqual(otherInstanceLabels(configured, ['acme-dev']), ['globex-prod', 'Initech-UAT']);
  assert.deepEqual(otherInstanceLabels(configured, null), [], 'with no Instances: line nothing but a PDI is checked');
});

test('ARC-09-C232 — the copy names another engagement\'s instance as a hit, and never this engagement\'s own', (t) => {
  const named = clientCopy({ root: world(t, { state: '# Acme\n\nInstances: acme-dev\n' }), file: 'clients/acme/hld.md' });
  assert.deepEqual(named.hits.map((h) => [h.line, h.term, h.match]), [[5, 'another engagement\'s instance', 'globex-prod']]);
  const unnamed = clientCopy({ root: world(t, { state: '# Acme\n' }), file: 'clients/acme/hld.md' });
  assert.deepEqual(unnamed.hits, [], 'with no Instances: line a configured label is not checked');
});
