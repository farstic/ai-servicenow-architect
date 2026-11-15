// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { PIN_FOLLOWERS, followPin } from '../scripts/lib/pin-followers.mjs';
import { PIN_FOLLOWERS as ORACLE, SAMPLE_DOCS, STATUS_FIXTURES, writeFollowers } from './helpers/docs-fixture.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/**
 * ARC-09-C280 — the files that quote the corpus pin follow it when the bump moves it.
 *
 * Five files quote the pin without being generated from it by a recipe: the panel sample's `Docs:` line in three
 * documents, and the pin and head in two doctor status fixtures. The bump staged none of them, so the bot's pull
 * request for the 96d3212 bump (#573) went red on each and a person moved them by hand. Here, the module that moves
 * them, on a tree of its own: no upstream, no corpus.
 */
const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);

const tree = (t) => { const root = tempDir('snowarch-c280-followers-', t); return root; };
const at = (root, p) => join(root, p);
const text = (root, p) => readFileSync(at(root, p), 'utf8');
const states = (r) => Object.values(r);

test('ARC-09-C280 — the module names the five files, and no others', () => {
  assert.deepEqual([...PIN_FOLLOWERS].sort(), [...ORACLE].sort());
});

test('ARC-09-C280 — a bump moves the pin in each of them, and only the pin', (t) => {
  const root = tree(t);
  writeFollowers(root, OLD);
  for (const p of ORACLE) assert.ok(text(root, p).includes(OLD.slice(0, 12)), `${p}: the fixture does not carry the old pin`);

  const r = followPin({ root, from: OLD, to: NEW });

  assert.deepEqual(r, Object.fromEntries(ORACLE.map((p) => [p, 'written'])));
  for (const p of SAMPLE_DOCS) {
    assert.ok(text(root, p).includes(`Docs: vendor/ServiceNowDocs @ ${NEW.slice(0, 12)} (australia) · full`), `${p}: the Docs line did not move`);
    assert.ok(!text(root, p).includes(OLD.slice(0, 12)), `${p}: still names the old pin`);
    assert.match(text(root, p), /\nRoster: 29 skills \/ 9 agents\n/, `${p}: another line changed`);
  }
  for (const p of STATUS_FIXTURES) {
    const docs = JSON.parse(text(root, p)).docs;
    assert.deepEqual([docs.pin, docs.head, docs.family], [NEW, NEW, 'australia'], `${p}: the fixture did not move, or more than the pin did`);
  }
});

test('ARC-09-C280 — a pin that did not move changes nothing, and a file already at the new pin is current', (t) => {
  const root = tree(t);
  writeFollowers(root, OLD);
  const before = Object.fromEntries(ORACLE.map((p) => [p, text(root, p)]));
  const same = followPin({ root, from: OLD, to: OLD });
  assert.deepEqual(states(same), ORACLE.map(() => 'current'));
  for (const p of ORACLE) assert.equal(text(root, p), before[p], `${p} changed though the pin did not`);

  const done = tree(t);
  writeFollowers(done, NEW);
  assert.deepEqual(states(followPin({ root: done, from: OLD, to: NEW })), ORACLE.map(() => 'current'));
});

test('ARC-09-C280 — a file that is not there is absent, and a file that quotes neither pin is lost and left alone', (t) => {
  const root = tree(t);
  writeFollowers(root, OLD, { except: [STATUS_FIXTURES[1]] });
  writeFileSync(at(root, SAMPLE_DOCS[2]), '# fixture\n\nthe sample was reworded and names no pin\n');
  const before = text(root, SAMPLE_DOCS[2]);
  assert.ok(!existsSync(at(root, STATUS_FIXTURES[1])));

  const r = followPin({ root, from: OLD, to: NEW });

  assert.equal(r[STATUS_FIXTURES[1]], 'absent');
  assert.equal(r[SAMPLE_DOCS[2]], 'lost');
  assert.equal(text(root, SAMPLE_DOCS[2]), before, 'a file with no pin to follow was rewritten');
  assert.equal(r[SAMPLE_DOCS[0]], 'written');
});

test('ARC-09-C280 — line endings and the rest of a sample line survive the move', (t) => {
  const root = tree(t);
  mkdirSync(dirname(at(root, SAMPLE_DOCS[0])), { recursive: true });
  const crlf = `# fixture\r\n   Docs: vendor/ServiceNowDocs @ ${OLD.slice(0, 12)} (australia) · full\r\nRoster: 1\r\n`;
  writeFileSync(at(root, SAMPLE_DOCS[0]), crlf);

  followPin({ root, from: OLD, to: NEW });

  assert.equal(text(root, SAMPLE_DOCS[0]), crlf.replace(OLD.slice(0, 12), NEW.slice(0, 12)));
});
