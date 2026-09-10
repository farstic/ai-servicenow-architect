/**
 * Where the store lives, and how to talk about it in a log.
 *
 * `node:path` and `node:os` only — no filesystem writes here beyond the existence
 * probes the precedence needs.
 */
import { existsSync, realpathSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join, resolve, sep } from 'node:path';
/**
 * An environment variable is "set" only when it is present AND non-empty.
 *
 * `.mcp.json` passes `${SNOW_STORE:-}` (01 §5), so an unset variable arrives as an
 * empty string. Treating `""` as a value would resolve the store to the current
 * directory and load whatever happened to be there.
 */
export function envPath(name) {
    const v = process.env[name];
    return v !== undefined && v !== '' ? v : undefined;
}
/**
 * The per-user global store, per OS.
 *
 * `XDG_CONFIG_HOME` is honoured (ARC-07-S07): `01` §7 names `~/.config/snowarch/instances.json`,
 * and on a machine where that variable is set, `~/.config` is not where a user's configuration
 * lives — writing there anyway would put the credential store somewhere they do not look and
 * somewhere their backup rules do not cover. Windows keeps `%APPDATA%` with ARC-04-S02's fallback.
 */
export function globalStorePath() {
    if (process.platform === 'win32') {
        const appData = envPath('APPDATA') ?? join(homedir(), 'AppData', 'Roaming');
        return join(appData, 'snowarch', 'instances.json');
    }
    return join(envPath('XDG_CONFIG_HOME') ?? join(homedir(), '.config'), 'snowarch', 'instances.json');
}
/** The per-checkout store. `CLAUDE_PROJECT_DIR` is set by Claude Code; cwd is the fallback. */
export function projectStorePath() {
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
export function resolveStorePath({ global = false } = {}) {
    // `--global` selects a candidate; it does not add a second resolver. The path is returned
    // whether or not the file is there, because selecting it is what `instance add --global` does
    // BEFORE the file exists — `source` still says `global`, and `exists` still says the truth.
    if (global) {
        const p = globalStorePath();
        return { path: p, source: 'global', candidates: [{ path: p, exists: existsSync(p) }] };
    }
    const override = envPath('SNOW_STORE');
    if (override) {
        const p = resolve(override);
        return { path: p, source: 'env', candidates: [{ path: p, exists: existsSync(p) }] };
    }
    const candidates = [
        { path: projectStorePath(), exists: false },
        { path: globalStorePath(), exists: false },
    ].map((c) => ({ ...c, exists: existsSync(c.path) }));
    const sources = ['project', 'global'];
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
export function maskPath(p) {
    if (!p)
        return p;
    let out = p;
    const checkout = envPath('CLAUDE_PROJECT_DIR');
    // `homedir()` returns `$HOME` when it is set, so a process started with HOME pointed
    // elsewhere — a test harness, a sandbox, a service account — masks nothing and prints the
    // real account name. `userInfo().homedir` reads the OS user database instead, so both are
    // tried. A redaction helper that an environment variable can switch off is not one; found
    // when ARC-04-S12's SV-08 printed an absolute home path under a fixture HOME.
    let osHome;
    try {
        osHome = userInfo().homedir;
    }
    catch {
        osHome = undefined;
    }
    // Checkout first: it is usually *under* home, so masking home first would hide it.
    for (const [prefix, label] of [
        [checkout, '<checkout>'], [homedir(), '~'], [osHome, '~'],
    ]) {
        if (!prefix)
            continue;
        const norm = prefix.endsWith(sep) ? prefix.slice(0, -1) : prefix;
        if (out === norm)
            return label;
        if (out.startsWith(norm + sep)) {
            out = label + out.slice(norm.length);
            break;
        }
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
export function maskPathForShell(p) {
    if (!p)
        return p;
    const home = homedir();
    const norm = home.endsWith(sep) ? home.slice(0, -1) : home;
    if (p === norm)
        return '~';
    return p.startsWith(norm + sep) ? `~${p.slice(norm.length)}` : p;
}
/**
 * The whole `Run:` clause for a remedy, phrased so it is BOTH pasteable and free of an
 * absolute path. Which of the three it is depends on where the file actually lives:
 *
 *  - inside the checkout  → a checkout-relative path, with "from the checkout" said out
 *    loud. This is the case `maskPathForShell` alone could not handle: a checkout on a
 *    second volume, under /srv, in a sandbox or on a CI runner is not under HOME, so
 *    there was no `~` to substitute and the absolute path was echoed.
 *  - under HOME           → `~/…`, which a shell expands.
 *  - anywhere else        → as given. The user chose that path explicitly (SNOW_STORE),
 *    and rewriting it would make the remedy point somewhere they did not name.
 */
export function shellRemedy(command, target) {
    const checkout = envPath('CLAUDE_PROJECT_DIR');
    if (checkout) {
        const norm = checkout.endsWith(sep) ? checkout.slice(0, -1) : checkout;
        if (target === norm)
            return `Run, from the checkout: ${command} .`;
        if (target.startsWith(norm + sep)) {
            const rel = target.slice(norm.length + 1).split(sep).join('/');
            return `Run, from the checkout: ${command} ${rel}`;
        }
    }
    return `Run: ${command} ${maskPathForShell(target)}`;
}
/** `cvetomir@corp.com` → `c***@corp.com`; `admin` → `a***`. Never the whole name. */
export function maskUsername(u) {
    if (!u)
        return u;
    const at = u.indexOf('@');
    if (at > 0)
        return `${u[0]}***${u.slice(at)}`;
    return `${u[0]}***`;
}
/**
 * THE provider list, as data.
 *
 * Three implementations must agree about it — this one, the bootstrap's stdlib re-implementation
 * (ARC-06-S05's `lib/cloud-sync.mjs`, for a checkout that has never run `npm ci`) and the doctor's
 * E-25 (ARC-08-S03). They agree by satisfying ONE fixture,
 * `packages/snowarch/tests/fixtures/cloud-sync-paths.json`, rather than by three tables that look
 * alike today. Order matters: `Mobile Documents` and `com~apple~CloudDocs` are how macOS spells
 * iCloud, and no user calls it either of those.
 */
export const CLOUD_SYNC_SEGMENTS = [
    { pattern: /^Mobile Documents$/i, provider: 'iCloud Drive' },
    { pattern: /^com~apple~CloudDocs$/i, provider: 'iCloud Drive' },
    { pattern: /^iCloud ?Drive([ _-]|$)/i, provider: 'iCloud Drive' },
    { pattern: /^OneDrive([ _-]|$)/i, provider: 'OneDrive' },
    { pattern: /^Dropbox([ _-]|$)/i, provider: 'Dropbox' },
    { pattern: /^Google ?Drive([ _-]|$)/i, provider: 'Google Drive' },
    { pattern: /^My Drive$/i, provider: 'Google Drive' },
];
/** The Windows variables the OneDrive client sets. Checked BEFORE the name patterns. */
export const ONEDRIVE_ENV_ROOTS = ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer'];
const split = (p) => p.split(/[\\/]/).filter(Boolean);
/** `/a/b/c` rebuilt from its first `n` segments, keeping a leading `/` and a `C:` drive intact. */
function ancestor(original, segments, upTo) {
    const joined = segments.slice(0, upTo + 1).join('/');
    return /^[\\/]/.test(original) ? `/${joined}` : joined;
}
/**
 * Which cloud provider synchronises this path, and from which folder — or `null`.
 *
 * It matters because 0600 is a LOCAL permission: the sync client runs as the same user, so the
 * mode does not stop the file leaving the machine. The wizard warns and asks (D-04), the doctor
 * reports it, the server logs it.
 *
 * THE ENVIRONMENT ROOTS COME FIRST, and they are the only detector for the case that matters most:
 * enterprise "Known Folder Move" redirects `Documents` and `Desktop` into OneDrive without the word
 * OneDrive appearing anywhere in the path the user sees. `%OneDrive%` still points at it. macOS has
 * no equivalent — a redirected `~/Documents` there is undetectable, and that is a documented limit
 * rather than an oversight.
 *
 * Symlinks are resolved first, because a link into a synced folder is a path into a synced folder.
 * A path that does not exist — every path in the unit tests, and any path being planned rather than
 * visited — is matched as given: `realpathSync` throws on those, and refusing to answer would make
 * the check useless exactly where it is cheapest to run.
 */
export function detectCloudSync(absPath, { env = process.env, realpath = safeRealpath } = {}) {
    if (!absPath)
        return null;
    const resolved = realpath(absPath);
    const segments = split(resolved);
    for (const name of ONEDRIVE_ENV_ROOTS) {
        const root = env[name];
        if (!root)
            continue;
        const rootSegments = split(realpath(root));
        const under = rootSegments.length > 0
            && rootSegments.every((s, i) => (segments[i] ?? '').toLowerCase() === s.toLowerCase());
        if (under)
            return { provider: 'OneDrive', root: realpath(root) };
    }
    // The NAMED vendors first, across the whole path. `~/Library/CloudStorage/OneDrive-Corp/…` is
    // both a CloudStorage mount and a OneDrive one, and answering "CloudStorage (unknown provider)"
    // about a folder whose name says OneDrive would be this function refusing to read.
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        for (const { pattern, provider } of CLOUD_SYNC_SEGMENTS) {
            if (pattern.test(segment))
                return { provider, root: ancestor(resolved, segments, i) };
        }
    }
    // Then the mount itself: macOS puts every vendor under `~/Library/CloudStorage/<Provider>-<tenant>`,
    // and a vendor the table does not name is still synchronised.
    for (let i = 0; i < segments.length - 2; i += 1) {
        if (/^Library$/i.test(segments[i]) && /^CloudStorage$/i.test(segments[i + 1] ?? '')) {
            return { provider: 'CloudStorage (unknown provider)', root: ancestor(resolved, segments, i + 2) };
        }
    }
    return null;
}
/** ARC-04-S02's boolean, now one question asked of one detector. */
export const isUnderCloudSyncFolder = (p) => detectCloudSync(p) !== null;
function safeRealpath(p) {
    try {
        return realpathSync.native(p);
    }
    catch {
        return p; // a path that is not there yet is matched as written
    }
}
