// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-09-C228 — the `task_sla` stage values the roster writes are values the platform stores. The corpus prints the
 * stages' labels, not their values; PN-25 records the six a maintainer's PDI holds. The ITSM gateway had it inverted:
 * it gave `complete` as the baseline's value and warned against `completed`, the value a finished SLA stores.
 *
 * On a roster line that names `task_sla`, a stage value in code form (`stage='x'`, `task_sla.stage='x'`, `stage!=x`)
 * is one PN-25 lists, with one exception: the value a "Do not query" line forbids, which must be one no row holds,
 * said beside a stored value that the line cites PN-25 for. Lines that do not name `task_sla` are not read: another
 * table's stage, a requested item's for one, has its own values.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** PN-25's stored stages, from its Evidence line, where each label is followed by its backticked value. */
function storedStages(notes) {
  const at = notes.indexOf('\n## PN-25 ');
  assert.ok(at >= 0, 'docs/PLATFORM-NOTES.md has no PN-25');
  const note = notes.slice(at, notes.indexOf('\n## ', at + 1));
  const from = note.indexOf('**Evidence:**');
  const evidence = note.slice(from, note.indexOf('**Engine consequence:**', from)).replace(/\n/g, ' ');
  return new Set([...evidence.matchAll(/\b[A-Z][a-z]+(?: [a-z]+)? `([a-z_]+)`/g)].map((m) => m[1]));
}

/** The stage values a line writes in code form. */
const stageValues = (line) => [...line.matchAll(/`(?:task_sla\.)?stage\s*!?=\s*'?([a-z_]+)'?`/g)].map((m) => m[1]);

/** What is wrong with one roster line, or [] when it holds. */
function problems(line, stored) {
  const values = stageValues(line);
  if (!/\btask_sla\b/.test(line) || values.length === 0) return [];
  const found = [];
  let rest = values;
  if (/\bDo not query\b/.test(line)) {
    const [forbidden] = values;
    rest = values.slice(1);
    if (stored.has(forbidden)) found.push(`forbids \`${forbidden}\`, a value the platform stores`);
    const named = [...line.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]).filter((v) => stored.has(v));
    if (named.length === 0) found.push('names no stored value beside the one it forbids');
    else if (!line.includes('PN-25')) found.push(`names \`${named[0]}\` without citing PN-25`);
  }
  for (const v of rest) if (!stored.has(v)) found.push(`writes \`${v}\`, a value no row holds`);
  return found;
}

/** Every `.md` file of the roster: the skills, with their examples, and the agents. */
const rosterFiles = () => ['.claude/skills', '.claude/agents'].flatMap((dir) =>
  readdirSync(join(root, dir), { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => join(dir, f)));

const stored = storedStages(read('docs/PLATFORM-NOTES.md'));

test('ARC-09-C228 — PN-25 lists six stored stages, `completed` among them and `complete` not', () => {
  assert.deepEqual([...stored].sort(), ['achieved', 'breached', 'cancelled', 'completed', 'in_progress', 'paused']);
});

test('ARC-09-C228 — the check fails the two lines the roster carried, and holds for their corrections', () => {
  const carried = [
    '- "Do not query `task_sla` with `stage=\'completed\'` — the baseline stage vocabulary uses `stage=\'complete\'` '
      + '(no -ed suffix). Verify against your instance\'s `task_sla` choice list before depending on either value.]',
    '- **Do not query `task_sla.stage=\'completed\'` if SLA tracking is added** — baseline value is `complete` without '
      + 'the -ed. (Defensive — relevant if Technical Designer adds SLA-aware logic.)',
  ];
  for (const line of carried) assert.notDeepEqual(problems(line, stored), [], line);
  const corrected = '- "Do not query `task_sla` with `stage=\'complete\'` — a finished SLA\'s stage is stored as '
    + '`completed` (PN-25)."';
  assert.deepEqual(problems(corrected, stored), []);
  assert.deepEqual(problems('Do not query `task_sla` with `stage=\'complete\'`; use `completed`.', stored),
    ['names `completed` without citing PN-25']);
  assert.deepEqual(problems('A query on `task_sla` with `stage=\'achieve\'`.', stored),
    ['writes `achieve`, a value no row holds']);
  assert.deepEqual(problems('A requested item\'s `stage=\'complete\'`, no task SLA named.', stored), []);
});

test('ARC-09-C228 — every task_sla stage value the roster writes is one PN-25 lists', () => {
  const lines = rosterFiles().flatMap((file) => read(file).split('\n')
    .map((line, i) => ({ at: `${file}:${i + 1}`, line })))
    .filter(({ line }) => /\btask_sla\b/.test(line) && stageValues(line).length > 0);
  assert.ok(lines.length >= 2, `the scan read ${lines.length} lines; the ITSM skill and its examples carry one each`);
  const found = lines.flatMap(({ at, line }) => problems(line, stored).map((p) => `${at}: ${p}`));
  assert.deepEqual(found, []);
});
