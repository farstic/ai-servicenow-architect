// ARC-08-S01 — the runner: filter, run, time, redact, count.
//
// Three promises live here rather than in any check:
//
//   EVERY SELECTED CHECK RUNS. One that throws becomes a `fail` carrying its message; one that
//   hangs becomes a `fail` saying so after its timeout. A doctor that aborted on the first bad
//   answer would report a checkout as healthy up to the point where it stopped looking, which is
//   the worst possible half-truth to hand somebody debugging.
//
//   NOTHING REACHES THE OUTPUT UNREDACTED. The redaction pass is applied HERE, to every result,
//   so a check cannot forget it.
//
//   A CODE'S REMEDY COMES FROM THE CONTRACT. A check that sets `code` gets the registry's remedy
//   and command; one that sets both `code` and its own `remedy` is a second opinion about what to
//   do, and the runner refuses it rather than silently preferring one.
import { remedyFor } from '../../../../packages/contract/lib/contract.mjs';

import { redactResult } from './redact.mjs';
import { isServerCheck, SECTIONS } from './registry.mjs';

export const DEFAULT_TIMEOUT_MS = 15_000;
export const NETWORK_TIMEOUT_MS = 20_000;

/** `--section a,b`. `server` means every `SV-` check, whatever section they declare. */
export function selectSections(requested) {
  if (!requested) return null;
  const names = String(requested).split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !SECTIONS.includes(n));
  return { names, unknown };
}

/**
 * Which checks this run performs, and why the others do not.
 *
 * `--quick` is `quick && !spawns && !network`: a check that spawns a process is not quick however
 * fast it is, because the cost being avoided is the process, not the milliseconds.
 */
export function planRun(checks, { quick = false, noNetwork = false, sections = null } = {}) {
  const selected = [];
  const skipped = [];
  for (const check of checks) {
    const inSection = sections === null
      || sections.includes(check.section)
      || (sections.includes('server') && isServerCheck(check.id));
    if (!inSection) { skipped.push({ check, reason: 'not in --section' }); continue; }
    if (quick && (!check.quick || check.spawns || check.network)) {
      skipped.push({ check, reason: 'not in the --quick subset' });
      continue;
    }
    if ((noNetwork || quick) && check.network) {
      skipped.push({ check, reason: '--no-network' });
      continue;
    }
    selected.push(check);
  }
  return { selected, skipped };
}

const timeoutFor = (check) => (check.network ? NETWORK_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

/** One check, run defensively: never throws, always timed, always shaped like a CheckResult. */
async function runOne(check, ctx, now) {
  const started = now();
  const budget = timeoutFor(check);
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve(check.run(ctx)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(budget / 1000)} s`)),
          budget);
        // An unref'd timer does not keep the process alive if every check has already answered.
        if (typeof timer?.unref === 'function') timer.unref();
      }),
    ]);
    return { ...result, id: check.id, durationMs: now() - started };
  } catch (e) {
    const message = e?.message ?? String(e);
    return {
      id: check.id,
      status: 'fail',
      // "timed out" is a fact about the check; "check crashed" is a fact about the code. A reader
      // needs to tell them apart, so the two messages are different from each other.
      detail: /^timed out after/.test(message) ? message : `check crashed: ${message}`,
      durationMs: now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fill `remedy`/`command` from the contract when the check named a `code`.
 *
 * `docs/TROUBLESHOOTING.md` is generated from the same entries, so a doctor's remedy and the
 * troubleshooting page cannot disagree — they are the same string. A check that hand-wrote one
 * beside a code is the drift this prevents, and it throws in tests rather than quietly winning.
 */
export function applyContractRemedy(result, contract) {
  if (!result.code) return result;
  if (result.remedy !== undefined) {
    throw new Error(`${result.id}: a check may set \`code\` or \`remedy\`, not both — `
      + 'the remedy for a code is the contract\'s');
  }
  const entry = contract ? remedyFor(contract, result.code) : undefined;
  if (!entry) return result;
  return {
    ...result,
    remedy: entry.remedy,
    ...(entry.command ? { command: entry.command } : {}),
  };
}

/** Tally, in the order a reader counts them. `fixable` counts results, not checks. */
export function summarise(results, checks) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const summary = { ok: 0, warn: 0, fail: 0, skip: 0, fixable: 0 };
  for (const r of results) {
    summary[r.status] = (summary[r.status] ?? 0) + 1;
    const fixable = r.fixable ?? byId.get(r.id)?.fixable ?? false;
    if (fixable && (r.status === 'fail' || r.status === 'warn')) summary.fixable += 1;
  }
  return summary;
}

/**
 * The whole run. Sequential within the plan, because two checks writing interleaved lines produce
 * a report whose order changes between runs — and a report you cannot diff is a report nobody
 * compares.
 */
export async function runChecks(checks, ctx, options = {}) {
  const now = options.now ?? (() => Date.now());
  const { selected, skipped } = planRun(checks, options);
  const results = [];

  for (const check of selected) {
    const raw = await runOne(check, ctx, now);
    results.push(redactResult(applyContractRemedy(raw, ctx?.contract ?? null), options));
  }
  for (const { check, reason } of skipped) {
    results.push({ id: check.id, status: 'skip', detail: reason, durationMs: 0 });
  }

  // Report order is registry order, whatever order the run took.
  const order = new Map(checks.map((c, i) => [c.id, i]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { results, summary: summarise(results, checks) };
}

/** 0 no FAIL · 1 at least one FAIL. (2 usage and 3 cannot-run belong to the command.) */
export const exitCodeFor = (summary) => (summary.fail > 0 ? 1 : 0);
