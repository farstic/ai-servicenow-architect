/**
 * The Domain Expert gateways, as a CLASS rather than a list — and the places that have to name them.
 *
 * WHY THIS EXISTS. Five gateways were named by hand in every place a gateway has to appear: the Phase 1
 * Step 5 table in `CLAUDE.md`, the taxonomy's roster and trigger map, and a test that pinned the table at
 * exactly five rows. Adding a sixth (`fso-insurance-specialist`, 2.0.9) meant finding every one of those
 * by search, and a search is only as good as the words it was given. A gateway is now whatever the roster
 * library classifies as one — from the skill's own `**Fires:**` line, the same reading `gen-roster` and
 * the doctor's E-17 use — so the next gateway is in the class the moment its SKILL.md exists, and every
 * place that must name it fails until it does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectRoster } from '../../scripts/lib/roster.mjs';

/** Skill directories the roster classifies as gateways, sorted. One definition, shared with gen-roster. */
export function gatewayDirs(root) {
  return collectRoster(root).skills.filter((s) => s.firesAs === 'gateway').map((s) => s.dir).sort();
}

/**
 * The rows of `CLAUDE.md`'s Phase 1 Step 5 gateway table: `{ name, path }` per row.
 *
 * Read by SHAPE — a bold `**… Specialist**` cell followed by a `.claude/skills/<dir>/SKILL.md` cell — which
 * is the same reading `tests/claude-md.test.mjs` has always used, so the two cannot disagree about what a
 * row is.
 */
export function gatewayTableRows(claudeMd) {
  const rows = [];
  for (const line of claudeMd.split('\n')) {
    const m = /^\| .* \| \*\*([A-Z][^*]*Specialist)\*\* \| `(\.claude\/skills\/[^`/]+\/SKILL\.md)` \|\s*$/.exec(line);
    if (m) rows.push({ name: m[1], path: m[2] });
  }
  return rows;
}

/**
 * The cells of the first table under a heading, as arrays of trimmed strings — header and rule rows dropped.
 *
 * The section ends at the next heading of the same or a higher level, so a table further down the page
 * cannot be read as this one.
 */
export function tableUnder(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) throw new Error(`heading not found: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const h = /^(#+)\s/.exec(line);
    if (h && h[1].length <= level) break;
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;          // the |---| rule
    rows.push(cells);
  }
  return rows.slice(1);                                             // drop the header row
}

export const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
