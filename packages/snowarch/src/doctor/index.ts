/**
 * The server doctor: run every check, return one JSON object, print one line each.
 *
 * ARC-08 imports `runServerDoctor` through the package `exports` map and merges this report
 * with its engine checks. That hand-off is the reason the runner returns data rather than
 * printing: a doctor that only prints has to be re-implemented to be composed.
 */
import { instanceManager } from '../servicenow/instances.js';
import { getPackageVersion } from '../utils/version.js';
import { ALL_CHECKS, resetHandshakeCache } from './checks.js';
import { stubProbes, type CheckResult, type DoctorReport, type Probes } from './types.js';

export * from './types.js';
export { ALL_CHECKS, pollutingAncestors, resetHandshakeCache } from './checks.js';

export interface DoctorOptions {
  noNetwork?: boolean;
  cwd?: string;
  probes?: Probes;
  /** Reserved for ARC-08's merged report; only `server` exists today. */
  section?: 'server';
}

export async function runServerDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  resetHandshakeCache();
  // The store is read once, here, so every check sees the same state. Re-reading per check
  // would let a report contradict itself if a file changed mid-run — rare, but the resulting
  // "SV-02 ok, SV-03 fail" is the kind of output nobody can act on.
  instanceManager.reload();

  const ctx = {
    noNetwork: opts.noNetwork === true,
    cwd: opts.cwd ?? process.cwd(),
    probes: opts.probes ?? stubProbes,
  };

  const checks: CheckResult[] = [];
  for (const check of ALL_CHECKS) {
    try {
      checks.push(await check.run(ctx));
    } catch (e) {
      // A check that throws is a defect in the doctor, not in the installation — and reporting
      // it as a failed check would send the user to fix their machine. Named as such.
      checks.push({
        id: check.id,
        title: check.title,
        status: 'fail',
        detail: `the check itself threw: ${(e as Error).message}`,
        remedy: 'this is a defect in snowarch; please report it with this line',
        fixable: false,
      });
    }
  }

  const summary = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) summary[c.status] += 1;

  return {
    product: 'snowarch',
    version: getPackageVersion(),
    ranAt: new Date().toISOString(),
    mode: instanceManager.loadedCount() > 0 ? 'configured' : 'unconfigured',
    checks,
    summary,
    instances: instanceManager.listAll().map((i) => ({
      label: i.name,
      environment: i.environment,
      preset: i.preset,
      status: i.status,
      ...(i.reason ? { reason: i.reason } : {}),
    })),
  };
}

/** 0 = nothing failed, 1 = at least one FAIL, 3 = the run itself could not complete. */
export function exitCodeFor(report: DoctorReport): 0 | 1 | 3 {
  return report.summary.fail > 0 ? 1 : 0;
}

/** The human rendering: one aligned line per check, then a summary. */
export function formatReport(report: DoctorReport): string {
  const lines = report.checks.map((c) => {
    const status = c.status.padEnd(4);
    const remedy = c.remedy ? `\n            → ${c.remedy}` : '';
    return `${c.id} ${status} ${c.detail}${remedy}`;
  });
  const s = report.summary;
  lines.push('');
  lines.push(`SERVER DOCTOR: ${s.ok} ok, ${s.warn} warn, ${s.fail} fail, ${s.skip} skip `
    + `(mode: ${report.mode})`);
  return `${lines.join('\n')}\n`;
}
