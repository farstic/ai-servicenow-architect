// ARC-08-S01 — the human renderer.
//
// Two rules the layout exists to serve:
//
//   `FAIL` IS UPPER-CASE. `grep FAIL` on a doctor's output is how people have triaged this class of
//   tool for thirty years, and the old doctor did it too. `ok`, `warn` and `skip` stay lower-case
//   so the failures are the only thing that shouts.
//
//   THE MODE LINE IS LAST. It is the line a session quotes and the line a person screenshots, and
//   the last line of a transcript is the one that survives a truncated paste. `modeLine()` in
//   `lib/text.mjs` is its ONE definition — this renderer prints what it is given and never
//   re-derives it.
//
// Colour only when stdout is a terminal and `NO_COLOR` is unset: a report redirected to a file or
// piped into `grep` must not carry escape codes, and a user who has said they do not want colour
// has said it once, for every tool.
import { SECTIONS } from './registry.mjs';

// Written as escape SEQUENCES, never as the characters themselves: a raw control byte in a source
// file is invisible in a diff and in a review.
const CODES = { ok: '\u001b[32m', warn: '\u001b[33m', FAIL: '\u001b[31m', skip: '\u001b[90m' };
const RESET = '\u001b[0m';

export function useColour({ stream = process.stdout, env = process.env } = {}) {
  return Boolean(stream?.isTTY) && !env.NO_COLOR;
}

/** `ok` · `warn` · `FAIL` · `skip`. Upper-case only where it has to shout. */
export const statusLabel = (status) => (status === 'fail' ? 'FAIL' : status);

const paint = (label, colour) => (colour && CODES[label] ? `${CODES[label]}${label}${RESET}` : label);

/**
 * The header. It says what was ASKED FOR, because a report with three sections missing looks
 * identical to a broken doctor unless the options are on the page.
 */
export function headerLine({ version, ranAt, options = {} }) {
  const when = String(ranAt).replace('T', ' ').replace(/\.\d+Z?$/, '').replace('Z', '');
  const section = options.section ?? 'all';
  return `snowarch doctor ${version ?? '?'} — ${when} `
    + `(quick: ${options.quick ? 'yes' : 'no'} · network: ${options.noNetwork ? 'no' : 'yes'} · section: ${section})`;
}

/** `DOCTOR: 41 ok, 1 warn, 1 fail (2 fixable — run ./snowarch doctor --fix)` */
/**
 * `DOCTOR: 41 ok, 0 warn, 0 fail` — ONE renderer, two callers.
 *
 * The bootstrap's B09 printed its own version of this line from `text.mjs`'s `doctorLine`, and the
 * two drifted the moment this one learned to say `(2 fixable — …)`: an install summary and a
 * doctor report that disagree about the same run are two numbers a reader has to reconcile.
 * `renderSummaryLine` is the alias B09 imports, so the two names say who is calling.
 */
export function summaryLine(summary) {
  const parts = [`${summary.ok} ok`, `${summary.warn} warn`, `${summary.fail} fail`];
  if (summary.skip > 0) parts.push(`${summary.skip} skipped`);
  const fixable = summary.fixable > 0
    ? ` (${summary.fixable} fixable — run ./snowarch doctor --fix)`
    : '';
  return `DOCTOR: ${parts.join(', ')}${fixable}`;
}

export { summaryLine as renderSummaryLine };

/**
 * The capability packs, on one line above the summary.
 *
 * E-04 already reports them as a check; this is the line a reader scans when they are about to
 * author a deliverable rather than diagnose an install, and it names the PROVIDER because "docx
 * yes" does not tell a Windows user whether it was PowerShell or a Python nobody installed.
 */
export function capabilitiesLine(packs) {
  if (!packs) return null;
  const LABELS = { docx: 'docx', pdf: 'PDF QA', drawio: 'draw.io', mermaid: 'Mermaid' };
  const parts = Object.entries(LABELS).map(([key, label]) => {
    const pack = packs[key];
    if (!pack) return `${label} no`;
    // The provider, not the path: `/opt/homebrew/bin/python3` is a path a reader has to parse to
    // learn one word, and the word is the answer.
    const how = pack.how ? String(pack.how).split(/[\\/]/).pop().replace(/\.(exe|cmd|app)$/i, '') : null;
    return pack.present && how ? `${label} yes (${how})` : `${label} no`;
  });
  return `Capabilities: ${parts.join(' · ')}`;
}

/**
 * The report, as a person reads it.
 *
 * `modeLine` is passed in and printed unchanged. Passing `null` prints no Mode line at all, which
 * is what this story does — S05 owns assembling it, and a renderer that invented one meanwhile
 * would be a second answer to the question `/snowarch status` exists to answer.
 */
/**
 * The one section header that carries a reason: `server (skipped — design-only)`.
 *
 * Kept to that case on purpose. A generic "(all skipped)" would be true of `--section contract` on
 * a run that asked for something else, where the reason is the flag the reader just typed.
 */
export const sectionNote = (section, reason) => (section === 'server'
  && /dependencies not installed/.test(String(reason))
  ? 'server (skipped — design-only)'
  : null);

export function renderText({ report, checks = [], colour = false }) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const idWidth = Math.max(0, ...report.checks.map((c) => String(c.id).length));
  const lines = [headerLine(report), ''];

  for (const section of SECTIONS) {
    const inSection = report.checks.filter((c) => (c.section ?? byId.get(c.id)?.section) === section);
    if (inSection.length === 0) continue;
    // A section every one of whose checks skipped for the SAME reason says the reason in its
    // header. The one that matters is design-only: `npm ci` never runs there, so nine `skip` lines
    // under a bare `server` heading read as nine things that went wrong (ARC-08-S04).
    const reasons = new Set(inSection.map((c) => (c.status === 'skip' ? c.detail : null)));
    lines.push(reasons.size === 1 && !reasons.has(null) && sectionNote(section, [...reasons][0])
      ? sectionNote(section, [...reasons][0])
      : section);
    for (const result of inSection) {
      const label = statusLabel(result.status);
      const title = result.title ?? byId.get(result.id)?.title ?? '';
      // Padded on the PLAIN label: the escape codes are invisible and would otherwise eat the
      // padding, so a coloured report's columns would not line up with a piped one's.
      const padding = ' '.repeat(Math.max(0, 5 - label.length));
      // The ID column is padded to the widest id in the report, so `E-00` and `SV-03` put their
      // statuses in the same place. A column that moves per row is a column a reader cannot scan,
      // and scanning for `FAIL` is what this layout is for.
      lines.push(`  ${result.id.padEnd(idWidth)} ${paint(label, colour)}${padding} `
        + `${title}: ${result.detail ?? ''}`);
      // The remedy is indented UNDER its check rather than beside it: it is often the longest
      // string in the report, and a wrapped remedy that starts mid-line is the part people stop
      // reading.
      if (result.remedy) {
        const fixable = byId.get(result.id)?.fixable ? '   [fixable: ./snowarch doctor --fix]' : '';
        lines.push(`             → ${result.remedy}${fixable}`);
      }
      if (result.command) lines.push(`               ${result.command}`);
    }
  }

  lines.push('');
  const capabilities = capabilitiesLine(report.prereqs?.capabilities ?? null);
  if (capabilities) lines.push(capabilities);
  lines.push(summaryLine(report.summary));
  if (report.modeLine) lines.push(report.modeLine);
  return lines.join('\n');
}
