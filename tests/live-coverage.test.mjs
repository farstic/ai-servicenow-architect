// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C167a — the live-coverage ledger: the committed page is the generator's, every manifest tool has an
 * entry and a row, and `--check` fails on each way the ledger can go wrong (proven on a copy, so the check is
 * seen to fail and not only to pass).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATORS } from '../scripts/lib/generators.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { isRecord, LEDGER, namedBy, problems, render, STATUSES, TARGET, tally, totalsLine } from '../scripts/lib/live-coverage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'packages/snowarch/dist/tools-manifest.json';
/** A tool name that is not in the contract, built at run time: a literal one would fail lint L01. */
const T = (rest) => ['snow', rest].join('_');
const read = (p, at = root) => readFileSync(join(at, p), 'utf8');
const manifestTools = (at = root) => { const m = JSON.parse(read(MANIFEST, at)); return (Array.isArray(m) ? m : m.tools).map((t) => t.name); };
const realRecords = () => Object.fromEntries([...readdirSync(join(root, 'docs/validation')).map((f) => `docs/validation/${f}`),
  'docs/PLATFORM-NOTES.md'].filter(isRecord).map((p) => [p, read(p)]));

test('C167a — the committed page is what the generator writes, and every manifest tool has an entry and a row', () => {
  const tools = manifestTools();
  const ledger = JSON.parse(read(LEDGER));
  const records = realRecords();
  assert.deepEqual(problems({ tools, ledger, records }), []);
  assert.equal(read(TARGET), render({ tools, ledger, records }));
  const page = read(TARGET);
  for (const t of tools) {
    assert.ok(t in ledger.tools, `${t} has no entry`);
    assert.match(page, new RegExp(`^\\| \`${t}\` \\| ${ledger.tools[t].status} \\|`, 'm'), `${t} has no row`);
  }
  assert.equal(Object.keys(ledger.tools).length, tools.length);
  const r = spawnSync(process.execPath, ['scripts/live-coverage.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  console.log(`    ${totalsLine(tally({ tools, ledger, records }))}`);
});

test('C167a — the seeds: C165\'s two build tools wait for rc.1, and every named-only tool names its record', () => {
  const ledger = JSON.parse(read(LEDGER));
  for (const t of ['snow_ai_ai_agent_add', 'snow_ai_agentic_workflow_add']) {
    assert.equal(ledger.tools[t].status, 'unverified');
    assert.match(ledger.tools[t].note, /pending the v2\.2\.0-rc\.1 sitting/);
  }
  const named = namedBy(manifestTools(), realRecords());
  for (const [t, e] of Object.entries(ledger.tools)) {
    if (e.status === 'named-only') assert.ok(named[t].includes(e.record), `${t} does not appear in ${e.record}`);
  }
});

test('C167a — gen:check runs it: the generator list carries the ledger and its page', () => {
  const gen = GENERATORS.find((g) => g.id === 'gen-live-coverage');
  assert.ok(gen, 'gen-live-coverage is not in scripts/lib/generators.mjs');
  assert.equal(gen.script, 'scripts/live-coverage.mjs');
  assert.deepEqual(gen.targets, [TARGET]);
  // Before gen-readme, which must stay last (it composes from what the others wrote).
  assert.equal(GENERATORS.at(-1).id, 'gen-readme');
});

test('C167a — each way the ledger goes wrong is a problem, by name', () => {
  const tools = [T('core_a'), T('core_b'), T('inc_c')];
  const records = { 'docs/validation/2026-01-01-x.md': `called ${T('core_a')} once`, 'docs/PLATFORM-NOTES.md': 'nothing' };
  const ok = { tools: {
    [T('core_a')]: { status: 'verified-live', record: 'docs/validation/2026-01-01-x.md', date: '2026-01-01', family: 'brazil' },
    [T('core_b')]: { status: 'unverified', record: null, date: null, family: null },
    [T('inc_c')]: { status: 'unverified', record: null, date: null, family: null },
  } };
  assert.deepEqual(problems({ tools, ledger: ok, records }), []);
  const bad = (patch) => problems({ tools: patch.tools ?? tools, ledger: { tools: { ...ok.tools, ...patch.entries } }, records });
  assert.match(bad({ tools: [...tools, T('inc_new')] }).join('\n'), new RegExp(`${T('inc_new')} is in the manifest and has no entry`));
  assert.match(bad({ entries: { [T('gone_x')]: { status: 'unverified' } } }).join('\n'), new RegExp(`${T('gone_x')} has an entry .* not in the manifest`));
  assert.match(bad({ entries: { [T('core_b')]: { status: 'probably' } } }).join('\n'), /status "probably" is not one of/);
  assert.match(bad({ entries: { [T('core_b')]: { status: 'named-only', record: 'docs/validation/2026-01-01-x.md' } } }).join('\n'),
    new RegExp(`${T('core_b')}: record docs/validation/2026-01-01-x\\.md does not name it`));
  assert.match(bad({ entries: { [T('core_a')]: { status: 'verified-live', record: 'docs/validation/2026-01-01-x.md' } } }).join('\n'),
    /needs the sitting's date[\s\S]*needs the instance's release family/);
  assert.match(bad({ entries: { [T('core_a')]: { status: 'refused', record: 'docs/validation/nope.md', date: '2026-01-01', family: 'b' } } }).join('\n'),
    /record docs\/validation\/nope\.md is not a validation record/);
  assert.match(bad({ entries: { [T('core_b')]: { status: 'unverified', note: 'a | b' } } }).join('\n'), /note contains "\|"/);
  assert.deepEqual(STATUSES, ['verified-live', 'refused', 'named-only', 'unverified']);
});

test('C167a — the templates and the ledger\'s own page are not records', () => {
  assert.equal(isRecord('docs/validation/2.0.11-rc.1-live-sitting.md'), true);
  assert.equal(isRecord('docs/PLATFORM-NOTES.md'), true);
  assert.equal(isRecord('docs/validation/TEMPLATE.md'), false);
  assert.equal(isRecord('docs/validation/TEMPLATE-e2e-live.md'), false);
  assert.equal(isRecord(TARGET), false);
  assert.equal(isRecord(LEDGER), false);
});

test('C167a — --check fails on a copy whose page is stale, and on a copy whose manifest gained a tool', (t) => {
  const dir = tempDir('c167a-', t);
  for (const p of ['scripts/live-coverage.mjs', 'scripts/lib/live-coverage.mjs', MANIFEST, 'docs/PLATFORM-NOTES.md']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(root, p), join(dir, p));
  }
  cpSync(join(root, 'docs/validation'), join(dir, 'docs/validation'), { recursive: true });
  const check = () => spawnSync(process.execPath, ['scripts/live-coverage.mjs', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(check().status, 0, 'the copy starts current');

  writeFileSync(join(dir, TARGET), `${read(TARGET)}\nan edit by hand\n`);
  const stale = check();
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /is stale — run npm run gen/);
  execFileSync(process.execPath, ['scripts/live-coverage.mjs'], { cwd: dir });
  assert.equal(check().status, 0, 'npm run gen puts it right');

  const m = JSON.parse(read(MANIFEST, dir));
  (Array.isArray(m) ? m : m.tools).push({ name: T('inc_brand_new_add'), description: 'x', inputSchema: { type: 'object' } });
  writeFileSync(join(dir, MANIFEST), JSON.stringify(m));
  const unlisted = check();
  assert.equal(unlisted.status, 1);
  assert.match(unlisted.stdout, new RegExp(`${T('inc_brand_new_add')} is in the manifest and has no entry in docs/validation/live-coverage\\.json`));
});
