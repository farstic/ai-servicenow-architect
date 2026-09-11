#!/usr/bin/env node
/**
 * ARC-06-S14, rewired by ARC-08-S05 — the committed `dist/server.js` answers a handshake, on
 * every OS.
 *
 * A design-only install never reaches B08, so without this the committed artefact would be
 * exercised on one machine (the maintainer's, at build time) and shipped to three.
 *
 * It used to run the engine's own MCP client. That client is retired: the doctor's `server`
 * section spawns the server through the server package's own, which is the ONE handshake in the
 * product now. So this runs that — the same code path a user's `./snowarch doctor` takes — and
 * asks the one question this job exists to ask: did the committed build answer?
 *
 *   node tools/snowarch/tests/server-section-smoke.mjs
 *
 * Exit 0 answered · 1 it did not · 2 cannot run.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../lib/config.mjs';
import { runDoctor } from '../lib/doctor/index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

let report;
try {
  ({ report } = await runDoctor({
    root,
    config: loadConfig(root),
    sections: ['server'],
    // Never the cache: this is a CI probe, and a cache written here would be read by a later job
    // as if a user had run the doctor.
    writeCache: false,
  }));
} catch (e) {
  process.stderr.write(`server-section-smoke: could not run the doctor — ${e.message}\n`);
  process.exit(2);
}

const byId = new Map(report.checks.map((c) => [c.id, c]));
const handshake = byId.get('SV-05');
if (!handshake) {
  process.stderr.write('server-section-smoke: the report has no SV-05 — the server section did not run\n');
  process.exit(2);
}

if (handshake.status !== 'ok') {
  process.stderr.write(`server-section-smoke: SV-05 ${handshake.status} — ${handshake.detail}\n`);
  for (const id of ['SV-00', 'SV-01', 'SV-06']) {
    const c = byId.get(id);
    if (c) process.stderr.write(`  ${id} ${c.status}: ${c.detail}\n`);
  }
  process.exit(1);
}

const { toolCount = '?', initializeMs = '?' } = handshake.data ?? {};
process.stdout.write(`server-section-smoke: SV-05 ok — ${handshake.detail} `
  + `(${toolCount} tools, ${initializeMs} ms to initialize)\n`);
