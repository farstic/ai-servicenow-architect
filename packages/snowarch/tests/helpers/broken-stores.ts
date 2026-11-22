// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C307 — stores that exist and do not load, planted the same way for every test that asks what a writer does with one.
 *
 * A store that exists but cannot be read, parsed or migrated used to be read by `instance add`, `instance add --replace`, the 1.x
 * import and the installer as an EMPTY one, and was then saved over, without a backup: every saved instance and password gone. Each
 * test of this row plants each of these and asks the same four things of the path under test: it refuses, it names the store's own
 * error, it leaves the file byte-identical (and its mode, and the folder around it), and it has asked and probed nothing before it did.
 * And a fifth, for the plants that hold the secret-like string (`holdsSecret`): nothing the file held is in what was said. The string sits where
 * a parser quotes it: at the start of a file that is not JSON, as the value of a field that has a list of allowed values, as the name of a field
 * the schema does not know, as an instance label, as a flag name. A parser's own sentence quotes the value it was given and the key it did not
 * know; a store of passwords is not a file whose contents belong in a terminal, a log or a bug report.
 *
 * Every secret here is assembled, never spelled.
 */
import { chmodSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

export const IS_WINDOWS = process.platform === 'win32';
/** Root reads a file whose mode is 000, so the plant that needs the refusal of the OS cannot be made under it. */
export const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

/** A secret-like string the broken store BEGINS with: the first characters of a file are what V8's parse message quotes. */
export const SECRET_LIKE = ['sk', 'live', 'q7Zr', '4491xv'].join('-');
/** A password that sits in the readable stores below, so that "a store it could read" and "a store it could not" differ in what a leak would show. */
export const STORED_PASSWORD = ['pw', 'stored', '8821'].join('-');

/** A store this build reads, with one saved instance and its password. */
export const validStore = (version: number = 1): Record<string, unknown> => ({
  version,
  defaultInstance: 'keep',
  instances: {
    keep: {
      url: 'https://dev55555.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'kept.user', password: STORED_PASSWORD },
      preset: 'read-only',
      flags: {
        WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
        ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
      },
      toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    },
  },
});

export type PlantedCode = 'STORE_UNREADABLE' | 'STORE_PERMISSIONS_TOO_OPEN' | 'STORE_SCHEMA_NEWER' | 'STORE_SCHEMA_OUTDATED' | 'STORE_SCHEMA_INVALID';

export interface Plant {
  name: string;
  /** The store's own error: the one `loadStore` answers for this file. */
  code: PlantedCode;
  /** Cannot be made, or does not mean the same, where modes are ACL-inherited. */
  posixOnly: boolean;
  /** Cannot be made by root. */
  notRoot: boolean;
  /** What the file holds. */
  text: string;
  /** The mode it has when planted. */
  mode: number;
  /** The secret-like string is in the file: whatever a path prints, it must not be in it. */
  holdsSecret: boolean;
}

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

/** The saved instance of `validStore`. */
const keepEntry = (): Record<string, unknown> => (validStore().instances as Record<string, Record<string, unknown>>).keep!;
/** `validStore` with one thing in its instance changed or added. */
const keepWith = (over: Record<string, unknown>): Record<string, unknown> => ({ ...validStore(), instances: { keep: { ...keepEntry(), ...over } } });

export const PLANTS: readonly Plant[] = [
  // Begins with the secret-like string, and is cut off: what a hand edit or a failed write leaves.
  { name: 'unparseable', code: 'STORE_UNREADABLE', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: `${SECRET_LIKE} { "version": 1, "instances": { "keep": { "auth": { "password": "` },
  { name: 'unreadable (mode 000)', code: 'STORE_UNREADABLE', posixOnly: true, notRoot: true, mode: 0o000, holdsSecret: false, text: json(validStore()) },
  { name: 'too open (mode 0644)', code: 'STORE_PERMISSIONS_TOO_OPEN', posixOnly: true, notRoot: false, mode: 0o644, holdsSecret: false, text: json(validStore()) },
  { name: 'newer schema', code: 'STORE_SCHEMA_NEWER', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: false, text: json(validStore(99)) },
  { name: 'older schema', code: 'STORE_SCHEMA_OUTDATED', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: false, text: json(validStore(0)) },
  { name: 'wrong shape', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: false, text: json({ version: 1, instances: [] }) },

  // ── ARC-09-C307, the architect's ruling of 2026-11-22: a store that parses and has the wrong shape quotes none of what the file held ────────
  // A parser's sentence for a bad value is "Invalid enum value. Expected …, received '<the value>'", for an unknown field "Unrecognized key(s)
  // in object: '<its name>'", and a path through a record carries the record's key. The secret is each of those, in a store that is otherwise as
  // valid as `validStore`.
  { name: 'wrong value (the secret as the environment)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: json(keepWith({ environment: SECRET_LIKE })) },
  { name: 'wrong flag name (the secret as a flag)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: json(keepWith({ flags: { [SECRET_LIKE]: 'true' } })) },
  { name: 'unknown field (the secret as the name of a field of an instance)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: json(keepWith({ [SECRET_LIKE]: 'x' })) },
  { name: 'unknown field (the secret as the name of a field of the store)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: json({ ...validStore(), [SECRET_LIKE]: 'x' }) },
  { name: 'wrong label (the secret as the label of an instance)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: json({ version: 1, instances: { [SECRET_LIKE]: keepEntry() } }) },
  // Controls: the secret where the parser's own sentence was never about the value. They pass before and after, and show the check can pass.
  { name: 'control (the secret as the url)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: json(keepWith({ url: SECRET_LIKE })) },
  { name: 'control (the secret as the value of a flag)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: json(keepWith({ flags: { WRITE_ENABLED: SECRET_LIKE } })) },
  { name: 'control (the secret as the maximum of records)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: json(keepWith({ maxRecords: SECRET_LIKE })) },
  { name: 'control (a file that is only the secret, as a JSON string)', code: 'STORE_SCHEMA_INVALID', posixOnly: false, notRoot: false, mode: 0o600, holdsSecret: true,
    text: `${JSON.stringify(SECRET_LIKE)}\n` },
];

/** Can this host make the plant? (A test is skipped, with the reason in its name, where it cannot.) */
export const canPlant = (p: Plant): boolean => !(p.posixOnly && IS_WINDOWS) && !(p.notRoot && IS_ROOT);

/** What a path holds, to the byte and to the mode, and what its folder holds. */
export interface Snapshot { bytes: Buffer; mode: number | null; folder: string[] }

const dirOf = (path: string): string => path.replace(/[\\/][^\\/]*$/, '');

/** Write the plant and return what it is. The file is made 0600 first and put to its mode last, so a mode of 000 is the final act. */
export function plant(path: string, p: Plant): Snapshot {
  writeFileSync(path, p.text, { mode: 0o600 });
  if (!IS_WINDOWS) chmodSync(path, p.mode);
  return { bytes: Buffer.from(p.text), mode: IS_WINDOWS ? null : p.mode, folder: readdirSync(dirOf(path)).sort() };
}

/** The same questions asked again after a run: bytes (read through a temporary 0600 when the plant is 000), mode, folder. */
export function look(path: string): Snapshot {
  const mode = IS_WINDOWS ? null : statSync(path).mode & 0o777;
  let bytes: Buffer;
  if (mode === 0) {
    chmodSync(path, 0o600);
    bytes = readFileSync(path);
    chmodSync(path, 0o000);
  } else {
    bytes = readFileSync(path);
  }
  return { bytes, mode, folder: readdirSync(dirOf(path)).sort() };
}

/** Give the file back a readable mode so the folder can be removed and a failing test leaves nothing behind. */
export function release(path: string): void {
  if (!IS_WINDOWS && existsSync(path)) chmodSync(path, 0o600);
}
