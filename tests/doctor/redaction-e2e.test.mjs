// ARC-08-S11 — the credential never reaches the report. End to end, through the real command.
//
// `redact.test.mjs` proves the mask functions. This proves the PATH: a store with a real-shaped
// username and a real password, read by the real `doctorCommand`, rendered as text, as JSON and
// through `--fix` — and the two strings searched for in all three outputs. The unit test cannot
// catch a check that reads the store itself and puts the raw value in its `detail`, because that
// check never calls the masker; only reading the finished output can.
//
// README criterion 3. Runs on all three platforms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { greenTree, linkInstall, readJson } from './helpers/tree.mjs';

/**
 * The fixture credential.
 *
 * ASSEMBLED, never spelled: this file is itself scanned by the commit-time secret sweep, and a
 * literal password here would be a hit in its own check. The username is `someone.fixture@…` on
 * `corp.example.com` — the reserved example domain, and no real person's name, which is the rule of
 * record for every fixture in this repository. The password is random per run, so a test that
 * passed by coincidentally not printing one particular string cannot keep passing.
 */
const USERNAME = ['someone', '.', 'fixture', '@', 'corp.example.com'].join('');
const PASSWORD = randomBytes(18).toString('base64url').slice(0, 24);

function liveTreeWithStore(t) {
  const root = greenTree(t, { mode: 'live' });
  linkInstall(root);
  const serverKey = readJson(root, 'engine.config.json').mcp.serverKey;
  writeFileSync(join(root, '.claude/settings.local.json'),
    `${JSON.stringify({ enabledMcpjsonServers: [serverKey] }, null, 2)}\n`);

  mkdirSync(join(root, '.local'), { recursive: true });
  const storePath = join(root, '.local', 'instances.json');
  // The store as the WIZARD writes it — `version`, `method`, the six flags, the preset and the
  // caps. A fixture missing one of them loads as "unconfigured", and a redaction test against a
  // report with no instance in it passes by having nothing to redact.
  writeFileSync(storePath, `${JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://dev00000.service-now.com',
        environment: 'pdi',
        auth: { method: 'basic', username: USERNAME, password: PASSWORD },
        preset: 'pdi-developer',
        flags: {
          WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
          ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
        },
        toolPackage: 'full',
        maxRecords: 100,
        prodWriteAck: false,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(storePath, 0o600);
  return { root, storePath };
}

async function run(root, flags) {
  const chunks = [];
  const errs = [];
  const code = await doctorCommand({
    flags: { 'no-network': true, ...flags },
    out: { write: (s) => chunks.push(s) },
    // Captured, and checked too: stdout under `--json` must be the object and nothing else, but a
    // credential is no more acceptable on stderr — a user pastes both.
    err: { write: (s) => errs.push(s) },
    cwd: root,
    input: { isTTY: false },
  });
  return { code, text: chunks.join(''), errText: errs.join('') };
}

/** The assertion, in one place: three outputs, one rule. */
function assertRedacted(what, text) {
  assert.ok(!text.includes(PASSWORD), `${what}: the PASSWORD reached the output`);
  assert.ok(!text.includes(USERNAME), `${what}: the username reached the output unmasked`);
  // The local part before the first character must be gone too — masking that produced
  // `someone.fixture@…` would leak the name while looking redacted.
  assert.ok(!text.includes('someone.fixture'), `${what}: the local part survived`);
}

test('the text report carries neither the username nor the password', async (t) => {
  const { root } = liveTreeWithStore(t);
  const { text } = await run(root, { quick: true });
  assertRedacted('text', text);
  assert.ok(text.length > 200, 'the report is too short to have reported anything');
});

test('--json is the object and nothing else, masked username, no password', async (t) => {
  const { root } = liveTreeWithStore(t);
  // NOT `--quick`: the instance listing comes from the SERVER's own doctor answer, and `--quick`
  // skips everything that spawns. This is the case that matters — the one output that carries an
  // account name at all — so it pays for the spawn. `--no-network` still keeps the probes off.
  const { text, errText } = await run(root, { json: true });
  assertRedacted('json', text);
  assertRedacted('json/stderr', errText);
  // Not `.includes('{')` — the whole point is that nothing precedes it. A cache note used to be
  // printed here on any machine where `.local` refused the write, and every consumer's parse threw.
  assert.equal(text.trimStart()[0], '{', `--json did not start with the object:\n${text.slice(0, 120)}`);
  const report = JSON.parse(text);
  const entry = report.server?.instances?.[0];
  assert.ok(entry, 'the report lists no instance — then it is not exercising the store');
  // What it DOES carry: the shape, masked. `s***@corp.example.com` — enough to recognise which
  // account it is, not enough to be one.
  assert.match(entry.username, /^s\*\*\*@corp\.example\.com$/);
  assert.ok(!JSON.stringify(report).includes(PASSWORD), 'the password is somewhere in the JSON');
});

test('--fix prints its plan without printing the credential', async (t) => {
  const { root } = liveTreeWithStore(t);
  // `--fix` reads the store to decide what it can repair and prints a plan naming the targets, so
  // it is the output most likely to quote an entry back. `--yes` because a non-TTY run would
  // otherwise stop at the prompt and prove nothing.
  const { text } = await run(root, { fix: true, yes: true, quick: true });
  assertRedacted('--fix', text);
});

test('--fix --json is JSON, and redacted', async (t) => {
  const { root } = liveTreeWithStore(t);
  const { text } = await run(root, { fix: true, yes: true, quick: true, json: true });
  assertRedacted('--fix --json', text);
  JSON.parse(text);   // ARC-08-S06's finding: `--fix --json` must be one JSON object, not prose
});
