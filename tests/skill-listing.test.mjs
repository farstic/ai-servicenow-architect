// ARC-02-S03 — the S-13 acceptance test: do all 28 skills reach a fresh session WITH a description.
//
// It reads Claude Code's own debug log rather than asking a model to print its listing, because a
// model that omits a long description is indistinguishable from a description that was never
// registered. See scripts/ci/skill-listing-check.mjs for the mechanism and the measured warning.
//
// It needs the CLI and takes ~15s, so it skips with a reason when `claude` is absent — the same
// contract as the plugin-validate CI job (S-19). A skip states why; it never passes silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { measure } from '../scripts/ci/skill-listing-check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roster = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')).roster.skills;

// One measurement, shared: each run spawns a headless session.
const r = process.env.SNOWARCH_SKIP_LISTING ? { skipped: true, reason: 'SNOWARCH_SKIP_LISTING set' } : measure();
const skip = r.skipped ? r.reason : false;

test('S-13 every roster skill registers in a fresh session', { skip }, () => {
  assert.equal(r.projectSkills, roster,
    `S-13: ${r.projectSkills} project skills registered, engine.config.json says ${roster}`);
  console.log(`    S-13: ${r.projectSkills}/${roster} project skills registered (claude ${r.version})`);
});

test('S-13 the listing is under budget, so no description is truncated', { skip }, () => {
  // This is the P-09 mechanism, stated by the CLI itself. The budget is a TOTAL across every skill in
  // the session — bundled and user skills included — so the engine controls only its own share.
  assert.equal(r.warning, null,
    `S-13: ${r.warning}\n  The engine's descriptions must shrink further, or a user's own skills will truncate first.`);
  console.log(`    S-13: ${r.sent} skills sent, no truncation warning`);
});
