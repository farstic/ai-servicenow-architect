// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * What the installer says when the store is there and does not load (ARC-09-C307), from code that cannot import the store.
 *
 * B06, the bootstrap's instance step, starts the instance wizard or reads an instance file, and both write the store. A store that is there
 * and does not load used to read as "no default instance" to it, and the wizard's save replaced the file. The step asks the server's own
 * loader now, and this is where it finds its words, for two reasons that are the reasons `label.ts` gives:
 *
 *   NO ZOD. `index.ts` validates through a schema, and the schema package only exists after B04's `npm ci`. The step also answers in a
 *   design-only checkout that has a store (a schema from the future is a warning there), where nothing was installed, so the words come from
 *   a module that imports nothing at all, and a test pins that.
 *
 *   THE NAMES ARE THE PACKAGE'S. The engine's tools may not hold an error code's name as a literal (`tests/contract/no-literals.test.mjs`):
 *   a name typed into a tool is a second list, and drifts. The step takes the code from here, and the sentences about it.
 *
 * The sentences carry no content of the file and no absolute path: the step's answer is written to `.local/logs`.
 */
/**
 * The store's code for a schema from a release ahead of this one. The step reads the version out of the file itself (it has no schema to ask)
 * and says it in its own words, but the name of the error is the package's to give.
 */
export const NEWER_STORE_CODE = 'STORE_SCHEMA_NEWER';
/**
 * The words for one of the store's errors. `cli` is the launcher as this platform spells it and `file` the store as the step shows it
 * (`.local/instances.json`, relative: an absolute path names the account). A code this does not know is spoken of as a file that cannot be read.
 */
export function storeRefusalWords(code, cli, file) {
    const backup = `restore a backup (${cli} store backups lists them) and run ${cli} mode live again, or ask for help; moving the file aside starts an empty store`;
    switch (code) {
        case 'STORE_SCHEMA_INVALID':
            return { code, what: 'is not a store this release understands', remedy: backup };
        case 'STORE_PERMISSIONS_TOO_OPEN':
            return { code, what: 'can be read by other accounts', remedy: `run chmod 600 ${file} (from the checkout), then run ${cli} mode live again` };
        case NEWER_STORE_CODE:
            return { code, what: 'was written by a newer release than this one', remedy: `run ${cli} upgrade, then run ${cli} mode live again` };
        case 'STORE_SCHEMA_OUTDATED':
            return { code, what: 'was written by an older release than this one', remedy: `run ${cli} store migrate, then run ${cli} mode live again` };
        default:
            return { code: 'STORE_UNREADABLE', what: 'cannot be read as JSON', remedy: backup };
    }
}
