// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C232 — `./snowarch client-copy <working file>` (governance/governance-rules.md §4.5): the copy of a deliverable,
// cut at its end marker and written under clients/<name>/for-client/, then scanned for internal content. A builder has
// no shell, so its manifest names this command and the Chief Architect runs it in Phase 2. Clean, it exits 0 and names
// the copy; with hits it exits 1 and lists each by line, to be rewritten in the working file before it runs again; a
// file it cannot copy is a usage error with the reason, and nothing is written.
import { clientCopy } from '../client-copy.mjs';
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from '../exit.mjs';
import { spellings } from '../text.mjs';

export const USAGE = (where) => `usage: ${spellings(where).cli} client-copy <working file>\n\n`
  + '  The working file is under clients/<name>/; the copy goes to the same path under clients/<name>/for-client/.';

export async function clientCopyCommand({ positional = [], log, root }) {
  if (positional.length !== 1) {
    log.fail(USAGE());
    return EXIT_USAGE;
  }
  const r = clientCopy({ root, file: positional[0] });
  if (r.refused) {
    log.fail(`client copy: ${r.refused}`);
    return EXIT_USAGE;
  }
  if (r.hits.length === 0) {
    log.ok(`client copy: ${r.dest} — no internal content`);
    return EXIT_OK;
  }
  const n = r.hits.length;
  log.fail(`client copy: ${r.dest} has ${n} internal term${n === 1 ? '' : 's'} — rewrite ${n === 1 ? 'it' : 'them'} `
    + `in ${r.source} and run it again:`);
  for (const h of r.hits) log.fail(`  line ${h.line}: ${h.term} — "${h.match}"`);
  return EXIT_FAIL;
}
