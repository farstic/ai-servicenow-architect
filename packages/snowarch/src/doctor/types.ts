/**
 * The registry contract, shared with ARC-08's unified doctor.
 *
 * Two doctors exist by design: this one owns the checks only the server package can perform —
 * the store's schema and modes, the flag rules, a real stdio handshake against itself — and
 * ARC-08's owns the engine's. The alternative was ARC-08 re-implementing the flag rules in a
 * second language, which is P-16: two implementations of one rule diverge, and the one users
 * see is the one that is wrong.
 *
 * Ids are `SV-xx` from the first commit. `01` §8 called them `S-xx`, which collides with the
 * spike ids `S-01`…`S-26` in `03`, and ARC-08-S01 had a planned rename step to fix that later.
 * Shipping the final ids now makes that step a no-op, and they live in ONE exported constant so
 * a future re-home is a single line.
 */
export const CHECK_IDS = [
  'SV-00', 'SV-01', 'SV-02', 'SV-03', 'SV-04', 'SV-05', 'SV-06', 'SV-07', 'SV-08',
] as const;

export type CheckId = typeof CHECK_IDS[number];

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
  id: CheckId;
  title: string;
  status: CheckStatus;
  /** One line, already redacted: no secret values, no clear usernames, masked paths. */
  detail: string;
  /** What to do about it. Absent when there is nothing to do. */
  remedy?: string;
  /**
   * Always false in this story. ARC-08 owns `--fix`; the field exists now so the JSON shape it
   * consumes does not change under it later.
   */
  fixable: false;
}

export interface CheckContext {
  /** `--no-network` was passed, or the runner is otherwise offline. */
  noNetwork: boolean;
  /** The directory to walk up from for SV-08. Injected so tests need no real checkout. */
  cwd: string;
  probes: Probes;
}

export interface Check {
  id: CheckId;
  title: string;
  /** The severity a FAILING result carries. `warn` checks never return `fail`. */
  severity: 'fail' | 'warn' | 'info';
  /** True when the check contacts the instance — `--no-network` skips these. */
  network: boolean;
  run(ctx: CheckContext): Promise<CheckResult>;
}

/**
 * The auth and capability probes, declared here and implemented by ARC-07-S03.
 *
 * Declared rather than deferred so SV-04 exists in the report from day one with an honest
 * `skip` and a reason. A check that is simply absent until a later story reads as a check that
 * passed.
 */
export interface Probes {
  runAll(instanceLabel: string): Promise<{ status: CheckStatus; detail: string; remedy?: string }>;
}

/** Returns `skip`, always, naming the story that will replace it. */
export const stubProbes: Probes = {
  async runAll() {
    return {
      status: 'skip',
      detail: 'network probes are not implemented yet',
      remedy: 'ARC-07-S03 supplies the probes; until then run ./snowarch instance test',
    };
  },
};

export interface DoctorReport {
  product: 'snowarch';
  version: string;
  ranAt: string;
  mode: 'unconfigured' | 'configured';
  checks: CheckResult[];
  summary: { ok: number; warn: number; fail: number; skip: number };
  instances: Array<{
    label: string;
    environment: string;
    preset: string;
    status: 'loaded' | 'not_loaded';
    reason?: string;
  }>;
}
