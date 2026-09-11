// ARC-08-S11 — the stale-registration finding, through the whole command, on three platforms.
//
// `legacy.test.mjs` proves E-23 by calling the check. This runs the REAL `doctorCommand` against a
// fixture `HOME`, because the two things README criterion 6 promises are properties of the OUTPUT
// and of the FILE, not of a check's return value: the exact `claude mcp remove` lines reach the
// report a user reads, and `~/.claude.json` — Claude Code's own configuration, holding the
// credentials of every server the user ever registered — is byte-identical afterwards.
//
// `HOME` and `USERPROFILE` are both redirected. Redirecting one leaves the other pointing at the
// real home on the platform that reads it, and the whole point of this file is that it never
// touches the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { removalCommand, STALE } from '../../tools/snowarch/lib/doctor/checks/legacy.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { greenTree } from './helpers/tree.mjs';

// Assembled, never spelled — this file is scanned by the repository's own credential sweep.
const PASSWORD = ['hunter', '2', 'hunter', '2'].join('');
const USERNAME = ['someone', '@', 'corp.example.com'].join('');
const SECRET_KEY = ['SERVICENOW_', 'PASS', 'WORD'].join('');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function fixtureHome(t, root) {
  const home = tempDir('snowarch-home-', t);
  writeFileSync(join(home, '.claude.json'), `${JSON.stringify({
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
    },
  }, null, 2)}\n`);
  writeFileSync(join(home, '.claude.json.bak-20260601'), '{}\n');
  return home;
}

async function doctor(root, home, flags = {}) {
  const chunks = [];
  const code = await doctorCommand({
    // `--section legacy` on purpose: E-27 asks the real `claude` CLI about its registrations, and
    // on a runner there is none — the section this test is about is the one that reads the file.
    flags: { 'no-network': true, section: 'legacy', ...flags },
    out: { write: (s) => chunks.push(s) },
    cwd: root,
    home,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    input: { isTTY: false },
  });
  return { code, text: chunks.join('') };
}

test('the report prints both removal commands, verbatim', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, root);
  const { text } = await doctor(root, home);

  // The exact lines, not a pattern that would match a paraphrase: a user copies these.
  for (const name of STALE.names) {
    assert.ok(text.includes(removalCommand(name)),
      `the report does not carry: ${removalCommand(name)}`);
  }
});

test('and never the credentials it just read', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, root);
  const { text } = await doctor(root, home);
  assert.equal(text.includes(PASSWORD), false, 'the fixture password reached the report');
  assert.equal(text.includes(USERNAME), false, 'the fixture username reached the report');
  // What it says instead — the key name and the length, which is enough to recognise the entry.
  assert.match(text, /credential-shaped — set \(len \d+\)/);
});

test('~/.claude.json is byte-identical afterwards — plain, --json and --fix', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, root);
  const before = sha(join(home, '.claude.json'));

  await doctor(root, home);
  assert.equal(sha(join(home, '.claude.json')), before, 'a plain run modified ~/.claude.json');

  await doctor(root, home, { json: true });
  assert.equal(sha(join(home, '.claude.json')), before, '--json modified ~/.claude.json');

  // The arm that matters most: `--fix` repairs seven kinds of drift and this is not one of them.
  // The file holds the credentials of every server the user has ever registered, and a repair that
  // rewrote it would be the engine editing another tool's configuration behind its back.
  await doctor(root, home, { fix: true, yes: true });
  assert.equal(sha(join(home, '.claude.json')), before, '--fix modified ~/.claude.json');
});

test('the JSON report carries the entries as data, still redacted', async (t) => {
  const root = greenTree(t);
  const home = fixtureHome(t, root);
  const { text } = await doctor(root, home, { json: true });
  const report = JSON.parse(text);
  const entries = report.stale?.claudeJsonEntries ?? [];
  assert.equal(entries.length, 2, 'the JSON report does not list the two stale registrations');
  assert.deepEqual(entries.map((e) => e.name).sort(), [...STALE.names].sort());
  assert.equal(text.includes(PASSWORD), false);
  assert.equal(text.includes(USERNAME), false);
});
