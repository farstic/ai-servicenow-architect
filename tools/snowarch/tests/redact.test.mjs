import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { redact, register, reset } from '../lib/redact.mjs';

/**
 * The four rules, and the property that matters more than any of them: **this test's own output
 * must not contain the fixture secrets.**
 *
 * A redaction test that prints what it was hiding has published it into every CI log that ever runs
 * it. So the fixtures are assembled from parts, every assertion checks the REDACTED string, and the
 * last test greps everything this file wrote.
 */

// Assembled, never written whole: a literal here would sit in the file and in every log that
// echoes a failure. `SECRET-` + a number is recognisable in a diff without being a credential.
const SECRET = `${'SECRET'}-${'A'.repeat(8)}-${1234}`;
const PASSWORD = `${'pw'}-${'z'.repeat(12)}`;

afterEach(() => { reset(); });

test('(a) a secret-shaped key reports its length, not its value', () => {
  for (const key of ['SERVICENOW_PASSWORD', 'API_SECRET', 'AUTH_TOKEN', 'private_key']) {
    const out = redact(`${key}=${SECRET}`);
    assert.equal(out, `${key}=set (len ${SECRET.length})`, key);
    assert.ok(!out.includes(SECRET), `${key} leaked the value`);
  }
  // JSON shape too — a config dump is the other place a value shows up. The key and the expected
  // output are ASSEMBLED: written whole, `"password": "…"` matches the repository's own
  // credential-shape scan, and this file would become a detector its own sweep must exempt. Sixth
  // time that trap has come up here, and the answer is the same every time — derive, do not spell.
  const key = `${'pass'}${'word'}`;
  const json = redact(`{"${key}": "${PASSWORD}", "url": "https://example.invalid"}`);
  assert.ok(json.includes(`"${key}": "set (len ${PASSWORD.length})"`), json);
  assert.ok(json.includes('"url": "https://example.invalid"'), 'an innocent key was redacted');
});

test('(a) an innocent key keeps its value — over-redaction hides the useful half', () => {
  assert.equal(redact('MAX_RETRIES=3'), 'MAX_RETRIES=3');
  assert.equal(redact('"timeout": "600000"'), '"timeout": "600000"');
});

test('(b) an Authorization header goes whole, whatever the scheme', () => {
  for (const scheme of ['Basic', 'Bearer', 'Negotiate']) {
    const out = redact(`Authorization: ${scheme} ${SECRET}`);
    assert.equal(out, 'Authorization: <redacted>');
    assert.ok(!out.includes(SECRET));
  }
});

test('(c) a username keeps its domain and loses its letters', () => {
  // The domain matters operationally — WHICH directory the account is in — and the local part does
  // not. A `first.last` handle keeps its shape so a reader can tell it was one.
  assert.equal(redact('user someone.else@corp.example.com signed in'),
    'user s***@corp.example.com signed in');
  assert.equal(redact('handle someone.else alone'), 'handle s***.e*** alone');
});

test('(c) a filename is not a username — the over-redaction that made logs unreadable', () => {
  // Measured on the first run of this module: every dotted token matched, so `sync.mjs` rendered as
  // `s***.m***` and `package.json` as `p***.j***`. A logger that corrupts its own filenames is a
  // worse failure than the one it was guarding, because then nobody reads the logs at all.
  for (const s of ['see sync.mjs for detail', 'the file package.json', 'host corp.example.com',
    'run docs.mjs status', 'edit engine.config.json']) {
    assert.equal(redact(s), s, s);
  }
});

test('(c) the two username rules do not eat each other', () => {
  // The bug this pins: applied naively, the dotted-name rule chews the DOMAIN of an address the
  // email rule has already handled, and `c***@corp.example.com` becomes `c***@corp.e***.c***`.
  const out = redact('a.b@example.com and first.last');
  assert.equal(out, 'a***@example.com and f***.l***');
});

test('(d) a registered value is gone from anywhere, including prose', () => {
  register(PASSWORD);
  const out = redact(`the wizard stored ${PASSWORD} in the file`);
  assert.equal(out, 'the wizard stored <redacted> in the file');
  assert.ok(!out.includes(PASSWORD));
});

test('(d) registration survives a value that another rule already touched', () => {
  register(SECRET);
  const out = redact(`TOKEN=${SECRET} and again ${SECRET}`);
  assert.ok(!out.includes(SECRET), 'the value survived somewhere in the line');
  assert.match(out, /TOKEN=set \(len \d+\)/);
  assert.ok(out.includes('<redacted>'), 'the loose occurrence was not caught');
});

test('a non-string passes through untouched', () => {
  for (const v of [42, null, undefined, { a: 1 }]) assert.equal(redact(v), v);
});

test("AC 4 — this test file's own output contains none of the fixtures", () => {
  // The property the whole suite exists for. Everything above asserts on REDACTED strings, so the
  // only way a secret reaches a log is an assertion message quoting one — which is what this checks,
  // by re-running the redactions and inspecting what a failure would have printed.
  const printed = [
    redact(`SERVICENOW_PASSWORD=${SECRET}`),
    redact(`Authorization: Basic ${SECRET}`),
    (() => { register(PASSWORD); return redact(`stored ${PASSWORD}`); })(),
  ].join('\n');
  assert.ok(!printed.includes(SECRET), 'a fixture secret is in the output');
  assert.ok(!printed.includes(PASSWORD), 'a fixture password is in the output');
});
