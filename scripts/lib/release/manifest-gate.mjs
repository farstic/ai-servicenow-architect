// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C7 — the release's own check that a tag from 2.1 on is signed before it is pushed.
 *
 * `release.mjs --tag-only --push` asks it, between the tag and the push (CONTRIBUTING's release checklist, step 3a):
 * the manifest the licences repository publishes for the tag is fetched over the revocation list's transport,
 * verified with the shipped keys, and compared with the manifest the tag's own `git archive` gives. Same commit, same
 * files, same hashes. Anything else, a manifest missing, unverified, or for another tree, and the push is refused.
 *
 * The release-side twin of `upgrade`'s refusal: an unsigned 2.1 tag never reaches the public repository from here, and
 * a user's upgrade never takes one.
 */
import { manifestSays, refreshManifest } from '../../../tools/snowarch/lib/licence/fetch.mjs';
import { PRODUCT_KEYS } from '../../../tools/snowarch/lib/licence/keys.mjs';
import { manifestFromArchive } from '../../../tools/snowarch/lib/licence/manifest.mjs';

/** `{ ok: true, files }`, or `{ ok: false, reason }`: is the manifest published for `tag` the record of this tag's tree? */
export function publishedManifestMatches(root, tag, { config, keys = PRODUCT_KEYS, env = process.env, fetcher } = {}) {
  const fetched = refreshManifest(root, { config, tag, keys, env, write: false, ...(fetcher ? { fetcher } : {}) });
  if (fetched.outcome !== 'fetched') return { ok: false, reason: manifestSays(fetched) };
  const published = fetched.entry.doc.manifest;
  const local = manifestFromArchive(root, tag);
  if (published.commit !== local.commit) {
    return { ok: false, reason: `the published manifest names ${published.commit.slice(0, 7)}, and ${tag} here is `
      + `${local.commit.slice(0, 7)}` };
  }
  const paths = [...new Set([...Object.keys(published.files), ...Object.keys(local.files)])].sort();
  const differ = paths.filter((p) => published.files[p] !== local.files[p]);
  if (differ.length > 0) {
    return { ok: false, reason: `${differ.length} file${differ.length === 1 ? '' : 's'} in the published manifest `
      + `differ${differ.length === 1 ? 's' : ''} from ${tag}'s own, the first ${differ[0]}` };
  }
  return { ok: true, files: paths.length };
}
