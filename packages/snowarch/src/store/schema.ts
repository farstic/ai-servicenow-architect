// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
import { cliSpelling } from '../cli/tty.js';

export const STORE_VERSION = 1;

export const FLAG_NAMES = [
  'WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED',
  'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

const flagValue = z.enum(['true', 'false'], {
  errorMap: () => ({ message: 'must be the string "true" or "false"' }),
});

// A bare https origin: no path, no query, no trailing slash. A trailing slash produces
// `https://x//api/now/...` on join, which some proxies reject and others silently rewrite.
const instanceUrl = z.string().refine((v) => {
  let u: URL;
  try { u = new URL(v); } catch { return false; }
  return u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash && !v.endsWith('/');
}, { message: 'must be a bare https:// origin with no path or trailing slash' });

/** What an instance label, and the default instance, must look like. Also what tells a label from the text of a broken file (see `issuePath`). */
const LABEL_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const label = z.string().regex(LABEL_PATTERN,
  'must match ^[a-z][a-z0-9_-]{0,31}$');

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

export type StoreInstance = z.infer<typeof instanceSchema>;
export type Store = z.infer<typeof storeSchema>;

export interface StoreError {
  code: 'STORE_NOT_FOUND' | 'STORE_UNREADABLE' | 'STORE_SCHEMA_INVALID'
      | 'STORE_SCHEMA_OUTDATED' | 'STORE_SCHEMA_NEWER' | 'STORE_PERMISSIONS_TOO_OPEN';
  message: string;
}

/**
 * Every field name a store can have: the places a path may name without saying anything of the file. Derived from the schemas, so that a field
 * added to one is a name here; `at` is the one a passthrough object (`lastProbe`) is known by.
 */
const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  ...Object.keys(storeSchema.shape), ...Object.keys(instanceSchema.shape),
  ...Object.keys(authBasic.shape), ...Object.keys(authOauthRopc.shape), 'at', ...FLAG_NAMES,
]);

/** `<key>`: where a path would carry a name that is the file's own and not the schema's. */
const UNNAMED = '<key>';

/**
 * `instances.pdi.flags.WRITE_ENABLED`, in backticks: the path a user can find in their own file, or nothing for the
 * store's root.
 *
 * ARC-09-C211 — IN BACKTICKS, because a bare `word.word` is what the engine's printer masks as a person's first.last:
 * the doctor's SV-02 printed "instances.pdi Unrecognized key(s) …" as "i***.p*** …". A key in backticks is left alone.
 *
 * ARC-09-C307 — AND NOTHING OF THE FILE IN IT BUT WHAT THE SCHEMA NAMES. A path through a record carries the record's key: the label of an
 * instance, the name of a flag. A label that is a label (`^[a-z][a-z0-9_-]{0,31}$`: what `instance list` prints, and what the instance that is
 * wrong is called) stays; every other name the file chose, which can be a password pasted where a name goes, is `<key>`. A name the schema
 * knows stays.
 */
export function issuePath(issue: z.ZodIssue): string {
  const path = issue.path.map((segment, index) => {
    if (typeof segment === 'number') return String(segment);
    if (index === 1 && issue.path[0] === 'instances') return LABEL_PATTERN.test(segment) ? segment : UNNAMED;
    return KNOWN_FIELDS.has(segment) ? segment : UNNAMED;
  }).join('.');
  return path ? `\`${path}\`` : '';
}

/**
 * The two sentences zod writes with what the file held in them (ARC-09-C307, the architect's ruling of 2026-11-22), without it. A value that
 * is not one of the allowed ones is `Invalid enum value. Expected 'a' | 'b', received '<the value>'`, and an unknown field
 * `Unrecognized key(s) in object: '<its name>'`: a store holds passwords, and either can be one. Everything else zod says is about the shape
 * (a type's name, a size, a pattern, a text this file's schema wrote) and is left as it is, including the schema's own words for a flag.
 */
const contentFree: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === z.ZodIssueCode.unrecognized_keys) return { message: 'Unrecognized key(s) in object' };
  if (issue.code === z.ZodIssueCode.invalid_enum_value && ctx.defaultError.includes(', received ')) {
    return { message: `Invalid enum value. Expected ${issue.options.map((o) => (typeof o === 'string' ? `'${o}'` : String(o))).join(' | ')}` };
  }
  return { message: ctx.defaultError };
};

/**
 * Version first, and separately from the schema: a store written by a different server is a
 * different failure from a malformed one, and the remedy is a command, not an edit.
 *
 * TWO codes, not one (ARC-09-S06). `STORE_SCHEMA_UNSUPPORTED` said "run ./snowarch upgrade" in
 * both directions, which is right for a store from the future and wrong — actively misleading —
 * for one from the past: upgrading the checkout that already reads the newer schema does nothing
 * at all, and the file the user needed to migrate sits there through it. The two directions have
 * two remedies and now say so.
 */
/**
 * ARC-07-C31 slice 3 — A DEFAULT IS ALLOWED: exactly one product caller, `store/index.ts:94`.
 */
export function parseStore(raw: unknown,
  cli: string = cliSpelling()): { store: Store } | { error: StoreError } {
  if (raw && typeof raw === 'object' && 'version' in raw) {
    const v = (raw as { version: unknown }).version;
    if (typeof v === 'number' && v !== STORE_VERSION) {
      return v > STORE_VERSION
        ? { error: { code: 'STORE_SCHEMA_NEWER',
          message: `store schema ${v} is newer than this server supports (${STORE_VERSION}) — `
            + `run ${cli} upgrade, or restore a backup (${cli} store backups)` } }
        : { error: { code: 'STORE_SCHEMA_OUTDATED',
          message: `store schema ${v} is older than this server (${STORE_VERSION}) — `
            + `run ${cli} store migrate` } };
    }
  }
  const parsed = storeSchema.safeParse(raw, { errorMap: contentFree });
  if (parsed.success) return { store: parsed.data };
  const first = parsed.error.issues[0];
  return { error: { code: 'STORE_SCHEMA_INVALID',
    message: [issuePath(first), first.message].filter(Boolean).join(' ') } };
}

/** Absent flags read as "false" — the same semantics the env path has always had. */
export function completeFlags(flags: Partial<Record<FlagName, 'true' | 'false'>>): Record<FlagName, 'true' | 'false'> {
  const out = {} as Record<FlagName, 'true' | 'false'>;
  for (const name of FLAG_NAMES) out[name] = flags[name] ?? 'false';
  return out;
}
