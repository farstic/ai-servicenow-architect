// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C167a — the live-coverage ledger: which of the server's tools have run against a real instance.
 *
 * ARC-09-C165 found a whole family (`snow_ai_*`) that wrote tables no instance has, shipped for two minor
 * versions, because no live sitting ever called it. The proxy measured that day — a tool named in a record —
 * counted 26 of 399. This replaces the proxy with a status per tool, kept by hand in
 * `docs/validation/live-coverage.json` and checked here against the manifest and the records:
 *
 *   verified-live  a sitting called it and it did what it says       — record, date and instance family required
 *   refused        a sitting called it and the instance refused it   — the same evidence, and the reason in a note
 *   named-only     a record names it; no sitting has confirmed a call — a record that names it is required
 *   unverified     nothing shows it has run against an instance
 *
 * The module is pure — inputs in, a report out — so the tests drive it with fixtures; `scripts/live-coverage.mjs`
 * reads the real files.
 */

export const STATUSES = Object.freeze(['verified-live', 'refused', 'named-only', 'unverified']);
export const TARGET = 'docs/validation/LIVE-COVERAGE.md';
export const LEDGER = 'docs/validation/live-coverage.json';

/** A tool's family: the segment after `snow_` (`snow_core_records_query` → `core`). */
export const familyOf = (tool) => tool.split('_')[1];

/**
 * The records the ledger reads: every sitting record under `docs/validation/` and the platform notes. Not the
 * templates, which are forms with no run behind them, and not the ledger's own page, which names every tool.
 */
export function isRecord(path) {
  if (path === 'docs/PLATFORM-NOTES.md') return true;
  const m = /^docs\/validation\/([^/]+\.md)$/.exec(path);
  return Boolean(m) && !/^TEMPLATE/.test(m[1]) && path !== TARGET;
}

const namedIn = (tool, text) => new RegExp(`(?<![A-Za-z0-9_])${tool}(?![A-Za-z0-9_])`).test(text);

/** Which records name each tool: { tool → [path, …] }, validation records first, the platform notes last. */
export function namedBy(tools, records) {
  const order = Object.keys(records).sort((a, b) => (a === 'docs/PLATFORM-NOTES.md') - (b === 'docs/PLATFORM-NOTES.md')
    || a.localeCompare(b));
  return Object.fromEntries(tools.map((t) => [t, order.filter((p) => namedIn(t, records[p]))]));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every way the ledger disagrees with the manifest or the records, one sentence each. Empty is consistent. */
export function problems({ tools, ledger, records }) {
  const out = [];
  const entries = ledger.tools ?? {};
  const named = namedBy(tools, records);
  for (const t of tools) if (!(t in entries)) out.push(`${t} is in the manifest and has no entry in ${LEDGER}`);
  for (const [t, e] of Object.entries(entries)) {
    if (!tools.includes(t)) { out.push(`${t} has an entry in ${LEDGER} and is not in the manifest`); continue; }
    if (!STATUSES.includes(e.status)) { out.push(`${t}: status "${e.status}" is not one of ${STATUSES.join(', ')}`); continue; }
    // A pipe in a table cell cuts the row on GitHub, even inside backticks.
    for (const k of ['note', 'record', 'family']) if (String(e[k] ?? '').includes('|')) out.push(`${t}: ${k} contains "|"`);
    if (e.status === 'unverified') continue;
    if (!e.record) { out.push(`${t}: ${e.status} needs the record that shows it`); continue; }
    if (!(e.record in records)) { out.push(`${t}: record ${e.record} is not a validation record or the platform notes`); continue; }
    if (!named[t].includes(e.record)) out.push(`${t}: record ${e.record} does not name it`);
    if (e.status !== 'named-only') {
      if (!DATE.test(e.date ?? '')) out.push(`${t}: ${e.status} needs the sitting's date (YYYY-MM-DD)`);
      if (!e.family) out.push(`${t}: ${e.status} needs the instance's release family`);
    }
  }
  return out;
}

/** Per-family counts and the totals, from the manifest and the ledger. */
export function tally({ tools, ledger, records }) {
  const named = namedBy(tools, records);
  const families = {};
  for (const t of tools) {
    const f = families[familyOf(t)] ??= { tools: 0, named: 0, ...Object.fromEntries(STATUSES.map((s) => [s, 0])) };
    f.tools += 1;
    if (named[t].length > 0) f.named += 1;
    const status = ledger.tools?.[t]?.status;
    if (STATUSES.includes(status)) f[status] += 1;
  }
  const total = { tools: tools.length, families: Object.keys(families).length, named: 0,
    ...Object.fromEntries(STATUSES.map((s) => [s, 0])) };
  for (const f of Object.values(families)) for (const k of ['named', ...STATUSES]) total[k] += f[k];
  total.familiesUnnamed = Object.values(families).filter((f) => f.named === 0).length;
  total.familiesUnverified = Object.values(families).filter((f) => f['verified-live'] === 0).length;
  return { families, total };
}

/** The one line a run prints, and the page repeats. */
export const totalsLine = ({ total: t }) => `live coverage: ${t.tools} tools in ${t.families} families — `
  + `verified-live ${t['verified-live']}, refused ${t.refused}, named-only ${t['named-only']}, unverified ${t.unverified}; `
  + `${t.named} tools named in a record, ${t.familiesUnnamed} families with none; `
  + `${t.familiesUnverified} families with no tool verified live`;

const cell = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const path = (p) => (p ? `\`${p}\`` : '—');

/** `docs/validation/LIVE-COVERAGE.md`, from the manifest, the ledger and the records. */
export function render({ tools, ledger, records }) {
  const t = tally({ tools, ledger, records });
  const named = namedBy(tools, records);
  const order = Object.entries(t.families).sort((a, b) => b[1].tools - a[1].tools || a[0].localeCompare(b[0]));
  const lines = [
    '<!-- GENERATED by scripts/live-coverage.mjs from packages/snowarch/dist/tools-manifest.json, '
      + `${LEDGER}, docs/validation/*.md and docs/PLATFORM-NOTES.md — do not edit; edit ${LEDGER} and run npm run gen -->`,
    '# Live coverage of the tool families',
    '',
    'Which of the server\'s tools have run against a real ServiceNow instance (ARC-09-C167a). A tool that no sitting',
    'has called can be wrong in a way no unit test sees — ARC-09-C165\'s AI agent tools wrote tables no instance has.',
    `Each tool's status is kept by hand in \`${LEDGER}\`; this page is generated from it, and \`npm run gen:check\``,
    'fails when a manifest tool has no entry, or an entry\'s evidence does not hold.',
    '',
    '- **verified-live** — a sitting called it and it did what it says; the record, its date and the instance\'s release family are named.',
    '- **refused** — a sitting called it and the instance refused it; the same evidence, and the reason.',
    '- **named-only** — a record names it, and no sitting has yet confirmed a call.',
    '- **unverified** — nothing shows it has run against an instance.',
    '',
    `**${totalsLine(t)}.**`,
    '',
    '## By family',
    '',
    '| Family | Tools | Verified live | Refused | Named only | Unverified | Named in a record |',
    '|---|---|---|---|---|---|---|',
    ...order.map(([f, c]) => `| \`${f}\` | ${c.tools} | ${c['verified-live']} | ${c.refused} | ${c['named-only']} | ${c.unverified} | ${c.named} |`),
    `| **all** | **${t.total.tools}** | **${t.total['verified-live']}** | **${t.total.refused}** | **${t.total['named-only']}** `
      + `| **${t.total.unverified}** | **${t.total.named}** |`,
    '',
    '## By tool',
  ];
  for (const [f] of order) {
    lines.push('', `### \`${f}\``, '', '| Tool | Status | Record | Date | Instance family | Note | Named in |', '|---|---|---|---|---|---|---|');
    for (const tool of tools.filter((x) => familyOf(x) === f).sort()) {
      const e = ledger.tools?.[tool] ?? {};
      lines.push(`| \`${tool}\` | ${cell(e.status)} | ${path(e.record)} | ${cell(e.date)} | ${cell(e.family)} | ${cell(e.note)} `
        + `| ${named[tool].length} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}
