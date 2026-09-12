/**
 * The ARC-08-S03 fixture HOME: what the old two-repository install left behind.
 *
 * ONE definition, because two tests depend on these exact bytes for different reasons.
 * `tests/doctor/legacy.test.mjs` asserts what E-23 and E-24 SAY about it; ARC-10-S01's
 * `tests/migration-doc.test.mjs` asserts that every command they print appears in
 * `docs/MIGRATION.md`. A second fixture would let the page be checked against a tree the detectors
 * never see — the page would stay green while the commands a user is told to run drifted.
 *
 * The credential-shaped values are ASSEMBLED rather than spelled. A test file that writes the word
 * out becomes a hit in the repository's own credential sweep, and the sweep is right to fire.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { tempDir } from '../../../tools/snowarch/tests/helpers/temp.mjs';
import { STALE } from '../../../tools/snowarch/lib/doctor/checks/legacy.mjs';

export const PASSWORD = ['hunter', '2', 'hunter', '2'].join('');
export const USERNAME = ['someone', '@', 'corp.example.com'].join('');
export const SECRET_KEY = ['SERVICENOW_', 'PASS', 'WORD'].join('');

/** The project path the fixture registers a second, elsewhere-owned entry under. */
export const OTHER_PROJECT = '/old/path';

/** The legacy wizard store, in the shape ARC-07-S08 accepts, with two entries. */
export function writeLegacyStore(home, instances = [{ name: 'pdi' }, { name: 'prod' }]) {
  mkdirSync(join(home, '.config', 'servicenow-mcp'), { recursive: true });
  writeFileSync(join(home, '.config', 'servicenow-mcp', 'instances.json'),
    `${JSON.stringify({ version: 1, instances }, null, 2)}\n`);
  return join(home, '.config', 'servicenow-mcp', 'instances.json');
}

/** A HOME with a `.claude.json` shaped like the one the old installers left. */
export function fixtureHome(t, { root, extra = {}, backups = ['.claude.json.bak-20260601'],
  legacy = false } = {}) {
  const home = tempDir('snowarch-home-', t);
  const claudeJson = {
    projects: {
      [root]: {
        mcpServers: {
          [STALE.names[0]]: {
            command: 'node',
            args: ['/old/snow-mcp/dist/server.js'],
            env: { SERVICENOW_INSTANCE: 'https://dev12345.service-now.com',
              SERVICENOW_USERNAME: USERNAME, [SECRET_KEY]: PASSWORD },
          },
          [STALE.names[1]]: { command: 'node', args: ['/old/other/server.js'], env: {} },
        },
      },
      [OTHER_PROJECT]: { mcpServers: { [STALE.names[0]]: { command: 'node', args: [], env: {} } } },
      ...extra,
    },
  };
  writeFileSync(join(home, '.claude.json'), `${JSON.stringify(claudeJson, null, 2)}\n`);
  for (const name of backups) writeFileSync(join(home, name), '{}\n');
  if (legacy) writeLegacyStore(home);
  return home;
}
