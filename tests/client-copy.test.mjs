// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C232 — the client copy of a deliverable: the working file without its end marker and everything after it,
// written under clients/<name>/for-client/ at the same path, then scanned for internal content (governance §4.5).
//
// The lexicon is phrases, never the bare words a client's own text uses: each control below is pinned both ways, as
// the architect ruled — the clean ones say nothing, the internal ones are each a hit on their line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXEMPT_PERSONAS, MARKERS, PERSONAS, clientCopy, copyPathFor, cutAtMarker, scanInternal,
} from '../tools/snowarch/lib/client-copy.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const terms = (text) => scanInternal(text).map((h) => h.term);

test('ARC-09-C232 — a markdown file is cut at its marker, and what is above it is kept as written', () => {
  const text = `# HLD\n\nThe design.\n\n## Decisions we need from you\n\n1. Which group owns the queue?\n\n${MARKERS.markdown}\n\n`
    + '### Open decisions\n\nOQ-DS-1. …\n';
  assert.equal(cutAtMarker(text, 'hld.md').text,
    '# HLD\n\nThe design.\n\n## Decisions we need from you\n\n1. Which group owns the queue?\n');
});

test('ARC-09-C232 — a .feature file is cut at its comment marker, indented or not', () => {
  const text = `Feature: Triage\n  Scenario: Assign\n    Given an incident\n\n  ${MARKERS.feature}\n  # OPEN QUESTIONS\n`;
  assert.equal(cutAtMarker(text, 'triage.feature').text, 'Feature: Triage\n  Scenario: Assign\n    Given an incident\n');
});

test('ARC-09-C232 — a file with no marker, or with two, is refused, and says why', () => {
  assert.match(cutAtMarker('# HLD\n\nThe design.\n', 'hld.md').refused, /no end marker/);
  assert.match(cutAtMarker(`a\n${MARKERS.markdown}\nb\n${MARKERS.markdown}\n`, 'hld.md').refused, /2 end markers/);
  // The other format's marker is not this file's: a .feature file's internal section starts at its comment line.
  assert.match(cutAtMarker(`Feature: x\n${MARKERS.markdown}\n`, 'x.feature').refused, /no end marker/);
});

test('ARC-09-C232 — the copy goes under the engagement\'s for-client/, at the same path', () => {
  assert.equal(copyPathFor('clients/acme/incident/triage.feature'), 'clients/acme/for-client/incident/triage.feature');
  assert.equal(copyPathFor('clients/_unfiled/hld.md'), 'clients/_unfiled/for-client/hld.md');
  for (const outside of ['docs/hld.md', 'clients/hld.md', 'clients/acme/for-client/hld.md', '../clients/acme/hld.md']) {
    assert.equal(copyPathFor(outside), null, outside);
  }
});

test('ARC-09-C232 — the client\'s own words are not internal content', () => {
  for (const clean of ['Requests pass through the API gateway.', 'The payment gateway retries twice.',
    'We consult the service owner first.', 'Dispatch a field technician to the site.', 'Phase 1 of the rollout covers HR.',
    'The decision is recorded in ADR-001.', 'The RAID log holds the risk.', 'The developer team owns the release.',
    'There are three open questions for the workshop.']) {
    assert.deepEqual(terms(clean), [], clean);
  }
});

test('ARC-09-C232 — internal content is a hit, each on its line', () => {
  const lines = ['Fired the ITSM gateway.', 'Raise a Security & GRC consult.', 'At Phase 1 Step 5 the halt.', 'See OQ-ST-2.',
    'This is Verdict C.', 'ARC-09-C231 built it.', 'PN-25 records it.', 'Per §1.1 it halts.', 'The Constraint Envelope says.',
    'A consult flag is raised.', 'The sub-agent returns.', 'The Chief Architect routes.', 'The Domain Expert reviews.',
    'OPEN QUESTION: who owns it?', 'The Story Writer drafted it.', 'Tested on a PDI.'];
  const hits = scanInternal(lines.join('\n'));
  assert.deepEqual(hits.map((h) => h.line), lines.map((_, i) => i + 1), JSON.stringify(hits));
  for (const h of hits) assert.equal(h.text, lines[h.line - 1]);
});

test('ARC-09-C232 — the personas are the roster\'s, less the two whose names are a client\'s ordinary words', () => {
  const taxonomy = readFileSync(join(root, 'governance/taxonomy.md'), 'utf8');
  const roster = [...taxonomy.matchAll(/^\| *\d+ *\| ([^|]+?) *\| /gm)].map((m) => m[1]);
  assert.equal(roster.length, 28, `the roster table has ${roster.length} rows`);
  assert.deepEqual([...roster].sort(), [...PERSONAS, ...Object.keys(EXEMPT_PERSONAS)].sort());
  assert.deepEqual(Object.keys(EXEMPT_PERSONAS).sort(), ['Developer', 'Operational Documentation']);
});

test('ARC-09-C232 — the copy is written cut at the marker, and its hits come back with their lines', (t) => {
  const tmp = tempDir('snowarch-c232-', t);
  const put = (rel, text) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); };
  put('clients/acme/hld.md', `# HLD\n\nThe ITSM gateway approved it.\n\n${MARKERS.markdown}\n\nOQ-DS-1. …\n`);
  const r = clientCopy({ root: tmp, file: 'clients/acme/hld.md' });
  assert.equal(r.dest, 'clients/acme/for-client/hld.md');
  assert.equal(readFileSync(join(tmp, r.dest), 'utf8'), '# HLD\n\nThe ITSM gateway approved it.\n');
  assert.deepEqual(r.hits.map((h) => [h.line, h.term]), [[3, 'a domain\'s gateway']]);

  put('clients/acme/clean.md', `# HLD\n\nThe API gateway carries it.\n\n${MARKERS.markdown}\n\nOQ-DS-1. …\n`);
  assert.deepEqual(clientCopy({ root: tmp, file: 'clients/acme/clean.md' }).hits, []);

  put('clients/acme/nomarker.md', '# HLD\n');
  const refused = clientCopy({ root: tmp, file: 'clients/acme/nomarker.md' });
  assert.match(refused.refused, /no end marker/);
  assert.equal(existsSync(join(tmp, 'clients/acme/for-client/nomarker.md')), false, 'a refused file left a copy');
});
