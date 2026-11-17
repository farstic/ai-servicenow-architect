// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 — the recorded transcript fixtures hold no identity.
//
// tests/fixtures/transcripts/ are captures of real Claude Code sessions, sanitised BY KEY (MANIFEST.json says how). A capture carries
// the identity of the account that made it under keys the sanitiser's author may never have looked at: the first set went out with the
// account id unreplaced, because the sanitiser replaced what its author had noticed, by value, and nothing failed when a value survived.
// This test holds the property itself, whatever the sanitiser does:
//   1. accountUuid, organizationUuid and userEmail, wherever they occur (JSON texts inside strings included), equal their registered
//      placeholder;
//   2. no other identity-named key carries a value that is not a placeholder;
//   3. no string holds an e-mail address other than the two allowed, a home directory or an Anthropic key;
// and it proves it can fail: a value planted at run time (so that no real one is ever written here) is found under each registered key,
// under an unregistered identity-named key, inside a JSON text and in free text, and a finding NEVER contains the value it found, because
// a failing run prints into a CI log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests/fixtures/transcripts');

/** The registered placeholders: a fixture holds these values under these keys and no others. */
const PLACEHOLDER = Object.freeze({
  accountUuid: '00000000-0000-4000-8000-0000000000a0',
  organizationUuid: '00000000-0000-4000-8000-000000000000',
  userEmail: 'user@example.test',
});
// A key whose NAME says it identifies an account, a person, a device or a machine, or holds a credential. Token COUNTERS (max_tokens,
// input_tokens) and the transcript's own ids (uuid, sessionId, requestId) are not on it.
const IDENTITY_KEY = /(account|organi[sz]ation|e-?mail|device|machine|host_?name|login|display_?name|user_?name|user_?id|fingerprint|serial|api_?key|secret|password|cookie)/i;
// What a value of an unregistered identity-named key may be: a squashed payload, a replaced signature, a placeholder uuid (the all-zero
// template, at most its last three digits free), the e-mail placeholder.
const PLACEHOLDER_SHAPE = [/^\[sanitised: \d+ chars\]$/, /^sanitised-[a-z-]+$/, /^0{8}-0{4}-4000-8000-0{9}[0-9a-f]{3}$/, /^user@example\.test$/];
const ALLOWED_EMAIL = new Set(['user@example.test', 'noreply@anthropic.com']);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// Spelled in pieces: the repository's own scanners look for these paths, and this file must not trip them.
const HOME_DIRS = [new RegExp(`/${'Users'}/`), new RegExp(`/${'home'}/(?!dev(?:/|$|[^\\w.-]))[\\w.-]+`), new RegExp(`[A-Za-z]:\\\\${'Users'}\\\\`)];
const ANTHROPIC_KEY = new RegExp(`${'sk'}-ant-[A-Za-z0-9_-]{8,}`);

const isPlaceholderValue = (v) => v === null || typeof v === 'boolean' || v === '' || (typeof v === 'string' && PLACEHOLDER_SHAPE.some((re) => re.test(v)));

/** Findings for one string: the path and the reason, never the string. */
function textFindings(text, path) {
  const out = [];
  for (const m of text.matchAll(EMAIL)) if (!ALLOWED_EMAIL.has(m[0])) { out.push(`${path}: an e-mail address other than the allowed ones`); break; }
  if (HOME_DIRS.some((re) => re.test(text))) out.push(`${path}: a home directory`);
  if (ANTHROPIC_KEY.test(text)) out.push(`${path}: an Anthropic key`);
  return out;
}

/** `{ findings, seen }` for one parsed value: `where` names the file and row, no finding contains a value, `seen` counts the registered keys met. */
function identityScan(value, where) {
  const out = [];
  const seen = { accountUuid: 0, organizationUuid: 0, userEmail: 0 };
  const visit = (v, path) => {
    if (typeof v === 'string') {
      const head = v.trimStart()[0];
      if ((head === '{' || head === '[') && v.length > 2) {
        try { visit(JSON.parse(v), `${path}(json)`); return; } catch { /* plain text */ }
      }
      out.push(...textFindings(v, `${where} ${path}`));
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => visit(x, `${path}[]`)); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (Object.hasOwn(PLACEHOLDER, k)) {
        seen[k] += 1;
        if (x !== PLACEHOLDER[k]) out.push(`${where} ${p}: not its registered placeholder`);
      } else if (IDENTITY_KEY.test(k) && x !== null && typeof x !== 'object' && !isPlaceholderValue(x)) {
        out.push(`${where} ${p}: an identity-named key with a value that is not a placeholder`);
      } else visit(x, p);
    }
  };
  visit(value, '');
  return { findings: out, seen };
}
const identityFindings = (value, where) => identityScan(value, where).findings;

const fixtureFiles = () => readdirSync(DIR, { recursive: true }).map((f) => f.replaceAll('\\', '/')).filter((f) => f.endsWith('.jsonl')).sort();

test('ARC-09-C263 — every recorded transcript fixture is free of identity, and the guard looked at the keys it guards', (t) => {
  const files = fixtureFiles();
  assert.ok(files.length >= 14, `${files.length} fixture files`);
  const findings = [];
  const seen = { accountUuid: 0, organizationUuid: 0, userEmail: 0 };
  let rows = 0;
  for (const f of files) {
    readFileSync(join(DIR, f), 'utf8').split('\n').filter(Boolean).forEach((line, i) => {
      rows += 1;
      const r = identityScan(JSON.parse(line), `${f}:${i + 1}`);
      findings.push(...r.findings);
      for (const k of Object.keys(seen)) seen[k] += r.seen[k];
    });
  }
  const manifest = JSON.parse(readFileSync(join(DIR, 'MANIFEST.json'), 'utf8'));
  findings.push(...identityFindings(manifest, 'MANIFEST.json'));
  assert.deepEqual(findings, [], 'identity in a recorded fixture (the findings name the place, never the value)');
  // Not vacuous: the registered keys are in the fixtures, so a walker that stopped looking would fail here and not pass silently.
  assert.ok(seen.accountUuid >= 1 && seen.organizationUuid >= 1, `the walk saw ${JSON.stringify(seen)}`);
  t.diagnostic(`${files.length} files, ${rows} rows, registered keys seen: ${JSON.stringify(seen)}`);
});

test('ARC-09-C263 — the registered placeholders are placeholders, and the manifest says how the fixtures were sanitised', () => {
  for (const [k, v] of Object.entries(PLACEHOLDER)) {
    assert.ok(isPlaceholderValue(v), `${k} is registered with a value that is not placeholder-shaped`);
    if (/^[0-9a-f-]{36}$/.test(v)) assert.match(v, /^0{8}-0{4}-4000-8000-0{9}[0-9a-f]{3}$/, `${k}: a placeholder uuid is the all-zero template with at most its last three digits free`);
  }
  const about = JSON.parse(readFileSync(join(DIR, 'MANIFEST.json'), 'utf8'))._about;
  assert.match(about, /Sanitised BY KEY/);
  assert.ok(about.includes('tests/transcript-fixtures-identity.test.mjs') && existsSync(join(ROOT, 'tests/transcript-fixtures-identity.test.mjs')), 'the manifest names this test');
});

test('ARC-09-C263 — the guard can fail: a planted value is found under each key and shape, and no finding contains it', () => {
  const hex = () => randomBytes(32).toString('hex');
  const person = () => randomUUID().replaceAll('-', '').slice(0, 12);
  const cases = [
    ['accountUuid', () => { const v = randomUUID(); return [v, { type: 'session-owner', accountUuid: v }]; }],
    ['organizationUuid', () => { const v = randomUUID(); return [v, { type: 'attachment', attachment: { type: 'credential_org', organizationUuid: v } }]; }],
    ['userEmail, deep inside an attachment', () => { const v = `${person()}@example.org`; return [v, { attachment: { context: { userEmail: v } } }]; }],
    ['an identity-named key the registry does not know', () => { const v = hex(); return [v, { message: { deviceId: v } }]; }],
    ['a JSON text inside a string', () => { const v = randomUUID(); return [v, { content: JSON.stringify({ accountUuid: v }) }]; }],
    ['an e-mail address in free text', () => { const v = `${person()}@example.org`; return [v, { text: `written by ${v} today` }]; }],
    ['a home directory in free text', () => { const v = person(); return [v, { cwd: `/${'Users'}/${v}/work` }]; }],
    ['an Anthropic key in free text', () => { const v = `${'sk'}-ant-${randomBytes(12).toString('hex')}`; return [v, { text: `key ${v}` }]; }],
  ];
  for (const [name, make] of cases) {
    const [value, row] = make();
    const found = identityFindings(row, 'planted:1');
    assert.ok(found.length >= 1, `the guard missed: ${name}`);
    assert.ok(!found.join('\n').includes(value), `a finding printed the planted value: ${name}`);
  }
  // ...and what it must NOT flag: the placeholders in the same places, squashed payloads, counters, the allowed e-mail, /home/dev.
  const clean = [
    { type: 'session-owner', accountUuid: PLACEHOLDER.accountUuid, organizationUuid: PLACEHOLDER.organizationUuid },
    { attachment: { context: { userEmail: PLACEHOLDER.userEmail } } },
    { content: JSON.stringify({ accountUuid: PLACEHOLDER.accountUuid }) },
    { message: { deviceId: '[sanitised: 40 chars]', usage: { input_tokens: 12, max_tokens: 64000 } } },
    { text: 'Co-Authored-By: Claude <noreply@anthropic.com>', cwd: '/home/dev/.claude/projects/-work-probe', other: '/work/probe' },
  ];
  for (const row of clean) assert.deepEqual(identityFindings(row, 'clean:1'), [], JSON.stringify(row));
});
