// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C280 — the files that quote the corpus pin without being generated from it by a recipe, and the corpus map.
//
// `syncUpstream` moves the pin and regenerates what a recipe makes from it: the config, the gitlink and the three
// recipe targets. Five more files quote the pin, and so does the corpus map. The bump staged none of them, so the bot's
// pull request for the 96d3212 bump (#573) went red on each and a person moved them by hand. "A generated file that
// depends on a value this command moves is this command's output too" is `syncUpstream`'s own rule for the recipe;
// these are the same case, and `scripts/docs-bump.mjs` — the script the workflow runs and a maintainer can run — carries
// the rule out for them.
//
// Not in `tools/`: the files named here are the engineering checkout's fixtures and documents, which the distribution
// does not ship, and the shipped runtime has no business knowing them.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The files that quote the pin and that the bump moves with it: the panel sample's `Docs:` line in the snowarch skill,
 * the status snippet and VALIDATION-TESTS, and the pin and head in the two doctor status fixtures (which
 * `scripts/make-status-fixtures.mjs` captures; its test fails when they drift from a fresh capture).
 */
export const PIN_FOLLOWERS = Object.freeze([
  '.claude/skills/snowarch/SKILL.md',
  'docs/snippets/status-template.md',
  'tests/VALIDATION-TESTS.md',
  'tests/fixtures/doctor/status-design.json',
  'tests/fixtures/doctor/status-live.json',
]);

const MAP = 'vendor/docs-map.md';
const GEN_MAP = fileURLToPath(new URL('../gen-docs-map.mjs', import.meta.url));

/** A pin is 40 hex digits and the samples quote its first 12, so there is nothing in one to escape in a pattern. */
const sampleOf = (pin) => new RegExp(`(Docs: vendor/ServiceNowDocs @ )${pin.slice(0, 12)}`, 'g');

/** Does this file say anything about this pin: the sample line quotes 12 digits of it, a fixture the whole of it. */
const carries = (path, text, pin) => (path.endsWith('.md') ? sampleOf(pin).test(text) : text.includes(pin));

/** The text with the old pin moved to the new one, and nothing else changed (line endings included). */
const moved = (path, text, from, to) => (path.endsWith('.md')
  ? text.replace(sampleOf(from), (_whole, lead) => `${lead}${to.slice(0, 12)}`)
  : text.split(from).join(to));

/**
 * Moves the pin in each follower that quotes the old one. Each file's status:
 * `written` it quoted the old pin and now quotes the new one; `current` it already quotes the new one, or the pin did not
 * move; `absent` the tree has no such file; `lost` it quotes neither pin, so there is nothing to move and the file is
 * left as it is: whoever reworded it took away the line this follows, and the report says so.
 */
export function followPin({ root, from, to }) {
  const out = {};
  for (const path of PIN_FOLLOWERS) {
    const file = join(root, path);
    if (!existsSync(file)) { out[path] = 'absent'; continue; }
    const text = readFileSync(file, 'utf8');
    if (from !== to && carries(path, text, from)) {
      writeFileSync(file, moved(path, text, from, to));
      out[path] = 'written';
    } else {
      out[path] = carries(path, text, to) || carries(path, text, from) ? 'current' : 'lost';
    }
  }
  return out;
}

/**
 * Regenerates the corpus map with its own generator, which is the only thing that writes it: `{ status, note }`.
 * `absent` the tree has no map; `current` the pin did not move or the map did not change; `written`; `refused` the
 * generator would not write it (it is made from the whole corpus at the pin, so a sparse corpus is refused), the map is
 * as it was, and `note` is the generator's own reason.
 */
export function followMap({ root, from, to }) {
  const file = join(root, MAP);
  if (!existsSync(file)) return { status: 'absent' };
  if (from === to) return { status: 'current' };
  const before = readFileSync(file, 'utf8');
  const run = spawnSync(process.execPath, [GEN_MAP, '--write', '--root', root], { encoding: 'utf8' });
  if (run.status !== 0) {
    return { status: 'refused', note: `${run.stderr}${run.stdout}`.trim().split('\n')[0] || `the generator exited ${run.status}` };
  }
  return { status: readFileSync(file, 'utf8') === before ? 'current' : 'written' };
}

/** Both, as the bump uses them: what each did, and the paths that changed and have to be staged. */
export function follow({ root, from, to }) {
  const followers = followPin({ root, from, to });
  const map = followMap({ root, from, to });
  const staged = [
    ...PIN_FOLLOWERS.filter((path) => followers[path] === 'written'),
    ...(map.status === 'written' ? [MAP] : []),
  ];
  return { followers, map, staged };
}
