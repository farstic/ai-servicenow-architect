// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C250 — the reading row: the instruction files teach searches that find what the corpus has, and point at pages
// that hold what they claim. Each case names the measured defect it guards; all were measured on the full corpus at pin
// aa447ce4, and none needs a corpus to run, so the checks hold in every CI job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
/** Every instruction file the model reads: CLAUDE.md, the rules, the skills, the agents and governance. */
const INSTRUCTIONS = execFileSync('git', ['ls-files', 'CLAUDE.md', '.claude/rules', '.claude/skills', '.claude/agents',
  'governance'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter((f) => f.endsWith('.md'));

/**
 * A single-escaped underscore in a search position: "Search for `a\_b`", "grep `a\_b`". The Grep tool takes a regex,
 * where `\_` is a plain `_`, so the pattern finds only the pages that do NOT escape it: CSM's example found 0 of 16.
 * A double backslash (`\\_`) or the escape-safe `\\?_` is not matched, and neither is a name quoted as the corpus spells
 * it outside a search ("the corpus escapes underscores (`sc\_req\_item`)").
 */
const SINGLE_ESCAPED_SEARCH = /(?:[Ss]earch(?:ing)?(?: the corpus)? for|[Gg]rep(?: for)?)\s+`([^`]*[^\\`]\\_[^`]*)`/g;
const singleEscapedSearches = (text) => [...text.matchAll(SINGLE_ESCAPED_SEARCH)].map((m) => m[0]);

test('ARC-09-C250 — the lint flags a single-escaped search and passes the escape-safe one', () => {
  assert.deepEqual(singleEscapedSearches('Search for `sn\\_customerservice\\_escalation` before concluding.'),
    ['Search for `sn\\_customerservice\\_escalation`']);
  assert.deepEqual(singleEscapedSearches('Search for `sn\\\\?_customerservice\\\\?_escalation` before concluding.'), []);
  // W1, CLAUDE.md's own teaching: the escaped spelling is quoted as the corpus has it, not given as a search.
  assert.deepEqual(singleEscapedSearches('In a Grep pattern write each `_` of a table, field or role name as `\\\\?_`: '
    + 'the corpus escapes underscores (`sc\\_req\\_item`).'), []);
});

test('ARC-09-C250 — no instruction file teaches a single-escaped underscore as a search pattern', () => {
  assert.ok(INSTRUCTIONS.length >= 50, `${INSTRUCTIONS.length} instruction files — the list read nothing`);
  const hits = INSTRUCTIONS.flatMap((f) => read(f).split('\n')
    .flatMap((line, i) => singleEscapedSearches(line).map((s) => `${f}:${i + 1}: ${s}`)));
  assert.deepEqual(hits, []);
});

test('ARC-09-C250 — the rule for unknown names searches escape-safe before calling a name engagement-specific', () => {
  // agents/story-writer.md: a plain-underscore search found 0 of 13 pages for `sys_update_set`, 4 of 48 for `task_sla`,
  // and an unknown name was then flagged as engagement-specific.
  const rule = read('.claude/agents/story-writer.md').split('\n').find((l) => l.includes('**Verify unknown table or field names**'));
  assert.ok(rule, 'the story-writer rule is gone');
  assert.match(rule, /`\\\\\?_`/, 'the rule does not teach the escape-safe form');
});

test('ARC-09-C250 — no instruction file points at or cites the near-empty now-platform index', () => {
  // markdown/now-platform/index.md is 527 bytes with one link, to the area's own landing page: the area is two files.
  // It was pointed at for "Glide, ACLs, audit, business rules" and cited for audit history, none of which it holds.
  const hits = INSTRUCTIONS.flatMap((f) => read(f).split('\n')
    .flatMap((line, i) => (line.includes('markdown/now-platform/index.md') ? [`${f}:${i + 1}`] : [])));
  assert.deepEqual(hits, []);
});

test('ARC-09-C250 — ITSM names the folders that hold Now Assist for ITSM and AI Search', () => {
  // intelligent-experiences/index.md names the ITSM Now Assist folder on 0 of its lines; the 84 pages are in the ITSM
  // area, and all 243 `product: AI Search` pages are in platform-administration/ai-search.
  const itsm = read('.claude/skills/itsm-specialist/SKILL.md');
  assert.ok(itsm.includes('markdown/it-service-management/now-assist-for-it-service-management-itsm/'));
  assert.ok(itsm.includes('markdown/platform-administration/ai-search/'));
});

test('ARC-09-C250 — HRSD\'s audit history points at the page on audit and history sets', () => {
  // table-administration-and-data-management mentions audit on 7 of its 130 pages, in passing, and `sys_history_set` on
  // none; the history-set pages are in platform-security.
  const row = read('.claude/skills/hrsd-specialist/SKILL.md').split('\n').find((l) => l.startsWith('| Audit history'));
  assert.ok(row, 'the audit-history row is gone');
  assert.ok(row.includes('markdown/platform-security/c_DiffBtwnAuditHistSets.md'), row);
});

test('ARC-09-C250 — no skill licenses an answer from general ServiceNow knowledge', () => {
  // ITSM and HRSD allowed "Behaviour described from general ServiceNow knowledge", against CLAUDE.md's grounding rule
  // ("If the corpus does not cover it, say so rather than recalling it"). Used in 0 of 609 recorded answers.
  const hits = INSTRUCTIONS.filter((f) => /general ServiceNow knowledge/i.test(read(f)));
  assert.deepEqual(hits, []);
});
