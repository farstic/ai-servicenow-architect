// ARC-06-S05 — is this checkout inside a folder something synchronises, and whose?
//
// WHETHER is already answered, by `isUnderCloudSyncFolder` in the committed server build. This
// module imports it rather than re-deriving it: a second segment table would drift, and the two
// would disagree about a path exactly when it mattered. What it adds is WHICH — the warning has to
// name the provider, because "a cloud-synced folder" tells someone nothing they can act on.
//
// The import reaches into `packages/snowarch/dist/`, which is IN-REPO committed JavaScript, not an
// npm dependency: the bootstrap still installs nothing, `dist-check` keeps the build current, and
// `paths.js` imports `node:` modules only — which matters, because B01 runs in a design-only
// checkout that has never seen `npm ci`.
import { isUnderCloudSyncFolder } from '../../../packages/snowarch/dist/store/paths.js';

/**
 * Segment → provider name. Ordered, and `Mobile Documents` sits first because macOS spells iCloud
 * as `Library/Mobile Documents/com~apple~CloudDocs`, which no user calls either of those.
 *
 * The list is the one in `packages/snowarch/tests/fixtures/cloud-sync-paths.json` — the fixture
 * this module, the server's `detectCloudSync()` and ARC-08-S03's E-25 all answer to (ARC-07-S07).
 */
const PROVIDERS = [
  [/^Mobile Documents$/i, 'iCloud Drive'],
  [/^com~apple~CloudDocs$/i, 'iCloud Drive'],
  [/^iCloud ?Drive([ _-]|$)/i, 'iCloud Drive'],
  [/^OneDrive([ _-]|$)/i, 'OneDrive'],
  [/^Dropbox([ _-]|$)/i, 'Dropbox'],
  [/^Google ?Drive([ _-]|$)/i, 'Google Drive'],
  [/^My Drive$/i, 'Google Drive'],
];

/** The macOS mount point, which names no vendor: checked only after every NAMED one has missed. */
const CLOUD_STORAGE = 'a cloud provider mounted under ~/Library/CloudStorage';

/**
 * The provider's name, or null. Both separators, because a Windows path can reach a POSIX test.
 *
 * NAMED VENDORS FIRST, across the whole path. `~/Library/CloudStorage/OneDrive-Corp/…` is both a
 * CloudStorage mount and a OneDrive one, and this used to answer with the mount — because
 * `CloudStorage` sat above `OneDrive` in the table and `Library` comes first in the path. Saying
 * "a cloud provider" about a folder whose name says OneDrive is this function refusing to read.
 * The server's detector had the same ordering bug, found by the same fixture row.
 */
export function cloudSyncProvider(p) {
  if (!p) return null;
  const segments = String(p).split(/[\\/]/).filter(Boolean);
  for (const segment of segments) {
    for (const [pattern, name] of PROVIDERS) if (pattern.test(segment)) return name;
  }
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (/^Library$/i.test(segments[i]) && /^CloudStorage$/i.test(segments[i + 1])) return CLOUD_STORAGE;
  }
  return null;
}

/**
 * The sentence, or null.
 *
 * A WARN and never a FAIL: the user may have a reason, and refusing to install because of where
 * they keep their code would be this tool deciding something that is theirs to decide. What it must
 * not do is stay quiet — mode 0600 is a LOCAL permission, and the sync client runs as the same user.
 */
export function cloudSyncWarning(root) {
  const provider = cloudSyncProvider(root);
  if (!provider) return null;
  return `this checkout is inside a cloud-synced folder (${provider}) — `
    + '.local/instances.json will be synced even at mode 0600; prefer a local path such as '
    + '~/work/ (D-04)';
}

export { isUnderCloudSyncFolder };
