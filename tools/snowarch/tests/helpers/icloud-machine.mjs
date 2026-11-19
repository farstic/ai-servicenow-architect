// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C305 — the rows of `icloudFolders[]` in the shared cloud-sync fixture, and the machine each row describes.
 *
 * The rule for iCloud's "Desktop & Documents Folders" is `packages/snowarch/src/store/icloud.ts`, and the cases are NOT written in any test: they are the
 * rows of `packages/snowarch/tests/fixtures/cloud-sync-paths.json`, which the server's test (`packages/snowarch/tests/store/icloud.test.ts`), the doctor's E-34
 * (`tests/doctor/host.test.mjs`) and the installer's B01 (`tools/snowarch/tests/b01-b07.test.mjs`) all read. This is the JS twin of the stand-in machine
 * the server's test builds from a row, so the three answer to one list and not to three that look alike.
 *
 * A row says where the checkout is (`path`), whose machine it is (`home`, `platform`, `euid`), what the Finder keys read (`keys`: key to the raw text
 * `defaults` printed; a key that is not there is one that gave no answer), which paths are links (`links`) or missing (`missing`), the folder that must
 * be named (`folder`, or null for a quiet row), and the keys the reader must have been asked for (`asked`: an empty list is how a row says that the
 * reader was never reached, which is what keeps a process out of every run that is not in `Desktop` or `Documents`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** The fixture's `icloudFolders[]`. */
export const icloudRows = () => JSON.parse(readFileSync(
  join(repoRoot, 'packages/snowarch/tests/fixtures/cloud-sync-paths.json'), 'utf8')).icloudFolders;

/**
 * The row's machine: the seams of the rule (`platform`, `home`, `euid`, `realpath`, `isDirectory`, `read`) and the list the reader's questions are
 * logged in. A link resolves by its prefix, longest first; a link or a missing path is not a directory.
 */
export function icloudMachine(row) {
  const links = row.links ?? {};
  const asked = [];
  const missing = new Set(row.missing ?? []);
  const realpath = (p) => {
    let at = p;
    for (let i = 0; i < 8; i += 1) {
      const from = Object.keys(links).filter((l) => at === l || at.startsWith(`${l}/`)).sort((a, b) => b.length - a.length)[0];
      if (from === undefined) return at;
      at = `${links[from]}${at.slice(from.length)}`;
    }
    return at;
  };
  return {
    asked,
    seams: {
      platform: row.platform, home: row.home, euid: row.euid,
      realpath,
      isDirectory: (p) => !(p in links) && !missing.has(p),
      read: (key) => { asked.push(key); return key in row.keys ? row.keys[key] : null; },
    },
  };
}
