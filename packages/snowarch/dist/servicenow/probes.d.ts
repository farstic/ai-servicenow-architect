import { type FlagName } from '../utils/permissions.js';
/**
 * The sentence every review screen prints ONCE, above the probe lines.
 *
 * A probe proves the account can READ the table family a flag unlocks. It does not prove a write
 * will be allowed: ServiceNow evaluates write ACLs per call, per record, and a probe that implied
 * otherwise would be the wizard promising something the instance has not agreed to.
 */
export declare const HONESTY_NOTE = "Probes confirm the account can reach each table family; write ACLs are still evaluated per call.";
export type ProbeStatus = 'ok' | 'auth failed' | 'role missing' | 'unreachable' | 'error' | 'not licensed' | 'not installed' | 'skipped';
export interface AuthProbe {
    status: ProbeStatus;
    code?: string;
    httpStatus?: number;
    roles?: string[];
    hint?: string;
    detail?: string;
}
export interface CapabilityProbe {
    flag: FlagName;
    status: ProbeStatus;
    detail: string;
}
export interface LastProbe {
    at: string;
    auth: ProbeStatus;
    write: ProbeStatus;
    scripting: ProbeStatus;
    cmdb: ProbeStatus;
    atf: ProbeStatus;
    nowAssist: ProbeStatus;
    fluent: ProbeStatus;
}
/** What a probe needs of a client. `ServiceNowClient` satisfies it; a fake can too. */
export interface ProbeClient {
    queryRecords(params: {
        table: string;
        query?: string;
        fields?: string;
        limit?: number;
    }): Promise<{
        count: number;
        records: unknown[];
    }>;
}
/** The 403 hint, spelled once: the account is real, the role is not. */
export declare const ROLE_MISSING_HINT: string;
export declare const ROLES_UNREADABLE_HINT = "could not read roles";
/**
 * ServiceNow's OAuth error bodies, as DATA.
 *
 * RFC 6749 §5.2 names these; what a given instance actually returns is CAPTURED, not assumed —
 * ARC-07-S11 records the real texts from a PDI with the hardening property toggled and fills
 * `tests/fixtures/oauth-ropc-errors.json`. Until then this table is the RFC's names, and anything
 * unrecognised falls through to `auth failed` with the raw value in `detail` rather than being
 * guessed at.
 */
export declare const ROPC_ERROR_TABLE: ReadonlyArray<{
    error: string;
    status: ProbeStatus;
    code?: string;
    hint?: string;
}>;
/** The token response this probe understands. Nothing is stored from it. */
export interface TokenResult {
    ok: boolean;
    error?: string;
    httpStatus?: number;
}
/**
 * Prove the credentials. One request; on 401, never a second.
 *
 * The 403 path is its own status rather than a failure: on a hardened instance the login is
 * correct and the REST ACL is not, and telling that user their password is wrong sends them to
 * change a password that works.
 */
export declare function probeAuth(client: ProbeClient, { username, authMethod, tokenProbe, env, }?: {
    username?: string;
    authMethod?: 'basic' | 'oauth_ropc';
    tokenProbe?: () => Promise<TokenResult>;
    env?: NodeJS.ProcessEnv;
}): Promise<AuthProbe>;
/** The table each flag's probe reads, and what "ok" means for it. Keyed by `FLAG_NAMES`. */
export declare const CAPABILITY_TABLE: Readonly<Record<FlagName, {
    table?: string;
    query?: string;
    /** True when a 200 with zero rows is NOT ok — the rows are the evidence. */
    needsRows?: boolean;
    local?: 'fluent';
    emptyStatus?: ProbeStatus;
    emptyDetail?: string;
}>>;
export interface FluentCheck {
    installed: boolean;
    where?: string;
    version?: string;
}
/**
 * Is `@servicenow/sdk` on this machine — in the checkout, or installed globally?
 *
 * The global lookup spawns `npm root -g`, and on Windows `npm` is a `.cmd`: since Node 20.12
 * `child_process` refuses to spawn one without a shell, so the executable is LOCATED on PATH
 * first and a `.cmd` is run through `cmd /c`. Bare `spawn('npm')` looked like it worked
 * everywhere right up until it did not, on the one platform nobody develops on.
 *
 * The spawn is injected, so CI never runs the real `npm root -g` — which would be a network-shaped
 * dependency in a unit test and slow on every cell.
 */
export declare function checkFluent({ from, runNpm, exists, }?: Partial<{
    from: string;
    runNpm: () => string | null;
    exists: (p: string) => boolean;
}>): FluentCheck;
/** One capability. Read-only, one request, and `skipped` is never inferred here. */
export declare function probeCapability(client: ProbeClient, flag: FlagName, { env, fluent, }?: Partial<{
    env: NodeJS.ProcessEnv;
    fluent: typeof checkFluent;
}>): Promise<CapabilityProbe>;
export interface ProbeAll {
    auth: AuthProbe;
    capabilities: CapabilityProbe[];
}
/**
 * Auth first; capabilities only if it passed.
 *
 * A capability probe against an instance that just refused the login tells you nothing you did not
 * already know and spends five more requests finding it out — on the same account, moments after
 * a failed authentication.
 */
export declare function probeAll(client: ProbeClient, { username, authMethod, tokenProbe, env, fluent, now, }?: Partial<{
    username: string;
    authMethod: 'basic' | 'oauth_ropc';
    tokenProbe: () => Promise<TokenResult>;
    env: NodeJS.ProcessEnv;
    fluent: typeof checkFluent;
    now: () => Date;
}>): Promise<ProbeAll & {
    at: string;
}>;
/**
 * The store shape.
 *
 * STATUSES ONLY. No username, no role list, no hint text — the store is read by the banner, the
 * doctor and `/snowarch status`, and a probe record that carried an account name would put it in
 * every one of them.
 */
export declare function toLastProbe(result: ProbeAll & {
    at: string;
}): LastProbe;
