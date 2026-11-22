// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * What the installer says when the store is there and does not load (ARC-09-C307), from code that cannot import the store.
 *
 * B06, the bootstrap's instance step, starts the instance wizard or reads an instance file, and both write the store. A store that is there
 * and cannot be read as JSON used to read as "no default instance" to it, and the wizard's save replaced the file. The step asks first now,
 * and this is where it asks and where it finds its words, for two reasons that are the reasons `label.ts` gives:
 *
 *   NO ZOD. `index.ts` validates through a schema, and the schema package only exists after B04's `npm ci`; this module imports `node:fs` and
 *   nothing else, and a test pins that.
 *
 *   THE NAMES ARE THE PACKAGE'S. The engine's tools may not hold an error code's name as a literal (`tests/contract/no-literals.test.mjs`):
 *   a name typed into a tool is a second list, and drifts. The step takes the code from here, and the sentences about it.
 *
 * The sentences carry no content of the file and no absolute path: the step's answer is written to `.local/logs`.
 */
import { readFileSync } from 'node:fs';

/**
 * `{ code }` when a file is at `path` and cannot be read as JSON, `null` when it is not there or parses. ENOENT is "no store yet" and nothing
 * else is: a file that cannot be read is somebody's store.
 */
export function unreadableStore(path: string): { code: string } | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? null : { code: 'STORE_UNREADABLE' };
  }
  try {
    JSON.parse(text);
    return null;
  } catch {
    return { code: 'STORE_UNREADABLE' };
  }
}

export interface StoreRefusalWords {
  /** The store's own error, as the step names it. */
  code: string;
  /** What is wrong with the file, to follow its name: `cannot be read as JSON`. */
  what: string;
  /** What to do, in the step's own style (a clause, no full stop). */
  remedy: string;
}

/**
 * The words for one of the store's errors. `cli` is the launcher as this platform spells it and `file` the store as the step shows it
 * (`.local/instances.json`, relative: an absolute path names the account). A code this does not know is spoken of as a file that cannot be read.
 */
export function storeRefusalWords(code: string, cli: string, file: string): StoreRefusalWords {
  const backup = `restore a backup (${cli} store backups lists them) and run ${cli} mode live again, or ask for help; moving the file aside starts an empty store`;
  switch (code) {
    case 'STORE_SCHEMA_INVALID':
      return { code, what: 'is not a store this release understands', remedy: backup };
    case 'STORE_PERMISSIONS_TOO_OPEN':
      return { code, what: 'can be read by other accounts', remedy: `run chmod 600 ${file} (from the checkout), then run ${cli} mode live again` };
    case 'STORE_SCHEMA_NEWER':
      return { code, what: 'was written by a newer release than this one', remedy: `run ${cli} upgrade, then run ${cli} mode live again` };
    case 'STORE_SCHEMA_OUTDATED':
      return { code, what: 'was written by an older release than this one', remedy: `run ${cli} store migrate, then run ${cli} mode live again` };
    default:
      return { code: 'STORE_UNREADABLE', what: 'cannot be read as JSON', remedy: backup };
  }
}
