/**
 * Where the store lives, and how to talk about it in a log.
 *
 * `node:path` and `node:os` only — no filesystem writes here beyond the existence
 * probes the precedence needs.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export type StoreSource = 'env' | 'project' | 'global' | 'none';

export interface StoreCandidate {
  path: string;
  exists: boolean;
}

export interface StoreResolution {
  path: string | null;
  source: StoreSource;
  candidates: StoreCandidate[];
}

/**
 * An environment variable is "set" only when it is present AND non-empty.
 *
 * `.mcp.json` passes `${SNOW_STORE:-}` (01 §5), so an unset variable arrives as an
 * empty string. Treating `""` as a value would resolve the store to the current
 * directory and load whatever happened to be there.
 */
export function envPath(name: string): string | undefined {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : undefined;
}

/** The per-user global store, per OS. */
export function globalStorePath(): string {
  if (process.platform === 'win32') {
    const appData = envPath('APPDATA') ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'snowarch', 'instances.json');
  }
  return join(homedir(), '.config', 'snowarch', 'instances.json');
}

/** The per-checkout store. `CLAUDE_PROJECT_DIR` is set by Claude Code; cwd is the fallback. */
export function projectStorePath(): string {
  return join(envPath('CLAUDE_PROJECT_DIR') ?? process.cwd(), '.local', 'instances.json');
}

/**
 * The precedence: explicit override, then per-checkout, then global. First existing wins;
 * they are never merged, because a merge makes "which file set this value" unanswerable.
 *
 * `SNOW_STORE` is the exception: it is explicit, so a missing file is an ERROR rather than
 * a reason to try the next candidate. Falling back would mean a typo in the override
 * silently loads a different instance than the one asked for.
 */
export function resolveStorePath(): StoreResolution {
  const override = envPath('SNOW_STORE');
  if (override) {
    const p = resolve(override);
    return { path: p, source: 'env', candidates: [{ path: p, exists: existsSync(p) }] };
  }
  const candidates: StoreCandidate[] = [
    { path: projectStorePath(), exists: false },
    { path: globalStorePath(), exists: false },
  ].map((c) => ({ ...c, exists: existsSync(c.path) }));

  const sources: StoreSource[] = ['project', 'global'];
  const hit = candidates.findIndex((c) => c.exists);
  return hit === -1
    ? { path: null, source: 'none', candidates }
    : { path: candidates[hit].path, source: sources[hit], candidates };
}

/**
 * A path fit for a log line: the home directory becomes `~`, the checkout becomes
 * `<checkout>`. Absolute paths carry the account name, and a log is the one place a
 * username reaches a screen share, a bug report or a support ticket.
 */
export function maskPath(p: string): string {
  if (!p) return p;
  let out = p;
  const checkout = envPath('CLAUDE_PROJECT_DIR');
  // Checkout first: it is usually *under* home, so masking home first would hide it.
  for (const [prefix, label] of [[checkout, '<checkout>'], [homedir(), '~']] as const) {
    if (!prefix) continue;
    const norm = prefix.endsWith(sep) ? prefix.slice(0, -1) : prefix;
    if (out === norm) return label;
    if (out.startsWith(norm + sep)) { out = label + out.slice(norm.length); break; }
  }
  return out;
}

/**
 * A path fit for a REMEDY the reader will paste into a shell: home becomes `~`, which a
 * shell expands, and the checkout is left alone because `<checkout>` is not a path.
 *
 * `maskPath` is for prose and log lines; this is for the text after `Run:`. A remedy that
 * has been prettified into something unrunnable is worse than one that was never offered.
 */
export function maskPathForShell(p: string): string {
  if (!p) return p;
  const home = homedir();
  const norm = home.endsWith(sep) ? home.slice(0, -1) : home;
  if (p === norm) return '~';
  return p.startsWith(norm + sep) ? `~${p.slice(norm.length)}` : p;
}

/** `cvetomir@corp.com` → `c***@corp.com`; `admin` → `a***`. Never the whole name. */
export function maskUsername(u: string): string {
  if (!u) return u;
  const at = u.indexOf('@');
  if (at > 0) return `${u[0]}***${u.slice(at)}`;
  return `${u[0]}***`;
}

const CLOUD_SEGMENT = /^(OneDrive|Dropbox|Google Drive|GoogleDrive|iCloud Drive|Mobile Documents)$/i;
// Vendors suffix the tenant onto the folder name: `OneDrive-Corp`, `OneDrive - Contoso`.
const CLOUD_PREFIXED = /^(OneDrive|Dropbox|Google Drive|GoogleDrive)([ _-]|$)/i;

/**
 * True when the store would sit inside a folder a cloud client synchronises.
 *
 * It matters because 0600 is a LOCAL permission: the sync client runs as the same user,
 * so the mode does not stop the file leaving the machine. The wizard and the doctor turn
 * this into a warning (D-04); the server only logs it.
 *
 * Both separators are accepted, because a Windows path can reach a POSIX test runner
 * (criterion 8 asserts exactly that).
 */
export function isUnderCloudSyncFolder(p: string): boolean {
  const segments = p.split(/[\\/]/).filter(Boolean);
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    if (CLOUD_SEGMENT.test(s) || CLOUD_PREFIXED.test(s)) return true;
    // macOS iCloud Drive on disk: ~/Library/Mobile Documents/com~apple~CloudDocs/…
    if (/^Library$/i.test(s) && /^(Mobile Documents|CloudStorage)$/i.test(segments[i + 1] ?? '')) return true;
  }
  return false;
}
