// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * SK-13 (ARC-09-C164) — the engine's share of the skill-listing budget, held here because S-13 cannot hold it.
 *
 * S-13 reads Claude Code's own warning, "Skill listing over budget: N skills, C chars > 30000 budget", and that total
 * counts every skill in the session: the user's own and their plugins' as well as the engine's. On the developer's
 * machine on 2026-10-16 it read 38,961, of which the engine's 30 skills were 12,712 (names and descriptions). The
 * engine cannot make that total pass on a machine whose other skills fill it; it can bound its own share. So this
 * guard holds every project skill's description to 250 characters and the roster's total to 7,500, and S-13 is left
 * exactly as it is, the measurement of the whole session. The rule is `lintDescriptionBudget` in tests/lib/lint-rules.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descriptionLengths, lintDescriptionBudget, MAX_ROSTER_DESCRIPTIONS, MAX_SHARE_DESCRIPTION } from './lib/lint-rules.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('SK-13 — every project skill description is at most 250 characters, and the roster at most 7,500', () => {
  const byName = descriptionLengths({ root });
  assert.ok(Object.keys(byName).length >= 30, `${Object.keys(byName).length} project skills — the scan is wrong`);
  assert.deepEqual(lintDescriptionBudget(byName), []);
  const total = Object.values(byName).reduce((a, b) => a + b, 0);
  const [longest, n] = Object.entries(byName).sort((a, b) => b[1] - a[1])[0];
  console.log(`    skill descriptions: ${Object.keys(byName).length} skills, ${total} chars (cap ${MAX_ROSTER_DESCRIPTIONS}); `
    + `longest ${longest} ${n} (cap ${MAX_SHARE_DESCRIPTION})`);
});

test('SK-13 — it fails on one description over 250, and on a roster over 7,500', () => {
  assert.deepEqual(lintDescriptionBudget({ a: 250, b: 10 }), []);
  assert.deepEqual(lintDescriptionBudget({ a: 251 }), ['SK-13 .claude/skills/a/SKILL.md: description 251 chars > 250']);
  const thirtyOne = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`s${i}`, 245]));
  assert.deepEqual(lintDescriptionBudget(thirtyOne), ['SK-13 roster: descriptions total 7595 chars > 7500']);
});
