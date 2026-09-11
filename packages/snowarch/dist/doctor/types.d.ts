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
export declare const CHECK_IDS: readonly ["SV-00", "SV-01", "SV-02", "SV-03", "SV-04", "SV-05", "SV-06", "SV-07", "SV-08", "SV-09"];
export type CheckId = typeof CHECK_IDS[number];
export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';
export interface CheckResult {
    id: CheckId;
    title: string;
    status: CheckStatus;
    /** One line. The RUNNER redacts it (ARC-08-S01) — a check that redacted itself could forget. */
    detail: string;
    /**
     * What to do about it. Absent when there is nothing to do — and NEVER set beside `code`: the
     * remedy for a code is the contract's, and two would be two answers to one question.
     */
    remedy?: string;
    /** A runnable command, when one exists. Rendered as code; never parsed out of `remedy`. */
    command?: string;
    /** An error code from the contract registry. Supplies `remedy`/`command` when set. */
    code?: string;
    /** Structured extras for `--json`. Every string leaf is redacted by the runner. */
    data?: Record<string, unknown>;
    /** Filled by the runner, never by the check. */
    durationMs?: number;
    /**
     * ARC-08-S06 owns `--fix`; ARC-08-S01 widened this from `false` to `boolean` because SV-01,
     * SV-02 and SV-03 become fixable there. Optional, so ARC-04-S12's own results still typecheck.
     */
    fixable?: boolean;
}
export interface CheckContext {
    /** `--no-network` was passed, or the runner is otherwise offline. */
    noNetwork: boolean;
    /** The directory to walk up from for SV-08. Injected so tests need no real checkout. */
    cwd: string;
    probes: Probes;
    /**
     * The SDK resolver (ARC-07-S03's `checkFluent`), injected so a test never spawns `npm root -g`.
     * Absent means the real one — a check that required its injection would be a check nobody could
     * run in production.
     */
    fluent?: () => {
        installed: boolean;
        where?: string;
    };
    /**
     * The store as the FILE holds it, injected for the same reason `fluent` is. SV-03 asks it which
     * flags an entry actually states — the loaded runtime has had every absent one filled in.
     */
    storeEntry?: (label: string) => {
        flags?: Record<string, string | undefined>;
    } | undefined;
}
export interface Check {
    id: CheckId;
    title: string;
    /** The severity a FAILING result carries. `warn` checks never return `fail`. */
    severity: 'fail' | 'warn' | 'info';
    /** True when the check contacts the instance — `--no-network` skips these. */
    network: boolean;
    /**
     * ARC-08-S01's three filtering flags, optional so ARC-04-S12's checks compile unchanged.
     *
     * They are OPTIONAL here and REQUIRED in the engine's registry, and that asymmetry is deliberate:
     * a server check reaches the engine's runner through ARC-08-S04, which supplies the defaults it
     * knows (a server check spawns nothing and is never in the quick subset), while a check written
     * directly against the engine's registry must declare them — the failure mode of an undeclared
     * `network` is a doctor that touched the network on a machine that has none.
     */
    quick?: boolean;
    spawns?: boolean;
    fixable?: boolean;
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
    runAll(instanceLabel: string): Promise<{
        status: CheckStatus;
        detail: string;
        remedy?: string;
        /**
         * A contract code, when the probe recognised one (`OAUTH_ROPC_DISABLED` and its family).
         * Widened by ARC-08-S04: the remedy for a code is the REGISTRY's, and a probe that carried its
         * own alongside would be a second answer to one question — so a result with a code carries no
         * remedy, and the runner fills it.
         */
        code?: string;
        data?: Record<string, unknown>;
    }>;
}
/**
 * Returns `skip`, always — the shape the doctor binds when no instance is configured.
 *
 * ARC-07-S03 supplies the real implementation (`probeAll`, exported as `@farstic/snowarch/probes`);
 * ARC-08-S04 is where the doctor chooses to bind it, because that is the story that owns what the
 * doctor RENDERS. This stub stays as the unconfigured answer rather than being deleted: "there is
 * no instance to probe" is a real state, and `skip` is its honest report.
 */
export declare const stubProbes: Probes;
export interface DoctorReport {
    product: 'snowarch';
    version: string;
    ranAt: string;
    mode: 'unconfigured' | 'configured';
    checks: CheckResult[];
    summary: {
        ok: number;
        warn: number;
        fail: number;
        skip: number;
    };
    instances: Array<{
        label: string;
        environment: string;
        preset: string;
        status: 'loaded' | 'not_loaded';
        /** Masked at the source (ARC-08-S04) — `s***@corp.example.com`, never the account. */
        username?: string;
        /** The store's own record. STATUSES ONLY; the doctor reads it and never writes it. */
        lastProbe?: unknown;
        reason?: string;
    }>;
}
