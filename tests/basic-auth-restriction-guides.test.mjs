// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C313 — the install guides name ServiceNow's Basic authentication restriction.
 *
 * Two users of 2.2.6 on Windows could not connect, although their passwords were right: their accounts lacked the role `snc_basic_auth_api_access`. Where the
 * restriction is enforcing, a Basic authentication call to the API is blocked unless the account has that role, is a web services access only account, or presents
 * a valid one-time password (vendor/ServiceNowDocs/markdown/platform-security/authentication/basic-auth-restriction.md). The product then answers 401: the wizard's
 * login check (question 6) says AUTHENTICATION_FAILED and `instance test` says `auth: auth failed`. Neither guide said that a right password can be refused, so a reader
 * retyped it (each failed login brings the account nearer to a lockout) and looped on `set-credentials`.
 *
 * What these tests hold, for the Windows guide and the macOS guide, each with its interactive page:
 *   1. the two messages the guides quote are the ones the product prints on a 401: derived from the registry and from the probe, and read from a real run of the
 *      wizard and of `instance test` against a login that is refused (the guides' own tests read the product the same way);
 *   2. question 6's "If it fails" says where to go when the password is right;
 *   3. "If something goes wrong" has the row right after the login-check row, in the words approved for it, and in the spelling of the reader's computer;
 *   4. the page's problem list has the row, in the same words, under Step 6;
 *   5. the two guides' rows are one text in two spellings;
 *   6. the user guide's page sends a reader who gets AUTHENTICATION_FAILED to the same row, in the three places that told them to change the password.
 * The words are held literally, as the guides' other sentences are: a change of them is a change of this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const href = (rel) => pathToFileURL(join(root, rel)).href;
const dist = (rel) => import(href(`packages/snowarch/dist/${rel}`));

const { remedyFor } = await dist('errors/codes.js');
const { probeFieldText } = await dist('servicenow/probes.js');
const { cliSpelling, bootstrapSpelling } = await dist('cli/tty.js');
const { runAdd, runTest } = await dist('cli/instance.js');
const { saveStore } = await dist('store/index.js');
const { ServiceNowError } = await dist('utils/errors.js');

// ── what the product prints ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The wizard's sentence is the registry's `meaning` (authFailedRetry prints it with "Attempt N of 3." after it); `instance test` prints the probe's field. Both are
// quoted without a closing full stop, so that the guide's code span does not end in one.
const WIZARD = `AUTHENTICATION_FAILED — ${remedyFor('AUTHENTICATION_FAILED').meaning.replace(/\.$/, '')}`;
const TEST = probeFieldText('auth', 'auth failed');
const ROLE = 'snc_basic_auth_api_access';

const SYSTEMS = [
  { name: 'Windows', md: 'docs/INSTALL-WINDOWS.md', page: 'docs/AI-Architect-Windows-Install-Guide.html', cli: cliSpelling('win32', {}), boot: bootstrapSpelling('win32', {}), ctrl: 'Ctrl+C' },
  { name: 'macOS', md: 'docs/INSTALL-MACOS.md', page: 'docs/AI-Architect-macOS-Install-Guide.html', cli: cliSpelling('darwin', { SHELL: '/bin/zsh' }), boot: bootstrapSpelling('darwin', { SHELL: '/bin/zsh' }), ctrl: 'Control+C' },
];

// ── the words ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const c = (s) => `\`${s}\``;
const b = (s) => `**${s}**`;
const SENTENCE = 'If they are right (you can log in with them in the browser) and it still fails, see the Basic authentication row in "If something goes wrong".';
const BULLET_START = 'the message says why. Most often the address, user name or password has a typo. Nothing has been saved: press';
const bullet = (s) => `- ${b('If it fails:')} ${BULLET_START} ${b(s.ctrl)} and run ${c(s.boot)} again. ${SENTENCE}`;
const first = (s) => `The login check (question 6) says ${c(WIZARD)}, or ${c(`${s.cli} instance test pdi`)} says ${c(TEST)}, although you can log in to the instance in the browser `
  + 'with the same user name and password (Basic authentication restriction)';
const second = (s) => 'Do not retype the password; it is right. The instance blocks Basic authentication for API calls unless the account is allowed '
  + "(ServiceNow's Basic authentication restriction). Ask the instance's administrator to allow your account: "
  + `${b('All › Basic Auth Restriction › Properties')}, table ${b('Identified Users')}, decision ${b('Maintain current login — Basic Auth API and UI login allowed')}. `
  + `This gives your account the role ${c(ROLE)}; the administrator needs the ${c('security_admin')} role to change it. `
  + `Do not ask for ${b('Convert to web service access only account')}: it blocks your own login in the browser. `
  + `Then, in the wizard, press ${s.ctrl} and run ${c(s.boot)} again; if it was ${c('instance test')} that failed, run it again. `
  + `The other way: the administrator gives you an OAuth client ID and secret, and you choose ${c('2')} at question 4.`;
// The user guide's page: the same advice, in the three places that told a reader who got AUTHENTICATION_FAILED to change the password.
const USER_SENTENCE = `If you can log in to the instance in the browser with the same user name and password, the password is right: ask the instance's administrator to allow your account `
  + `for Basic authentication (the role ${ROLE}), as in the install guide's Basic authentication row.`;

// ── reading the files ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const fold = (s) => s.replace(/\s+/g, ' ').trim();
const plain = (s) => fold(s.replace(/[“”"`*]/g, ''));
const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s) => s.replace(/&(?:lt|gt|amp|quot|#39|nbsp);/g, (e) => ENTITIES[e]);
const textOf = (markup) => plain(decode(markup.replace(/<[^>]+>/g, '')));
function pageOf(file) {
  const html = read(file);
  const data = JSON.parse(/<script type="application\/json" id="guide-data">([\s\S]*?)<\/script>/.exec(html)[1]);
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
  return { data, markup };
}
const section = (md, heading) => { const i = md.indexOf(heading); assert.ok(i >= 0, `no ${heading}`); const j = md.indexOf('\n#', i + heading.length); return md.slice(i, j < 0 ? undefined : j); };
function tableAfterLogin(md) {
  const rows = section(md, '## If something goes wrong').split('\n').filter((l) => /^\| .+ \| .+ \|$/.test(l)).map((l) => /^\| (.+?) \| (.+) \|$/.exec(l).slice(1));
  const at = rows.findIndex(([see]) => see === 'The login check (question 6) fails');
  assert.ok(at >= 0, 'the login-check row is not in the table');
  return { rows, at };
}

// ── a real run of the product against a login that is refused ───────────────────────────────────────────────────────────────────────────────
const URL_PDI = 'https://dev12345.service-now.com';
const refused401 = () => ({ queryRecords: async () => { throw new ServiceNowError('User Not Authenticated', 'AUTHENTICATION_FAILED', { status: 401 }); } });
const reachable = async () => ({ ok: true, status: 200, latencyMs: 1 });
const screen = (answers, password) => {
  const queue = [...answers];
  const out = [];
  return { out, ask: async (prompt) => { out.push(prompt); return queue.length ? queue.shift() : null; }, write: (s) => { out.push(s); }, secret: async () => password, text: () => out.join('') };
};

test('ARC-09-C313 — the messages the guides quote are what the product prints on a 401: the wizard at question 6 and instance test', async (t) => {
  const dir = tempDir('snowarch-c313-', t);
  const storePath = join(dir, 'instances.json');
  const password = ['pw', 'of', 'the', 'test'].join('-');
  assert.match(WIZARD, /^AUTHENTICATION_FAILED — The instance rejected the credentials/, 'the registry sentence is not the one the wizard says');
  assert.equal(TEST, 'auth: auth failed');

  // the wizard, a refused login, and the third choice of its menu (abort)
  const wizard = screen(['3'], password);
  const added = await runAdd({ label: 'pdi', url: URL_PDI, environment: 'pdi', auth: 'basic', username: 'svc.snowarch', preset: 'pdi-developer' }, wizard,
    { storePath, makeClient: refused401, reachability: reachable, env: {} });
  assert.equal(added.exitCode, 1);
  assert.ok(wizard.text().includes(`${WIZARD}. Attempt 2 of 3.`), `the wizard did not print the quoted sentence:\n${wizard.text()}`);

  // `instance test` on a stored instance whose login is refused
  const flags = { WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true', ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' };
  saveStore(storePath, { version: 1, defaultInstance: 'pdi', instances: { pdi: {
    url: URL_PDI, environment: 'pdi', preset: 'pdi-developer', flags, prodWriteAck: false, toolPackage: 'full', maxRecords: 100,
    auth: { method: 'basic', username: 'svc.snowarch', password },
  } } });
  const probe = screen([], password);
  const code = await runTest({ label: 'pdi' }, probe, { storePath, makeClient: refused401, reachability: reachable, env: {} });
  assert.equal(code, 1);
  assert.ok(probe.text().includes(`Probes: ${TEST} · `), `instance test did not print the quoted field:\n${probe.text()}`);
  assert.equal(probe.text().includes('AUTHENTICATION_FAILED'), false, 'instance test now prints AUTHENTICATION_FAILED: the row names the two messages as they were');

  // and each guide quotes both, in the row that follows the login-check row
  for (const s of SYSTEMS) {
    const { rows, at } = tableAfterLogin(read(s.md));
    assert.ok(rows[at + 1]?.[0].includes(c(WIZARD)) && rows[at + 1][0].includes(c(TEST)), `${s.name}: the row after the login-check row does not quote the product's two messages`);
  }
});

test('ARC-09-C313 — question 6 of each install guide, and of its page, sends a reader whose password is right to the Basic authentication row', () => {
  for (const s of SYSTEMS) {
    const md = read(s.md);
    const q6 = section(md, '#### Question 6 of 7 · Login check');
    const line = q6.split('\n').find((l) => l.startsWith('- **If it fails:**'));
    assert.equal(line, bullet(s), `${s.name}: the bullet of question 6`);
    const { markup } = pageOf(s.page);
    const from = markup.indexOf('<h3>Login check</h3>');
    assert.ok(from >= 0, `${s.name}: the page has no Login check question`);
    const q6page = textOf(markup.slice(from, markup.indexOf('<h3>', from + 5)));
    assert.ok(q6page.includes(plain(`The ${BULLET_START.replace(/^the /, '')} ${s.ctrl} and run ${s.boot} again. ${SENTENCE}`)), `${s.name}: the page's "If it fails" of question 6`);
  }
});

test('ARC-09-C313 — each install guide has the Basic authentication row right after the login-check row, in the words approved for it and in its own spelling', () => {
  for (const s of SYSTEMS) {
    const { rows, at } = tableAfterLogin(read(s.md));
    assert.deepEqual(rows[at + 1], [first(s), second(s)], `${s.name}: the row after "The login check (question 6) fails"`);
    assert.equal(rows.filter(([see]) => see.includes('(Basic authentication restriction)')).length, 1, `${s.name}: the row is not there exactly once`);
    assert.ok(rows[at + 1][0].includes(s.cli) && rows[at + 1][1].includes(s.boot), `${s.name}: the row does not use this computer's spelling`);
    assert.equal(rows[at + 1].join(' ').includes(s.name === 'Windows' ? 'Control+C' : 'Ctrl+C'), false, `${s.name}: the row has the other computer's key`);
  }
});

test('ARC-09-C313 — each page has the row in its list of problems, in the guide\'s words, and offers it under Step 6', () => {
  for (const s of SYSTEMS) {
    const { data, markup } = pageOf(s.page);
    const ids = data.trouble.map((r) => r.id);
    const at = ids.indexOf('login-check');
    assert.ok(at >= 0 && ids[at + 1] === 'basic-auth', `${s.name}: "basic-auth" is not the problem right after "login-check": ${ids.slice(at, at + 3)}`);
    const row = data.trouble[at + 1];
    assert.equal(plain(row.see), plain(first(s)), `${s.name}: what you see`);
    assert.equal(plain(row.do), plain(second(s)), `${s.name}: what to do`);
    assert.equal(row.href, '#step-6d');
    assert.equal(row.link, 'Step 6d');
    assert.ok(markup.includes('id="step-6d"'), `${s.name}: the page has no Step 6d to link to`);
    for (const word of ['401', 'authentication_failed', ROLE, 'basic authentication restriction']) assert.ok(row.k.includes(word), `${s.name}: the keywords lack ${word}`);
    const step6 = data.stepTrouble['step-6'];
    assert.equal(step6[step6.indexOf('login-check') + 1], 'basic-auth', `${s.name}: Step 6 does not list the row right after the login-check row`);
  }
});

test('ARC-09-C313 — the two guides\' rows and sentences are one text in two spellings', () => {
  const [win, mac] = SYSTEMS;
  const toMac = (text) => text.replaceAll(win.cli, mac.cli).replaceAll(win.boot, mac.boot).replaceAll(win.ctrl, mac.ctrl);
  const w = tableAfterLogin(read(win.md));
  const m = tableAfterLogin(read(mac.md));
  assert.equal(toMac(w.rows[w.at + 1][0]), m.rows[m.at + 1][0]);
  assert.equal(toMac(w.rows[w.at + 1][1]), m.rows[m.at + 1][1]);
  assert.equal(toMac(bullet(win)), bullet(mac));
  const pw = pageOf(win.page).data.trouble.find((r) => r.id === 'basic-auth');
  const pm = pageOf(mac.page).data.trouble.find((r) => r.id === 'basic-auth');
  assert.equal(toMac(pw.see), pm.see);
  assert.equal(toMac(pw.do), pm.do);
  assert.equal(pw.k, pm.k);
});

test('ARC-09-C313 — the user guide\'s page sends a reader who gets AUTHENTICATION_FAILED to the same row, in the three places that said to change the password', () => {
  const { data, markup } = pageOf('docs/AI-Architect-User-Guide.html');
  const row = /<tr><td><code class="ic">AUTHENTICATION_FAILED<\/code><\/td>[\s\S]*?<\/tr>/.exec(markup);
  assert.ok(row, 'the error table has no AUTHENTICATION_FAILED row');
  assert.ok(textOf(row[0]).includes(plain(USER_SENTENCE)), 'the error table\'s AUTHENTICATION_FAILED row');
  for (const id of ['auth-failed', 'login-check']) {
    const entry = data.trouble.find((r) => r.id === id);
    assert.ok(entry && plain(entry.do).endsWith(plain(USER_SENTENCE)), `the problem "${id}" does not end with the sentence`);
  }
  for (const id of ['auth-failed', 'login-check']) assert.ok(data.trouble.find((r) => r.id === id).k.includes('basic authentication restriction'), `the keywords of "${id}"`);
  // the row it points to is there, under the name it gives, in both install guides
  for (const s of SYSTEMS) assert.ok(tableAfterLogin(read(s.md)).rows.some(([see, doIt]) => see.endsWith('(Basic authentication restriction)') && doIt.includes(c(ROLE))), `${s.name}: no Basic authentication row names the role`);
});
