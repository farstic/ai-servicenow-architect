import { type DoctorReport, type Probes } from './types.js';
export * from './types.js';
export { ALL_CHECKS, pollutingAncestors, resetHandshakeCache } from './checks.js';
export interface DoctorOptions {
    noNetwork?: boolean;
    cwd?: string;
    probes?: Probes;
    /** Reserved for ARC-08's merged report; only `server` exists today. */
    section?: 'server';
}
export declare function runServerDoctor(opts?: DoctorOptions): Promise<DoctorReport>;
/** 0 = nothing failed, 1 = at least one FAIL, 3 = the run itself could not complete. */
export declare function exitCodeFor(report: DoctorReport): 0 | 1 | 3;
/** The human rendering: one aligned line per check, then a summary. */
export declare function formatReport(report: DoctorReport): string;
