import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRoster } from '../scripts/lib/roster.mjs';
import { gatewayDirs, gatewayTableRows, read, tableUnder } from './lib/gateways.mjs';

/**
 * Every Domain Expert gateway is wired everywhere a gateway has to be — as a CLASS.
 *
 * A gateway nobody routes to is a gateway that does not fire. Until 2.0.9 the five were wired by hand: the
 * Phase 1 Step 5 table in `CLAUDE.md`, the taxonomy's roster and its trigger map, and a test that pinned the
 * table at exactly five rows. Adding the sixth (`fso-insurance-specialist`) meant finding every one of those
 * places by search. These cases make the wiring a property of the class: a gateway is whatever the roster
 * library classifies as one from its own `**Fires:**` line, and each place it must appear is checked for
 * every member — so the seventh gateway fails here, by name, until it is wired.
 *
 * They were written to pass for the five gateways on develop BEFORE the sixth was added, and to fail for the
 * sixth until its rows existed; the pull request that introduced them records both runs.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const claudeMd = read(root, 'CLAUDE.md');
const taxonomy = read(root, 'governance/taxonomy.md');
const gateways = gatewayDirs(root);
const rows = gatewayTableRows(claudeMd);
const rowFor = (dir) => rows.find((r) => r.path === `.claude/skills/${dir}/SKILL.md`);

test('the class is read, not assumed — there are gateways to check', () => {
  // A floor, because a reader that found none would pass every case below by having nothing to say.
  assert.ok(gateways.length >= 5, `only ${gateways.length} gateways classified — the roster is not being read`);
  assert.ok(rows.length >= 5, `only ${rows.length} gateway-table rows read from CLAUDE.md`);
});

test('a gateway says so in its description, and nothing else claims to be one', () => {
  // The description is what the model routes on. A skill the roster classifies as a gateway but whose
  // description reads like a consult would be wired everywhere and chosen nowhere — and the reverse would be
  // a skill announcing a halt it is never classified to run. `upstream` is accepted so the old phrasing
  // cannot slip a gateway out of the class.
  const marker = /^Mandatory (upstream )?gateway\b/;
  const roster = collectRoster(root);
  for (const s of roster.skills) {
    const claims = marker.test(s.description ?? '');
    const is = s.firesAs === 'gateway';
    assert.equal(claims, is, is
      ? `${s.dir} is classified a gateway but its description does not say "Mandatory gateway"`
      : `${s.dir} describes itself as a mandatory gateway but its **Fires:** line does not classify it as one`);
  }
});

test('every gateway has exactly one row in the Phase 1 Step 5 table, and the table has no other rows', () => {
  for (const dir of gateways) {
    const matching = rows.filter((r) => r.path === `.claude/skills/${dir}/SKILL.md`);
    assert.equal(matching.length, 1, `${dir} has ${matching.length} rows in CLAUDE.md's gateway table — it must have one`);
  }
  const strays = rows.filter((r) => !gateways.some((dir) => r.path === `.claude/skills/${dir}/SKILL.md`));
  assert.deepEqual(strays.map((r) => r.path), [],
    'CLAUDE.md routes to a gateway the roster does not classify as one');
});

test('every gateway is in the taxonomy roster, under the name CLAUDE.md gives it', () => {
  // The display name comes from the gateway table, so the two documents are held to ONE name per gateway:
  // a taxonomy row spelled differently would be a second persona as far as a reader can tell.
  const named = tableUnder(taxonomy, '### Domain experts (modules)').map((cells) => cells[1]);
  for (const dir of gateways) {
    const row = rowFor(dir);
    assert.ok(row, `${dir} has no gateway-table row to take its name from`);
    assert.ok(named.includes(row.name),
      `governance/taxonomy.md §1 "Domain experts (modules)" has no row for ${row.name}`);
  }
});

test('every gateway is the primary specialist of a row in the taxonomy trigger map', () => {
  // §4.4 is what §6.1 step 7 sends a reader to. A gateway with no trigger row is one the resolution
  // algorithm has no keyword for — the T-10 failure, where a gateway was deferred because nothing named it.
  const primaries = tableUnder(taxonomy, '### 4.4 Domain triggers').map((cells) => cells[1]);
  for (const dir of gateways) {
    const row = rowFor(dir);
    assert.ok(row, `${dir} has no gateway-table row to take its name from`);
    assert.ok(primaries.includes(row.name),
      `governance/taxonomy.md §4.4 has no trigger row whose primary specialist is ${row.name}`);
  }
});

test('the roster line in CLAUDE.md states the counts the roster actually has', () => {
  // Nothing checked this before: E-17 compares the directories with engine.config.json, and gen-roster
  // writes the counts into docs/ARCHITECTURE.md — but CLAUDE.md's line is hand-written and was free to
  // drift. It is the sentence every session reads first about the roster, so it is held to the same numbers.
  const m = /(\d+) specialist personas · (\d+) skills .*· (\d+) sub-agents/.exec(claudeMd);
  assert.ok(m, 'CLAUDE.md has no "N specialist personas · N skills … · N sub-agents" line');
  const roster = collectRoster(root);
  const personas = roster.rosterSkills.filter((s) => !s.isReference).length;
  assert.deepEqual(
    { personas: Number(m[1]), skills: Number(m[2]), subAgents: Number(m[3]) },
    { personas, skills: roster.rosterSkills.length, subAgents: roster.agents.length },
    'CLAUDE.md\'s roster line disagrees with the roster');
});
