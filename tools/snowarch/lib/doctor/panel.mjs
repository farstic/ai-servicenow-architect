/**
 * ARC-08-C18 — the panel `./snowarch status` prints, and the skill quotes verbatim.
 *
 * WHY THIS FILE EXISTS. `.claude/skills/snowarch/SKILL.md` § status was a renderer written in
 * prose for a model to execute: seven lines, each with the JSON key to read in brackets, a rule
 * for omitting a line whose key is null, a branch for failing checks, a branch for exit 3 and a
 * branch naming one of three causes when the doctor cannot run at all. Every session re-executed
 * it, and a renderer re-executed by a language model is a renderer with no test and no two runs
 * guaranteed alike. It is code here, and the skill's step 3 becomes "run it and print its output
 * verbatim".
 *
 * PURE, and structurally so — `tests/doctor/panel.test.mjs` walks this module's import graph and
 * fails if `node:fs`, `process.env` or a clock appears in any of it. A report goes in, a string
 * comes out. Every fact is the doctor's; nothing here measures anything.
 *
 * WHICH MAKES "VERBATIM" A PROMISE THAT CAN BE KEPT. The promise is not about time — two runs an
 * hour apart describe two different checkouts and should differ. It is that the same report
 * renders to the same bytes for every reader: no clock (`ranAt` is in the report), no `process.env`,
 * no cwd, and `ranAt` printed in UTC rather than local time, because two people comparing pasted
 * output in two timezones is the only reason "verbatim" is worth anything.
 */

/**
 * The contract sha, shortened to the prefix the rest of the product already uses.
 *
 * TWELVE, not seven. `./snowarch version` prints `contract 8d9d0847b597`, B09's summary block and
 * the doctor cache both `slice(0, 12)`; the SKILL.md sample showed seven, and it was the only one
 * of the four. A reader comparing the panel against `./snowarch version` — which is the whole
 * reason both print it — must not have to notice that one of them is shorter.
 */
export const SHA_PREFIX = 12;
const shortSha = (sha) => (sha ? String(sha).slice(0, SHA_PREFIX) : null);

/**
 * `2026-09-19 22:11 UTC` from the report's own `ranAt`.
 *
 * NOT `toLocaleString`, and the suffix is not decoration. The doctor's own `headerLine` already
 * formats this way and drops the `Z` without replacing it, which is defensible in a report you are
 * reading on the machine that produced it and wrong in a panel whose contract is that two people
 * can compare pasted copies. A local-time render would make the same report produce different
 * bytes in Sofia and in London, which is the one thing "verbatim" forbids.
 */
export function ranAtLine(ranAt) {
  if (!ranAt) return null;
  const text = String(ranAt);
  // Only an ISO instant is reformatted. Anything else is printed as it arrived: a renderer that
  // reshaped a string it did not recognise would be guessing at a value it is supposed to quote.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text;
  return `${text.slice(0, 10)} ${text.slice(11, 16)} UTC`;
}

/** `Engine: snowarch 2.0.0 · tag v2.0.0 · contract 96d056414da5` */
export function engineLine(engine) {
  if (!engine?.version) return null;
  const parts = [`snowarch ${engine.version}`];
  // A development checkout has no tag and says nothing rather than inventing one — `engineBlock`
  // is already honest about that and this line inherits it.
  if (engine.tag) parts.push(`tag ${engine.tag}`);
  if (engine.contractSha) parts.push(`contract ${shortSha(engine.contractSha)}`);
  return `Engine: ${parts.join(' · ')}`;
}

/**
 * `Docs: vendor/ServiceNowDocs @ ba513f2 (australia) · sparse · citations checked: 181 | dead: 0`
 *
 * The citation counts are a SEGMENT, not the line: they come from E-16, which walks the corpus and
 * is outside the quick subset, so on the run the skill mandates they are null while the pin and the
 * family are not. Dropping the whole line for a missing segment would hide the release family,
 * which is the fact a grounding decision turns on.
 */
export function docsLine(docs) {
  if (!docs) return null;
  if (docs.present === false) return 'Docs: not installed';
  const head = `vendor/ServiceNowDocs${docs.pin ? ` @ ${shortSha(docs.pin)}` : ''}`
    + `${docs.family ? ` (${docs.family})` : ''}`;
  const parts = [head];
  if (docs.mode) parts.push(docs.mode);
  if (docs.citations !== null && docs.citations !== undefined) {
    parts.push(`citations checked: ${docs.citations} | dead: ${docs.dead ?? 0}`);
  }
  return `Docs: ${parts.join(' · ')}`;
}

/** `Roster: 28 skills / 9 agents` */
export const rosterLine = (roster) => (roster
  ? `Roster: ${roster.skills} skills / ${roster.agents} agents`
  : null);

/**
 * `Instances: pdi (pdi, custom, default) · uat (test, read-only)`
 *
 * READ THIS BEFORE EXPECTING IT ON A QUICK RUN. `report.server` is null whenever no server check
 * ran, and since ARC-09-C8 that includes every `--quick` run — so this line is omitted on exactly
 * the run SKILL.md mandates. That is the null rule working, not a gap being papered over: the Mode
 * line already carries the default instance's label, environment, preset and flags, and the full
 * list is `./snowarch instance list`. Raised as a question in its own right — see the row.
 */
export function instancesLine(server) {
  const instances = server?.instances ?? [];
  if (instances.length === 0) return null;
  const one = (i) => {
    const inner = [i.environment, i.preset].filter(Boolean);
    if (i.default === true || i.isDefault === true) inner.push('default');
    return inner.length ? `${i.label} (${inner.join(', ')})` : String(i.label);
  };
  return `Instances: ${instances.map(one).join(' · ')}`;
}

/** `Doctor: 12 ok, 1 warn, 1 fail — quick run 2026-09-19 22:11 UTC · full report: ./snowarch doctor` */
export function doctorLine(report) {
  const s = report?.summary;
  if (!s) return null;
  const kind = report.options?.quick ? 'quick run' : 'full run';
  const when = ranAtLine(report.ranAt);
  return `Doctor: ${s.ok} ok, ${s.warn} warn, ${s.fail} fail`
    + `${when ? ` — ${kind} ${when}` : ` — ${kind}`}`
    + ' · full report: ./snowarch doctor';
}

/**
 * What a quick run did not measure, named from the keys that are actually null.
 *
 * Built from the report rather than from a remembered sentence: the skill carried this as a fixed
 * string and a fixed list of two, so a check moving in or out of the quick subset would have left
 * the sentence describing the old subset. It says what IS missing in the report in front of it.
 */
export function notProbedLine(report) {
  const missing = [];
  if (!report?.engine?.capabilities) missing.push('Capability packs');
  const citations = report?.engine?.docs?.citations;
  if (report?.engine?.docs && (citations === null || citations === undefined)) {
    missing.push('citation counts');
  }
  if (missing.length === 0) return null;
  const subject = missing.join(' and ');
  return `${subject} ${missing.length > 1 ? 'are' : 'is'} not probed on a quick run`
    + ' — ./snowarch doctor reports them.';
}

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
 * `E-10 FAIL settings.local toggles match the recorded mode: mode is live but servicenow is disabled`
 *
 * One line per check a reader needs to act on: which one, and what it said. It lives in the
 * doctor's own renderer because all three of its readers are renderers — B09's install summary
 * (ARC-06), the upgrade report's U7 block (ARC-09-C46) and `./snowarch status`'s panel
 * (ARC-08-C18). It was in `steps/B09.mjs` while B09 was its only caller.
 *
 * FAILS FIRST, then warnings, rather than in report order: a reader scanning for the thing that
 * stopped them should not have to pass three warnings to reach it.
 *
 * The status is read off the check instead of being written into the template, so the two views
 * below are ONE implementation. A second copy of a sentence is the thing this repository keeps
 * removing; U7 (ARC-09-C46) was the second reader and the status panel is the third.
 */
export function nonOkLines(parsed, statuses = ['fail', 'warn']) {
  const checks = parsed?.checks ?? [];
  return statuses.flatMap((status) => checks
    .filter((c) => c.status === status)
    .map((c) => `${c.id} ${status.toUpperCase()} ${c.title}${c.detail ? `: ${c.detail}` : ''}`
      + (c.remedy ? ` — ${c.remedy}` : '')));
}

/** FAILs alone — what B09's summary block carries. Its output is unchanged by the above. */
export const failureLines = (parsed) => nonOkLines(parsed, ['fail']);

/**
 * The panel.
 *
 * The Mode line is FIRST and printed unchanged: `report.modeLineDetailed` is `doctor/mode.mjs`'s
 * one definition, quoted here exactly as the banner and `./snowarch mode` quote it. This renderer
 * adds a reader and never a second spelling — the day it re-derived that line would be the day two
 * surfaces could disagree about whether the checkout is live.
 *
 * FAILs are listed one per line with their remedy; warnings are NOT. `./snowarch doctor` is where a
 * reader goes for those, and the panel saying so in its own Doctor line is the whole handover. The
 * list is `failureLines`, the ARC-09-C46 renderer, so the panel, B09's install summary and the
 * upgrade's report print a failing check identically.
 */
export function renderPanel(report) {
  const lines = [
    report?.modeLineDetailed ?? null,
    engineLine(report?.engine),
    docsLine(report?.engine?.docs),
    rosterLine(report?.engine?.roster),
    capabilitiesLine(report?.engine?.capabilities),
    instancesLine(report?.server),
    doctorLine(report),
    // A line whose key is null is OMITTED, never guessed — the rule SKILL.md stated and a model
    // applied by hand. `filter` is that rule, in one place, for all seven.
  ].filter((line) => line !== null && line !== undefined);

  const failures = failureLines(report);
  if (failures.length > 0) lines.push(...failures);
  if ((report?.summary?.fixable ?? 0) > 0) {
    lines.push(`Run ./snowarch doctor --fix for the fixable ones (${report.summary.fixable}).`);
  }

  const notProbed = notProbedLine(report);
  if (notProbed) lines.push(notProbed);

  return lines.join('\n');
}
