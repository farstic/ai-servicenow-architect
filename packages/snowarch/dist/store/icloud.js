// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C305 — A CHECKOUT IN `~/Documents` OR `~/Desktop`, WITH ICLOUD'S "DESKTOP & DOCUMENTS FOLDERS" ON.
 *
 * The path of such a checkout says nothing (`/Users/me/Documents/AI-Arch`), so the named-vendor rules of `detectCloudSync` cannot see it,
 * and `paths.ts` recorded that as a limit. The setting is not in the path; macOS keeps it in the preferences of Finder. So this rule
 * asks the path first and the setting only on a hit, and it never spawns anything for a checkout that is somewhere else:
 *
 *   1. darwin only, and never as root: `defaults` reads the preferences of the account that runs it, and root's are not the user's
 *      (the root rule, ARC-09-C303, is the same refusal, and `isElevated` is its one question);
 *   2. the real path of the checkout is inside `<home>/Desktop` or `<home>/Documents`, by whole segments, case ignored. This step is
 *      pure: no process, no file read beyond `realpath`;
 *   3. that folder is a real directory (`lstat`: not a link, not missing). Turning the setting off makes macOS create NEW local folders
 *      of those names, and a folder that someone moved elsewhere and left a link to is managed by who knows what: both are quiet;
 *   4. only then `defaults read com.apple.finder FXICloudDrive<Folder>`, for THAT folder. ON is exactly `1`; anything else, an absent
 *      key (exit 1), an error, a timeout, `true`, is OFF. The keys are not documented by Apple, so a rename degrades to the silence
 *      that was there before this rule, and never to a false warning.
 *
 * Measured on macOS 26.5.2 with the setting on: the three keys `FXICloudDriveDesktop`, `FXICloudDriveDocuments` and
 * `FXICloudDriveEnabled` read `1`; an absent key exits 1; a read costs about 5 ms; `defaults` ignores `HOME` (an empty one still printed
 * `1`), which is why the reader is a seam and no test of the rule reads the real one. NOT measured: the values when the setting is off,
 * macOS before 26, a signed-out account.
 *
 * The cases are not written in the tests: they are `icloudFolders[]` in `tests/fixtures/cloud-sync-paths.json`, the file the engine's
 * E-34 and B01 read as well. `detectCloudSync` is not changed: the named vendors are answered first (`findCloudSync`).
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { isElevated } from '../licence/elevated.js';
import { detectCloudSync } from './paths.js';
/** The Finder key that says whether that folder is in iCloud Drive: `FXICloudDriveDesktop`, `FXICloudDriveDocuments`. */
export const icloudKey = (folder) => `FXICloudDrive${folder}`;
const FOLDERS = ['Documents', 'Desktop'];
/** `defaults` is a program of the system, called by its absolute path: a PATH with another one first cannot answer in its place. */
const DEFAULTS = '/usr/bin/defaults';
const FINDER = 'com.apple.finder';
/** A read takes about 5 ms; a machine that cannot answer in two seconds is one the rule gives up on, and gives up quietly. */
const READ_TIMEOUT_MS = 2000;
/**
 * The reader of the real machine: one key of Finder's preferences, as the raw text `defaults` printed, or `null` when it printed none
 * (an absent key exits 1; no such program, a timeout and any other failure end the same way). No shell, no input, no error text kept.
 */
export function finderKeyReader(run = execFileSync) {
    return (key) => {
        try {
            const out = run(DEFAULTS, ['read', FINDER, key], {
                encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: READ_TIMEOUT_MS, windowsHide: true,
            });
            return typeof out === 'string' ? out : null;
        }
        catch {
            return null;
        }
    };
}
const segmentsOf = (p) => p.split(/[\\/]/).filter(Boolean);
/** `home/Folder` with one kind of separator, as `detectCloudSync` writes the roots it returns (so the same sentence reads the same on every system). */
function folderRoot(home, folder) {
    const joined = [...segmentsOf(home), folder].join('/');
    return /^[\\/]/.test(home) ? `/${joined}` : joined;
}
/** Is every segment of `inner` the same as the one of `outer` at its place, case ignored? An empty `outer` contains nothing. */
const within = (inner, outer) => outer.length > 0
    && outer.every((s, i) => (inner[i] ?? '').toLowerCase() === s.toLowerCase());
/**
 * The real path of `p`, even when `p` is not there yet: through its nearest ancestor that is, with what is missing put back after it.
 * The wizard asks BEFORE it makes `.local/`, so the folder it hands over may not exist, and the folder it is compared with
 * (`<home>/Documents`) is resolved through any link above it (a home kept on another volume; macOS's own /var for a temp folder). A path
 * left as written would then never be inside it. `detectCloudSync` does not need this, because it matches the NAMES in a path and not
 * the folder they lead to. With nothing above it that exists, the path is matched as written.
 */
function safeRealpath(p) {
    const missing = [];
    let at = p;
    for (;;) {
        try {
            const real = realpathSync.native(at);
            return missing.length === 0 ? real : join(real, ...missing.reverse());
        }
        catch {
            const parent = dirname(at);
            if (parent === at)
                return p;
            missing.push(basename(at));
            at = parent;
        }
    }
}
function isRealDirectory(p) {
    try {
        return lstatSync(p).isDirectory(); // `lstat`: a link to a directory is not one
    }
    catch {
        return false;
    }
}
/**
 * Is this checkout in a folder that iCloud Drive copies because of "Desktop & Documents Folders"? The hit names the folder to move it out
 * of (`<home>/Documents`), or `null`. See the top of this file for the order; the reader is called for a folder only after the path is
 * in it and the folder is a real directory, so a run that is not in `Desktop` or `Documents` starts nothing.
 *
 * The two folders are judged one by one: a link in place of `Desktop` does not stop `Documents` from being asked about.
 */
export function detectIcloudFolders(absPath, seams = {}) {
    if ((seams.platform ?? process.platform) !== 'darwin')
        return null;
    if (isElevated(seams.euid))
        return null;
    const home = seams.home ?? homedir();
    if (!absPath || !home)
        return null;
    const realpath = seams.realpath ?? safeRealpath;
    const isDirectory = seams.isDirectory ?? isRealDirectory;
    const checkout = segmentsOf(realpath(absPath));
    for (const folder of FOLDERS) {
        const root = folderRoot(home, folder);
        if (!within(checkout, segmentsOf(realpath(root))))
            continue;
        if (!isDirectory(root))
            continue;
        const answer = (seams.read ?? finderKeyReader())(icloudKey(folder));
        if (answer?.trim() === '1')
            return { provider: 'iCloud Drive', root, folder };
    }
    return null;
}
/**
 * Which cloud-sync folder is this path in: what `detectCloudSync` says whenever it says anything (the named vendors, the mounts under
 * `Library/CloudStorage`), and otherwise whether it is in a folder iCloud Drive copies under "Desktop & Documents Folders".
 * This is the question the wizard's gate and the server's start-up line ask; the doctor and the installer ask the engine's twin of it.
 */
export function findCloudSync(absPath, { env, realpath, icloud } = {}) {
    return detectCloudSync(absPath, { env, realpath })
        ?? detectIcloudFolders(absPath, { ...icloud, realpath: icloud?.realpath ?? realpath });
}
