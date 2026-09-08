/**
 * Reading and writing the store. The server only ever reads; the wizard (ARC-07) and the
 * doctor's `--fix` (ARC-08) are the writers, through `saveStore` here.
 */
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, rmSync, statSync, writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { completeFlags, parseStore, type Store, type StoreError } from './schema.js';

export * from './paths.js';
export * from './schema.js';

const isWindows = process.platform === 'win32';

/**
 * POSIX mode check. A store holds a password; group- or world-readable is not a warning.
 *
 * Skipped on Windows, where permissions are ACL-inherited and the POSIX mode bits Node
 * reports are synthetic — asserting on them there would fail for a file that is in fact
 * correctly protected (01 §13).
 */
export function checkFileModes(path: string): StoreError | null {
  if (isWindows) return null;
  if (!existsSync(path)) return null;
  const fileMode = statSync(path).mode & 0o777;
  const dir = dirname(path);
  const dirMode = existsSync(dir) ? statSync(dir).mode & 0o777 : 0;
  const fileOpen = (fileMode & 0o077) !== 0;
  const dirOpen = (dirMode & 0o077) !== 0;
  if (!fileOpen && !dirOpen) return null;

  const fixes: string[] = [];
  if (fileOpen) fixes.push(`chmod 600 ${path}`);
  if (dirOpen) fixes.push(`chmod 700 ${dir}`);
  const what = fileOpen
    ? `file mode ${fileMode.toString(8).padStart(4, '0')} is group/world-readable`
    : `directory mode ${dirMode.toString(8).padStart(4, '0')} is group/world-accessible`;
  return {
    code: 'STORE_PERMISSIONS_TOO_OPEN',
    message: `Refusing to load ${path}: ${what}. Run: ${fixes.join(' && ')}`,
  };
}

export function loadStore(path: string): { store: Store } | { error: StoreError } {
  if (!existsSync(path)) {
    return { error: { code: 'STORE_NOT_FOUND', message: `store not found: ${path}` } };
  }
  const modeError = checkFileModes(path);
  if (modeError) return { error: modeError };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { error: { code: 'STORE_UNREADABLE', message: `${path}: ${(e as Error).message}` } };
  }
  const parsed = parseStore(raw);
  if ('error' in parsed) {
    return { error: { ...parsed.error, message: `${path}: ${parsed.error.message}` } };
  }
  // Absent flags mean "false" — normalise once, here, so no caller has to remember.
  for (const inst of Object.values(parsed.store.instances)) inst.flags = completeFlags(inst.flags);
  return parsed;
}

/**
 * Atomic write: temp file in the same directory, fsync, rename over the target.
 *
 * Same directory because rename is only atomic within a filesystem. fsync before rename
 * because a rename can land before the data does, leaving a valid name over a truncated
 * file after a crash. `renameSync` replaces an existing file on Windows too — the
 * windows-latest cell in tests/store/atomic.test.ts is what proves that here rather than
 * on the documentation's word.
 */
export function saveStore(path: string, store: Store): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, `.instances.json.tmp-${process.pid}-${randomBytes(6).toString('hex')}`);
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, `${JSON.stringify(store, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  if (!isWindows) chmodSync(path, 0o600);
}
