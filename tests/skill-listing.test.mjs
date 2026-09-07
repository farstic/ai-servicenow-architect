// ARC-02-S03 — the S-13 acceptance test: do all 28 skills reach a fresh session WITH a description.
//
// It reads Claude Code's own debug log rather than asking a model to print its listing, because a
// model that omits a long description is indistinguishable from a description that was never
// registered. See scripts/ci/skill-listing-check.mjs for the mechanism and the measured warning.
//
// The isolation tests below need no CLI and always run; only the two measurements need `claude`, and
// they skip with a reason when it is absent — the same contract as the plugin-validate job (S-19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { measure, pollutingAncestors, cleanScratchParent } from '../scripts/ci/skill-listing-check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roster = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')).roster.skills;

function poisoned() {
  // realpath: on macOS /var is a symlink to /private/var, and cleanScratchParent resolves its
  // candidates — so the fixture has to speak the same dialect or the comparison is about symlinks.
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'snowarch-poison-')));
  mkdirSync(join(base, '.claude/skills/decoy'), { recursive: true });
  writeFileSync(join(base, '.claude/skills/decoy/SKILL.md'), '---\nname: decoy\ndescription: d\n---\n\n# D\n');
  mkdirSync(join(base, 'deep/deeper'), { recursive: true });
  return base;
}

test('the walk-up is detected: an ancestor .claude/skills is found from any depth below it', () => {
  // Claude Code loads project skills from EVERY .claude/skills between cwd and the filesystem root,
  // so a scratch project under one of them silently gets both rosters. This is the check that stops
  // the measurement trusting such a count. It is a product fact too — see docs/CONTRIBUTING.md.
  //
  // The assertions are "contains, nearest first" rather than "equals [base]" on purpose: this suite
  // must pass when TMPDIR is ITSELF under a .claude/skills — which is the exact condition being
  // guarded against, and an equality assertion would fail there while the code under test is right.
  const base = poisoned();
  try {
    const deep = pollutingAncestors(join(base, 'deep/deeper'));
    assert.ok(deep.includes(base), `the ancestor carrying .claude/skills must be reported: ${deep}`);
    assert.equal(deep[0], base, 'nearest ancestor first');
    assert.ok(pollutingAncestors(join(base, '.claude')).includes(base), 'including from just inside it');
    assert.ok(!pollutingAncestors(join(base, 'deep')).includes(join(base, 'deep')),
      'a directory with no .claude/skills of its own is not itself polluting');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('a clean candidate is chosen over a polluted one, and none means SKIP — never a wrong number', () => {
  const base = poisoned();
  const clean = realpathSync(mkdtempSync(join(tmpdir(), 'snowarch-clean-')));
  try {
    // `clean` is only clean if TMPDIR itself is — which it may not be. Skip the positive half rather
    // than assert something the environment can falsify; the negative half is the load-bearing one.
    if (!pollutingAncestors(clean).length) {
      const picked = cleanScratchParent([join(base, 'deep'), clean]);
      assert.equal(picked.parent, clean, 'the clean candidate must win');
      assert.equal(picked.tried.length, 1, 'and the rejected one is reported, not silently dropped');
      assert.ok(picked.tried[0].polluted.includes(base));
    }

    const none = cleanScratchParent([join(base, 'deep'), join(base, 'deep/deeper')]);
    assert.equal(none.parent, null, 'with every candidate polluted there is no parent to use');
    assert.equal(none.tried.length, 2, 'and every rejection carries its reason');
    for (const t of none.tried) assert.ok(t.polluted.includes(base), 'naming the polluting path');
  } finally { rmSync(base, { recursive: true, force: true }); rmSync(clean, { recursive: true, force: true }); }
});

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
