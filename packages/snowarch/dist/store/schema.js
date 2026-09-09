/**
 * The store schema, version 1 — exactly `01` §7.
 *
 * Two shapes are refused deliberately, because both look right and behave wrong:
 *
 *  - `flags` values are the literal STRINGS "true" / "false", never booleans. The env
 *    path compares byte-exactly against "true", so a JSON boolean would read as absent
 *    and silently disable a write flag the user believes they enabled.
 *  - `auth.method` is `basic | oauth_ropc`. `client_credentials` is roadmap: accepting it
 *    would store a client id and secret the client code has no branch to use.
 */
import { z } from 'zod';
export const STORE_VERSION = 1;
export const FLAG_NAMES = [
    'WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED',
    'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED',
];
const flagValue = z.enum(['true', 'false'], {
    errorMap: () => ({ message: 'must be the string "true" or "false"' }),
});
// A bare https origin: no path, no query, no trailing slash. A trailing slash produces
// `https://x//api/now/...` on join, which some proxies reject and others silently rewrite.
const instanceUrl = z.string().refine((v) => {
    let u;
    try {
        u = new URL(v);
    }
    catch {
        return false;
    }
    return u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash && !v.endsWith('/');
}, { message: 'must be a bare https:// origin with no path or trailing slash' });
const label = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/, 'must match ^[a-z][a-z0-9_-]{0,31}$');
const authBasic = z.object({
    method: z.literal('basic'),
    username: z.string().min(1),
    password: z.string().min(1),
});
const authOauthRopc = z.object({
    method: z.literal('oauth_ropc'),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
});
// discriminatedUnion so the error names `auth.method` rather than listing both branches.
const auth = z.discriminatedUnion('method', [authBasic, authOauthRopc], {
    errorMap: (issue, ctx) => issue.code === z.ZodIssueCode.invalid_union_discriminator
        ? { message: 'must be "basic" or "oauth_ropc"' }
        : { message: ctx.defaultError },
});
export const instanceSchema = z.object({
    url: instanceUrl,
    environment: z.enum(['pdi', 'dev', 'test', 'prod']),
    auth,
    preset: z.enum(['read-only', 'pdi-developer', 'full', 'custom']),
    // Fewer than six is allowed; the loader fills the gaps with "false" and warns
    // FLAGS_INCOMPLETE so the doctor can offer --fix.
    flags: z.record(z.enum(FLAG_NAMES), flagValue).default({}),
    toolPackage: z.enum(['full']).default('full'),
    maxRecords: z.number().int().min(1).max(1000).default(100),
    prodWriteAck: z.boolean().default(false),
    // passthrough: ARC-07-S03 adds probe keys without a schema version bump.
    lastProbe: z.object({ at: z.string() }).passthrough().optional(),
}).strict();
export const storeSchema = z.object({
    version: z.literal(STORE_VERSION),
    defaultInstance: label.optional(),
    instances: z.record(label, instanceSchema),
}).strict();
/** `instances.pdi.flags.WRITE_ENABLED` — the path a user can find in their own file. */
export function issuePath(issue) {
    return issue.path.join('.');
}
/**
 * Version first, and separately from the schema: a store written by a newer server is a
 * different failure from a malformed one, and the remedy is an upgrade, not an edit.
 */
export function parseStore(raw) {
    if (raw && typeof raw === 'object' && 'version' in raw) {
        const v = raw.version;
        if (typeof v === 'number' && v !== STORE_VERSION) {
            return { error: { code: 'STORE_SCHEMA_UNSUPPORTED',
                    message: `store version ${v} is ${v > STORE_VERSION ? 'newer than' : 'older than'} this server (supports ${STORE_VERSION}) — run ./snowarch upgrade` } };
        }
    }
    const parsed = storeSchema.safeParse(raw);
    if (parsed.success)
        return { store: parsed.data };
    const first = parsed.error.issues[0];
    return { error: { code: 'STORE_SCHEMA_INVALID', message: `${issuePath(first)} ${first.message}` } };
}
/** Absent flags read as "false" — the same semantics the env path has always had. */
export function completeFlags(flags) {
    const out = {};
    for (const name of FLAG_NAMES)
        out[name] = flags[name] ?? 'false';
    return out;
}
