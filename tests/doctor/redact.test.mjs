import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  maskPath, maskUsername, redactDeep, redactResult, redactString,
} from '../../tools/snowarch/lib/doctor/redact.mjs';
import { register, reset } from '../../tools/snowarch/lib/redact.mjs';

/**
 * ARC-08-S01, AC 5 — nothing reaches a report unredacted, and the two implementations of the mask
 * rules agree.
 *
 * ONE FIXTURE TABLE, run against the engine's `maskUsername`/`maskPath` and against the server's in
 * `packages/snowarch/src/store/paths.ts`. They are two implementations of one rule — the engine is
 * stdlib-only and cannot import the server's — so the only thing keeping them together is a test
 * that fails when either moves.
 *
 * Every fixture value here is ASSEMBLED or obviously synthetic: no real name, address or account
 * appears in this repository, and a test about redaction is the last place to make an exception.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `someone@corp.example.com`-shaped, built from parts so this file spells no address. */
const ACCOUNT = ['someone', '@', 'corp.example.com'].join('');
const HANDLE = ['svc', '.', 'migration'].join('');

const USERNAMES = [
  [ACCOUNT, `s***@${ACCOUNT.split('@')[1]}`],
  ['admin', 'a***'],
  [HANDLE, 's***'],
  ['', ''],
];

test('AC 5 — a username keeps its domain and loses its name', () => {
  for (const [input, expected] of USERNAMES) assert.equal(maskUsername(input), expected, input);
});

test('AC 5 — the engine and the server mask the same way, from one table', () => {
  // The server's implementation, read as SOURCE and evaluated: `tools/snowarch/` must run before
  // `npm ci`, so it cannot import the built package — and a copy of the rule here would be the
  // third implementation rather than a check on the two.
  const source = readFileSync(join(root, 'packages/snowarch/src/store/paths.ts'), 'utf8');
  const body = /export function maskUsername\(u: string\): string \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(body, 'the server no longer exports maskUsername in the shape this test reads');
  // eslint-disable-next-line no-new-func
  const serverMask = new Function('u', body[1].replace(/: string/g, ''));
  for (const [input, expected] of USERNAMES) {
    if (input === '') continue;                       // the server returns the empty string as-is
    assert.equal(serverMask(input), expected, `the two maskers disagree about ${input}`);
  }
});

test('AC 5 — a home directory becomes ~, on both separators', () => {
  assert.equal(maskPath('/home/me/.local/instances.json', '/home/me'), '~/.local/instances.json');
  assert.equal(maskPath('/home/me', '/home/me'), '~');
  assert.equal(maskPath('C:\\Users\\me\\.local\\x', 'C:\\Users\\me'), '~\\.local\\x');
  assert.equal(maskPath('/srv/checkout/.local/x', '/home/me'), '/srv/checkout/.local/x');
});

test('AC 5 — a proxy keeps its host and loses its credentials', () => {
  assert.equal(redactString('HTTPS_PROXY=http://user:pw-fixture@proxy.example:8080'),
    'HTTPS_PROXY=http://***@proxy.example:8080');
});

test('AC 5 — a secret-shaped KEY redacts its value, whatever the value looks like', () => {
  const deep = redactDeep({
    SNOW_PASSWORD: 'summer', nested: { CLIENT_SECRET: 'abcd1234', note: 'fine' },
    list: ['plain', { API_KEY: 'k'.repeat(12) }],
  });
  assert.equal(deep.SNOW_PASSWORD, 'set (len 6)');
  assert.equal(deep.nested.CLIENT_SECRET, 'set (len 8)');
  assert.equal(deep.nested.note, 'fine');
  assert.equal(deep.list[1].API_KEY, 'set (len 12)');
});

test('AC 5 — the runner redacts a whole result: detail, remedy, command and data', () => {
  reset();
  const secret = ['pw', '-', 'fixture'].join('');
  register(secret);
  try {
    const out = redactResult({
      id: 'E-00',
      status: 'fail',
      detail: `login failed for ${ACCOUNT} with ${secret}`,
      remedy: `check /home/me/.local/instances.json`,
      command: `./snowarch instance set-credentials pdi`,
      data: { username: ACCOUNT, PASSWORD: secret, path: '/home/me/x' },
    }, { home: '/home/me' });

    const everything = JSON.stringify(out);
    assert.ok(!everything.includes(secret), 'a registered secret survived the redactor');
    assert.ok(!everything.includes(ACCOUNT), 'a full account name survived the redactor');
    assert.match(out.remedy, /~\/\.local\/instances\.json/);
    assert.equal(out.data.PASSWORD, `set (len ${secret.length})`);
    assert.match(out.data.path, /^~/);
    // `grep -c` on the report for either value returns 0 — the criterion, stated as the count.
    assert.equal((everything.match(new RegExp(secret, 'g')) ?? []).length, 0);
  } finally { reset(); }
});
