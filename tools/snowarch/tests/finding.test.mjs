// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C221 — `/snowarch finding`: a user's finding is masked before it leaves the engagement.
 *
 * The note stays in `clients/<engagement>/findings/`, which git ignores. The text the user sends to the person who
 * issued their licence is what leaves, so the masking is code with tests, never the model's care.
 *
 * THE CORPUS is the architect's privacy red-team of 2026-10-23: 32 cases a consultant could write into a finding,
 * 10 more shapes from its second pass, and 21 product strings that must come through unchanged. Measured with its
 * reference masker before this file was written: 6 of 42 cases still leak, every one a class no pattern catches
 * (people, places, a company named only by an abbreviation it was not told, a username variant, a MID host name, a
 * ticket key), 0 of 21 controls damaged, and the masking idempotent. ARC-09-C251 closed two of the six, the MID host
 * name and the ticket key that begin with a name the masker was given; the four left are asserted as residuals: each
 * surviving token is either in the "Read before sending" list the output ends with, or a class that list names.
 *
 * Secret-shaped values are ASSEMBLED at run time, as tests/doctor/json-boundary.test.mjs does, so the repository's
 * gitleaks scan reads no planted secret as a leaked one. Product versions are in the 9.x series.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, fstatSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync,
  writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tempDir } from './helpers/temp.mjs';
import { reset } from '../lib/redact.mjs';

const finding = () => import('../lib/finding.mjs');
const maskValues = () => import('../lib/mask-values.mjs');

const PW = ['Sup3r', 'S3cret!'].join('');
const PW_URL = ['Sup3r', 'S3cret'].join('');
const B64 = ['YWRtaW46', 'U3VwM3JTM2NyZXQh'].join('');
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'abcDEF123'].join('.');
const GHP = ['gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('');
const PEM = ['-----BEGIN ', 'CERTIFICATE-----\n', 'MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQUFADBaMQswCQYDVQQGEwJJ',
  '\n-----END ', 'CERTIFICATE-----'].join('');
const CURL_U = ['cu', 'rl -u ', 'admin', ':', PW].join('');
const PASSWORD_WORD = ['pass', 'word'].join('');
const URL_CREDS = ['https://ipetrov', ':', PW_URL, '@git.acmebank.com/itsm.git'].join('');

const STORE = { labels: ['acme-prod', 'acme-dev', 'dev', 'test', 'prod', 'pdi'], engagement: 'acme-bank',
  aliases: ['Acme', 'ABH', 'Acme Bank Holdings'], storeUrls: ['https://acmebank.service-now.com', 'https://servicedesk.acmebank.com'],
  usernames: ['svc_snowarch_acme', 'ipetrov'] };
const NOALIAS = { ...STORE, aliases: [] };
const SMALL = { engagement: 'acme-bank', aliases: ['Acme'], labels: ['dev', 'test', 'prod', 'pdi'],
  storeUrls: ['https://acmebank.service-now.com'], usernames: [] };

/** [id, text, values, tokens that must not survive] */
const LEAKS = [
  ['L01', 'Opened https://servicedesk.acmebank.com/now/sow/record/incident/9d385017c611228701d22104cc95c371 and the form hung.', STORE, ['acmebank', 'servicedesk', '9d385017']],
  ['L02', 'Link: https://acmebank.service-now.com/nav_to.do?uri=%2Fincident.do%3Fsys_id%3D9d385017c611228701d22104cc95c371', STORE, ['9d385017', 'acmebank']],
  ['L03', 'https://acmebank.service-now.com/now/nav/ui/classic/params/target/sys_user.do%3Fsys_id%3D62826bf03710200044e0bfc8bcbe5df1', STORE, ['62826bf0']],
  ['L04', 'sysparm_query=sys_idIN287ebd7da9fe198100f92cc8d1d2154e,8a4dde73c6112278017a6a4baf547aa7^active=true', STORE, ['287ebd7d', '8a4dde73']],
  ['L05', 'sys_update_name sys_script_include_9d385017c611228701d22104cc95c371 was not captured', STORE, ['9d385017']],
  ['L06', 'record 9D385017C611228701D22104CC95C371 from the Excel export', STORE, ['9D385017']],
  ['L07', 'SSO tenant 8f3e2c1a-4b5d-4e6f-9a8b-7c6d5e4f3a2b rejected the assertion', STORE, ['8f3e2c1a']],
  ['L08', 'works on https://acmebankdev.service-now.com but not on https://acmebank.service-now.com', STORE, ['acmebank']],
  ['L09', 'the acmebank instance and acmebankdev both show it', STORE, ['acmebank']],
  ['L10', 'MID Server mid-acme-prod-01 at 10.42.17.8 cannot reach 172.16.4.20:443', STORE, ['10.42.17.8', '172.16.4.20', 'acme']],
  ['L11', 'Ivan Petrov (the client ITSM process owner) rejected it; John Smith in Service Desk L2 agreed', STORE, ['Ivan Petrov', 'John Smith']],
  ['L12', "Assignment group 'ACME-ITSM-L2-Network' stopped routing", STORE, ['ACME']],
  ['L13', 'Acme Bank wants the escalation; AcmeBank legal (Acme Bank Holdings plc, ABH) signs off', STORE, ['Acme', 'ABH']],
  ['L13n', 'Acme Bank wants the escalation; AcmeBank legal (Acme Bank Holdings plc, ABH) signs off', NOALIAS, ['Acme', 'ABH']],
  ['L15', 'x_acme_itsm_case and u_acme_vip_flag fail the ACL', STORE, ['acme']],
  ['L16', 'the x_acmb_hr_onboard table and x_acmb_hr scope', STORE, ['acmb']],
  ['L17', 'CS0001234 HRC0001234 KB0012345 SCTASK0012345 CSTASK0012345 PRJTASK0010001 MMASSET0010001 CWSAREQ0000001 INC012345 inc0012345 CHG000567', STORE, ['PRJTASK', 'MMASSET', 'CWSAREQ', 'INC012345', 'inc0012345', 'CHG000567']],
  ['L18', 'logged in as svc_snowarch_acme, ipetrov and IPETROV01; ACMEBANK\\ipetrov on the MID host', STORE, ['svc_snowarch', 'ipetrov', 'ACMEBANK']],
  ['L19', "MID Server 'ACMEMID01' on mid01.corp.acmebank.local", STORE, ['ACMEMID01', 'acmebank']],
  ['L20', 'see /Users/ivan.petrov/work/snowarch/clients/acme-bank/designs/acme-bank-hld-v2.md', STORE, ['ivan.petrov', 'acme']],
  ['L21', 'C:\\Users\\ipetrov\\OneDrive - Acme Bank plc\\snowarch\\clients\\acme-bank\\x.md', STORE, ['ipetrov', 'Acme']],
  ['L22', 'mail from ipetrov@acme.com and ivan.petrov@acme-bank.co.uk bounced', STORE, ['ipetrov', 'ivan', 'acme']],
  ['L24', 'on ACME-PROD and Acme-Prod the flag is off', STORE, ['ACME-PROD', 'Acme-Prod']],
  ['L25', `${CURL_U} https://acmebank.service-now.com/api/now/table/incident`, STORE, [PW]],
  ['L26', `the integration ${PASSWORD_WORD}: ${PW} was rejected`, STORE, [PW]],
  ['L27', `header was Basic ${B64} and later Bearer ${JWT}`, STORE, [B64.slice(0, 8), JWT.slice(0, 8)]],
  ['L28', `remote ${URL_CREDS}`, STORE, [PW_URL, 'ipetrov', 'acmebank']],
  ['L29', "INC0012345 'Acme Online Banking outage for Platinum customers in Sofia'", STORE, ['Acme', 'Sofia', 'Platinum']],
  ['L30', 'caller_id.name=Ivan Petrov^active=true', STORE, ['Ivan Petrov']],
  ['L31', 'tracked as ACMEITSM-4521 in their Jira', STORE, ['ACMEITSM']],
  ['L32', 'ldaps://dc01.acmebank.local:636 and sftp.acmebank.com', STORE, ['acmebank']],
  ['L33', 'https://acmebank.service-now.com/sys_user.do?sysparm_view=acme_hr', STORE, ['acme_hr']],
  ['X01', "gs.eventQueue('acme.vip.escalation', current, 'ivan.petrov');", SMALL, ['ivan.petrov', 'acme.vip']],
  ['X02', 'caller_id.user_name=ivan.petrov^active=true', SMALL, ['ivan.petrov']],
  ['X03', 'sys_updated_by=ivan.petrov', SMALL, ['ivan.petrov']],
  ['X04', 'assigned to "ivan.petrov" and (maria.ivanova)', SMALL, ['ivan.petrov', 'maria.ivanova']],
  ['X05', 'SSL error: subject CN=servicedesk.acmebank.com, O=Acme Bank plc, L=Sofia, C=BG', SMALL, ['servicedesk', 'acmebank', 'Acme Bank', 'Sofia']],
  ['X06', 'bind DN OU=Users,OU=Sofia,DC=acmebank,DC=local failed', SMALL, ['Sofia', 'acmebank']],
  ['X07', `my token ${GHP} expired`, SMALL, [GHP]],
  ['X08', PEM, SMALL, ['MIIDdzCCAl']],
  ['X09', 'IBAN BG80BNBG96611020345678 on the vendor record', SMALL, ['BG80BNBG96611020345678']],
  ['X10', 'call +359 888 123 456 or 0888123456', SMALL, ['+359 888 123 456']],
];

/**
 * What no pattern catches, measured: each case's surviving tokens, and where the reader is told to look.
 * 'review' — the token is in the output's own "Read before sending" list. Otherwise, the class that list names.
 */
const RESIDUALS = {
  L11: 'review', // people
  L13n: 'abbreviations', // the company named only by an abbreviation the store and aliases do not hold
  L18: 'review', // a username variant
  // L19, a MID host name glued to the client's short name (ACMEMID01), left this table with ARC-09-C251: an alias of four letters
  // or more now masks the words it begins (the architect's ruling of 2026-10-29), so the case is masked like the others.
  L29: 'places', // places and product brands
  // L31, a ticket key in another system that begins with the client's short name (ACMEITSM-4521), left this table with ARC-09-C251, as L19 did.
};

/** [id, text, values, tokens that must come through unchanged] */
const CONTROLS = [
  ['C01', 'commit cb921c039edd493e335ff1e96fd2fc4a99d3eb5b', STORE, ['cb921c039edd493e335ff1e96fd2fc4a99d3eb5b']],
  ['C02', 'contract 0b7f3c1e9a2d4f6b8c0e1a3d5f7b9c2e4a6d8f0b1c3e5a7d9f2b4c6e8a0d1f3b', STORE, ['0b7f3c1e9a2d4f6b8c0e1a3d5f7b9c2e4a6d8f0b1c3e5a7d9f2b4c6e8a0d1f3b']],
  ['C03', 'Engine: snowarch 9.1.0-dev · contract 96d056414da5', STORE, ['9.1.0-dev', '96d056414da5']],
  ['C04', 'Mode: live — <x> · preset pdi-developer', STORE, ['pdi-developer']],
  ['C05', 'the ATF test step fails; Test / UAT', STORE, ['ATF test', 'Test / UAT']],
  ['C06', 'run ./snowarch instance set-preset x full --ack-prod', STORE, ['--ack-prod']],
  ['C07', 'tools/snowarch/lib/redact.mjs and .claude/skills/snowarch/SKILL.md', STORE, ['tools/snowarch/lib/redact.mjs', '.claude/skills/snowarch/SKILL.md']],
  ['C08', 'PN-24 ARC-09-C221 E-31 SV-02 INVALID_REQUEST AUTHENTICATION_FAILED SCRIPTING_NOT_ENABLED', STORE, ['PN-24', 'ARC-09-C221', 'E-31', 'SV-02', 'INVALID_REQUEST', 'AUTHENTICATION_FAILED', 'SCRIPTING_NOT_ENABLED']],
  ['C09', 'https://www.servicenow.com/docs/bundle/australia-it-service-management/page/product/incident-management/concept/c_IncidentManagement.html', STORE, ['https://www.servicenow.com/docs/bundle/australia-it-service-management']],
  ['C10', 'https://github.com/farstic/ai-servicenow-architect/issues/522', STORE, ['https://github.com/farstic/ai-servicenow-architect/issues/522']],
  ['C11', 'incident sys_choice sn_customerservice_case sys_user_group kb_knowledge sc_req_item x_snc_app', STORE, ['incident', 'sys_choice', 'sn_customerservice_case', 'x_snc_app']],
  ['C12', 'open the incident.do form, then problem.do and task.do', STORE, ['incident.do', 'problem.do', 'task.do']],
  ['C13', 'the BR calls current.update() and gs.info() and reads task.number', STORE, ['current.update', 'gs.info', 'task.number']],
  ['C14', 'Node 22.14.0, npm 10.9.2, zod 3.23.8, Windows 10.0.19045.3803, at 2026-10-23 09:00:15', STORE, ['22.14.0', '10.0.19045.3803', '09:00:15']],
  ['C15', 'after Windows update KB5034441; see https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB0817150', STORE, ['KB0817150']],
  ['C17', 'develop 5b5c0daf, merge 748b571, sha ab123456, short dd4567890', STORE, ['5b5c0daf', '748b571', 'ab123456', 'dd4567890']],
  ['C19', 'Engine: snowarch 9.0.4-rc.1 · tag v9.0.4-rc.1', STORE, ['9.0.4-rc.1', 'v9.0.4-rc.1']],
  ['C21', 'ISO27001, SHA256, ES2022, CVE-2025-12345, HTTP 401, RFC7231', STORE, ['ISO27001', 'SHA256', 'CVE-2025-12345', 'RFC7231']],
  ['C22', 'package.json, redact.mjs, governance-rules.md, sync.mjs', STORE, ['package.json', 'redact.mjs', 'governance-rules.md']],
  ['C23', "open 'incident.do' and set 'state' via g_form.setValue('state', 7); Engine: snowarch 9.1.0-dev · contract 96d056414da5", SMALL, ["'incident.do'", "g_form.setValue('state', 7)", '9.1.0-dev', '96d056414da5']],
  ['C24', 'PN-24 ARC-09-C221 E-31 INVALID_REQUEST ES2022 ISO27001 SHA256 at 2026-10-23 09:00:15 UTC, Node 22.14.0', SMALL, ['PN-24', 'ARC-09-C221', 'E-31', 'INVALID_REQUEST', 'ES2022', 'ISO27001', 'SHA256', '09:00:15', '22.14.0']],
];

const survivors = (out, tokens) => tokens.filter((t) => out.toLowerCase().includes(t.toLowerCase()));

test('ARC-09-C221 — every leak case is masked, except the measured residuals', async () => {
  const { maskFinding } = await finding();
  const leaked = [];
  for (const [id, text, values, tokens] of LEAKS) {
    if (id in RESIDUALS) continue;
    reset();
    const kept = survivors(maskFinding(text, values), tokens);
    if (kept.length) leaked.push(`${id}: ${kept.join(' · ')}`);
  }
  assert.deepEqual(leaked, [], 'a leak case let a client value through');
});

test('ARC-09-C221 — each residual is named to the reader: in the review list, or as a class the output names', async () => {
  const { maskFinding, reviewList, FIXED_REVIEW } = await finding();
  for (const [id, text, values, tokens] of LEAKS.filter(([i]) => i in RESIDUALS)) {
    reset();
    const out = maskFinding(text, values);
    const kept = survivors(out, tokens);
    assert.ok(kept.length > 0, `${id} no longer leaks: drop it from RESIDUALS`);
    if (RESIDUALS[id] === 'review') {
      const review = reviewList(out).map((r) => r.toLowerCase());
      for (const t of kept) assert.ok(review.some((r) => r.includes(t.toLowerCase())), `${id}: "${t}" is not in the review list`);
    } else {
      assert.ok(FIXED_REVIEW.join(' ').includes(RESIDUALS[id]), `${id}: the fixed list does not name ${RESIDUALS[id]}`);
    }
  }
});

test('ARC-09-C221 — every product control comes through unchanged', async () => {
  const { maskFinding } = await finding();
  const damaged = [];
  for (const [id, text, values, keep] of CONTROLS) {
    reset();
    const out = maskFinding(text, values);
    const gone = keep.filter((k) => !out.includes(k));
    if (gone.length) damaged.push(`${id}: ${gone.join(' · ')} → ${out}`);
  }
  assert.deepEqual(damaged, [], 'a product string was masked');
});

test('ARC-09-C221 — a URL that ends a clause keeps its punctuation, and a store host stays an instance URL', async () => {
  // Found in the first end-to-end run, after the corpus passed: the URL rule took the comma into the URL, so the
  // store's own host failed to parse and was tagged a plain <url>, and the sentence lost its comma.
  const { maskFinding } = await finding();
  reset();
  assert.equal(maskFinding('saw it on https://servicedesk.acmebank.com, then on https://acmebank.service-now.com/x. Again!', STORE),
    'saw it on <instance-url-1>, then on <instance-url-2>. Again!');
});

test('ARC-09-C221 — masking is idempotent over the whole corpus', async () => {
  const { maskFinding } = await finding();
  for (const [id, text, values] of [...LEAKS, ...CONTROLS]) {
    reset();
    const once = maskFinding(text, values);
    assert.equal(maskFinding(once, values), once, `${id} changes when masked twice`);
  }
});

test('ARC-09-C221 — the output says what ran first, and ends with what the reader must still check', async () => {
  const { renderFinding, FIXED_REVIEW } = await finding();
  reset();
  const read = renderFinding('Ivan Petrov saw INC0010001 on https://acmebank.service-now.com', STORE,
    { storeRead: true, credentialsRead: true });
  const lines = read.split('\n');
  assert.match(lines[0], /^instance names masked by value: \d+ \(store read\) · credentials read$/);
  assert.ok(read.includes('<record>') && read.includes('<instance-url-1>'), 'the masked text is not in the output');
  const tail = read.slice(read.lastIndexOf('Read before sending:'));
  assert.ok(read.lastIndexOf('Read before sending:') > 0, 'no "Read before sending:" section');
  assert.ok(tail.includes('Ivan Petrov'), 'the review list does not carry the person the masker kept');
  for (const item of FIXED_REVIEW) assert.ok(tail.includes(item), `the fixed list lost "${item}"`);
  for (const cls of ['people', 'places', 'company names', 'ticket keys', 'abbreviations', 'fewer than 6 digits',
    'a credential written in plain words']) {
    assert.ok(FIXED_REVIEW.join(' ').includes(cls), `the fixed list does not name ${cls}`);
  }
  const unread = renderFinding('text', STORE, { storeRead: false });
  assert.equal(unread.split('\n')[0],
    'instance store NOT read — check every instance name · credentials NOT read — check usernames and passwords before sending');
});

test('ARC-09-C221 — the two tiers are reported apart: credentials not read is said, in the header and in the review list', async () => {
  // The architect's measurement on 140754a0: in a worktree with no node_modules the credential tier's imports failed,
  // the failure was swallowed, usernames went unmasked, and the header still said "(store read)".
  const { renderFinding } = await finding();
  reset();
  const out = renderFinding('logged in as svc_snowarch_acme', STORE, { storeRead: true, credentialsRead: false });
  assert.match(out.split('\n')[0],
    /^instance names masked by value: \d+ \(store read\) · credentials NOT read — check usernames and passwords before sending$/);
  const tail = out.slice(out.lastIndexOf('Read before sending:'));
  assert.ok(tail.includes('credentials NOT read'), 'the review list does not say the credentials were not read');
});

test('ARC-09-C221 — a credential written in plain words is masked, and the plain words around it are not', async () => {
  const { maskFinding } = await finding();
  reset();
  const [a, b, c] = [['hun', 'ter2'].join(''), ['abc123', 'def456'].join(''), ['hun', 'ter3'].join('')];
  const out = maskFinding(`my ${PASSWORD_WORD} is ${a} and the token is ${b}; pwd ${c}`, SMALL);
  assert.deepEqual(survivors(out, [a, b, c]), [], `a plain-word credential survived: ${out}`);
  for (const plain of ['the token is expired', `the ${PASSWORD_WORD} is required`, `${PASSWORD_WORD} reset`, 'token count 3']) {
    reset();
    assert.equal(maskFinding(plain, SMALL), plain, `plain words were masked: ${plain}`);
  }
});

test('ARC-09-C221 — a short or product-word engagement name or alias is warned about, by its place and never by its value', async () => {
  const { aliasWarnings } = await finding();
  // The printed copy goes to the person who issued the licence, so a warning names the engagement name or the alias by
  // its place (alias 1 is the first name in aliases.txt), as the architect's review of 2026-10-28 asked.
  const warnings = aliasWarnings({ engagement: 'acb', aliases: ['ABH', 'Incident', 'Acme Bank Holdings'] });
  assert.deepEqual(warnings, [
    'warning: the engagement name is 3 letters long, so it is masked wherever those letters stand alone',
    'warning: alias 1 in aliases.txt is 3 letters long, so it is masked wherever those letters stand alone',
    'warning: alias 2 in aliases.txt is a product word, so every use of that word is masked, wherever it means the product']);
  assert.deepEqual(aliasWarnings({ engagement: 'incident' }),
    ['warning: the engagement name is a product word, so every use of that word is masked, wherever it means the product']);
  // A full company name is warned about by neither rule.
  assert.deepEqual(aliasWarnings({ engagement: 'acme-bank', aliases: ['Acme Bank Holdings'] }), []);
});

/** A checkout-shaped root with one engagement's findings folder and a note in it. */
function checkout(t, note = 'a note') {
  const root = tempDir('c221-root-', t);
  mkdirSync(join(root, 'clients', 'acme-bank', 'findings'), { recursive: true });
  writeFileSync(join(root, 'clients', 'acme-bank', 'findings', '2026-10-23-slow-list.md'), `${note}\n`);
  return root;
}

test('ARC-09-C221 — the script reads only a note under clients/<engagement>/findings/, and says why it refuses', async (t) => {
  const { resolveFindingPath } = await finding();
  const root = checkout(t);
  mkdirSync(join(root, 'clients', '_unfiled', 'findings'), { recursive: true });
  writeFileSync(join(root, 'clients', '_unfiled', 'findings', 'x.md'), 'x\n');
  writeFileSync(join(root, 'clients', 'acme-bank', 'findings', 'x.txt'), 'x\n');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'x.md'), 'x\n');

  const ok = resolveFindingPath(root, 'clients/acme-bank/findings/2026-10-23-slow-list.md');
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.engagement, 'acme-bank');
  const windows = resolveFindingPath(root, 'clients\\acme-bank\\findings\\2026-10-23-slow-list.md');
  assert.equal(windows.ok, true, `a backslashed path is refused: ${windows.reason}`);

  for (const [arg, why] of [
    ['docs/x.md', /clients\/<engagement>\/findings/],
    ['clients/acme-bank/findings/../../../docs/x.md', /\.\./],
    ['clients/_unfiled/findings/x.md', /_unfiled/],
    ['clients/acme-bank/findings/x.txt', /\.md/],
    ['clients/acme-bank/findings/missing.md', /does not exist|no such/i],
  ]) {
    const r = resolveFindingPath(root, arg);
    assert.equal(r.ok, false, `${arg} was accepted`);
    assert.match(r.reason, why, `${arg}: ${r.reason}`);
  }
});

test('ARC-09-C221 — a symlinked note is refused', { skip: process.platform === 'win32' ? 'a symlink needs elevation on Windows' : false }, async (t) => {
  const { resolveFindingPath } = await finding();
  const root = checkout(t);
  writeFileSync(join(root, 'outside.md'), 'outside\n');
  symlinkSync(join(root, 'outside.md'), join(root, 'clients', 'acme-bank', 'findings', 'link.md'));
  const r = resolveFindingPath(root, 'clients/acme-bank/findings/link.md');
  assert.equal(r.ok, false, 'a symlink was followed');
  assert.match(r.reason, /symlink|symbolic link/i);
});

test('ARC-09-C221 — --next-name gives a free path, -2 and -3 when it is taken', async (t) => {
  const { nextFindingName } = await finding();
  const root = checkout(t);
  assert.equal(nextFindingName(root, 'acme-bank', 'a-new-one', { date: '2026-10-23' }), 'clients/acme-bank/findings/2026-10-23-a-new-one.md');
  assert.equal(nextFindingName(root, 'acme-bank', 'slow-list', { date: '2026-10-23' }), 'clients/acme-bank/findings/2026-10-23-slow-list-2.md');
  writeFileSync(join(root, 'clients', 'acme-bank', 'findings', '2026-10-23-slow-list-2.md'), 'x\n');
  assert.equal(nextFindingName(root, 'acme-bank', 'slow-list', { date: '2026-10-23' }), 'clients/acme-bank/findings/2026-10-23-slow-list-3.md');
  assert.equal(nextFindingName(root, 'new-client', 'first', { date: '2026-10-23' }), 'clients/new-client/findings/2026-10-23-first.md',
    'an engagement with no findings folder yet gets its first name');
  assert.throws(() => nextFindingName(root, '_unfiled', 'x', { date: '2026-10-23' }), /_unfiled/);
  assert.throws(() => nextFindingName(root, 'acme-bank', '../x', { date: '2026-10-23' }), /slug/);
});

/** A store outside the checkout, as the doctor and the server read one: mode 0600, a password and a username in it. */
function storeFile(t, { username = 'svc_snowarch_acme', url = 'https://servicedesk.acmebank.com' } = {}) {
  const dir = tempDir('c221-store-', t);
  const path = join(dir, 'instances.json');
  writeFileSync(path, `${JSON.stringify({ version: 1, defaultInstance: 'acme-prod', instances: { 'acme-prod': {
    url, environment: 'prod', auth: { method: 'basic', username, password: PW },
    preset: 'read-only', flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false } } }, null, 2)}\n`);
  chmodSync(path, 0o600);
  return path;
}

test('ARC-09-C221 — the non-credential tier reads labels and hosts and never the credential block', async (t) => {
  // label.ts:133's rule: a summary reader names its fields one at a time and never touches `auth`.
  const { storeHostValues } = await maskValues();
  const values = storeHostValues(storeFile(t));
  assert.deepEqual(values.labels, ['acme-prod']);
  assert.deepEqual(values.hosts, ['servicedesk.acmebank.com']);
  assert.ok(values.stems.includes('acmebank'), `stems: ${values.stems}`);
  const all = JSON.stringify(values);
  assert.ok(!all.includes(PW) && !all.includes('svc_snowarch_acme'), 'the non-credential tier carried a credential');
  assert.deepEqual(storeHostValues(join(tempDir('c221-none-', t), 'missing.json')), { read: false, labels: [], hosts: [], stems: [] });
});

test('ARC-09-C221 — the script end to end: the store\'s own username and password in a note come out masked', async (t) => {
  const { main } = await finding();
  const root = checkout(t, `Logged in as svc_snowarch_acme with ${PW} on https://servicedesk.acmebank.com, saw INC0010001.`);
  let out = '';
  const code = await main(['clients/acme-bank/findings/2026-10-23-slow-list.md'],
    { root, env: { SNOW_STORE: storeFile(t) }, out: { write: (s) => { out += s; } } });
  assert.equal(code, 0, out);
  assert.match(out.split('\n')[0], /^instance names masked by value: \d+ \(store read\) · credentials read$/);
  assert.ok(!out.includes(PW), 'the store\'s password was printed');
  assert.ok(!out.includes('svc_snowarch_acme'), 'the store\'s username was printed');
  assert.ok(!/acmebank/i.test(out), 'the store\'s host was printed');
  assert.ok(out.includes('<record>'), 'the record number was not masked');
});

test('ARC-09-C221 — the script end to end, its credential reader failing: the header and the review list say so', async (t) => {
  const { main } = await finding();
  const note = 'Logged in as svc_snowarch_acme on https://servicedesk.acmebank.com.';
  const run = async (root, extra) => {
    let out = '';
    const code = await main(['clients/acme-bank/findings/2026-10-23-slow-list.md'], { root, out: { write: (s) => { out += s; } }, ...extra });
    assert.equal(code, 0, out);
    return out;
  };
  // A loader that cannot load: what a checkout without its dependencies meets.
  const failing = await run(checkout(t, note), { env: { SNOW_STORE: storeFile(t) },
    credentialReader: async () => { throw new Error('Cannot find module'); } });
  // The store loader refusing: a store inside a checkout git does not ignore (here, no repository at all).
  const root = checkout(t, note);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'instances.json'), readFileSync(storeFile(t), 'utf8'));
  chmodSync(join(root, '.local', 'instances.json'), 0o600);
  const refused = await run(root, { env: {} });
  for (const out of [failing, refused]) {
    assert.match(out.split('\n')[0], /\(store read\) · credentials NOT read — check usernames and passwords before sending$/);
    assert.ok(out.slice(out.lastIndexOf('Read before sending:')).includes('credentials NOT read'),
      'the review list does not say the credentials were not read');
    assert.ok(!/acmebank/i.test(out), 'the non-credential tier stopped masking the store\'s host');
  }
});

test('ARC-09-C221 — the script refuses a path outside the findings folder and prints nothing of it', async (t) => {
  const { main } = await finding();
  const root = checkout(t);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'secret.md'), `${PW}\n`);
  let out = '';
  const code = await main(['docs/secret.md'], { root, env: {}, out: { write: (s) => { out += s; } } });
  assert.notEqual(code, 0);
  assert.ok(!out.includes(PW), 'a refused file was printed');
  assert.match(out, /clients\/<engagement>\/findings/);
});

// ── ARC-09-C242 — a store stem names the organisation, and a store host is masked whole ──────────────────────────────
//
// The regression hunt (wf_9be5c51c-184): a store host under a country's second level (servicedesk.<org>.co.uk) gave
// the stem `co`, which masked every word that begins with it, `Could` and `configure` among them, and left the
// organisation's own name unmasked. A finding keeps masking every word that begins with the stem, because AcmeUtils
// and svc_acmeintegration are the client's (the C242 review, 2026-10-25). The exception is a government's, a sector's
// or a state's label: `act` begins action, and `mod` begins module.

test('ARC-09-C242 — a store host gives its organisation\'s stem, past a public suffix; an address gives none', async () => {
  const { stemOf } = await maskValues();
  for (const [host, stem] of [['servicedesk.acme.co.uk', 'acme'], ['acme.co.uk', 'acme'], ['itsm.acme.com.au', 'acme'],
    ['servicedesk.ox.ac.uk', 'ox'], ['servicedesk.hmrc.gov.uk', 'hmrc'], ['itsm.cmtedd.act.gov.au', 'cmtedd'],
    ['servicedesk.iot.in.gov', 'iot'], ['servicedesk.met.police.uk', 'met'], ['servicedesk.prits.pr.gov', 'prits'],
    ['servicedesk.acme.co.uk.', 'acme'], ['10.42.17.8', ''], ['[2001:db8::1]', ''],
    // a sector, a government or a state with only the service's label in front of it is the organisation
    ['servicedesk.mod.uk', 'mod'], ['itsm.gov.pl', 'gov'], ['itsm.act.gov.au', 'act'], ['itsm.in.gov', 'in'],
    ['servicenow.police.uk', 'police'],
    // a sector's label under another country is an organisation's own domain; ed.gov and va.gov are not states
    ['servicedesk.police.be', 'police'], ['servicedesk.nic.br', 'nic'], ['itsm.ed.gov', 'ed'], ['yourit.va.gov', 'va'],
    // unchanged
    ['acmebank.service-now.com', 'acmebank'], ['servicedesk.acmebank.com', 'acmebank'], ['acme.co', 'acme'],
    ['snow.corp.local', 'corp'], ['snow', 'snow']]) {
    assert.equal(stemOf(host), stem, host);
  }
});

test('ARC-09-C242 — a finding from a .co.uk or .com.au store keeps the words of the hunt, and masks the organisation', async () => {
  const { maskFinding } = await finding();
  const note = 'Could not configure the connection; the commit is on github.com, in the acme instance, acmedev and AcmeUtils.';
  for (const url of ['https://servicedesk.acme.co.uk', 'https://itsm.acme.com.au']) {
    reset();
    const out = maskFinding(note, { engagement: 'acme-bank', storeUrls: [url] });
    assert.ok(out.includes('Could not configure the connection; the commit is on github.com'), `${url}: ${out}`);
    assert.deepEqual(survivors(out, ['acme']), [], `${url}: the organisation's name survived: ${out}`);
  }
});

test('ARC-09-C242 — a finding still masks every word that begins with the stem: the client\'s own identifiers', async () => {
  const { maskFinding } = await finding();
  // The privacy review's ten tokens (c242-leaks-1), which v1's narrowed stem let through.
  const tokens = ['AcmeUtils', 'ACMEUtils', 'AcmeAjaxUtils', 'ACMEMID01', 'AcmeCorp', 'acmegroup', 'svc_acmeintegration',
    'u_acmehr_location', 'ACMELT0042', 'Acmes'];
  reset();
  const out = maskFinding(tokens.join(' '), { engagement: 'contoso', storeUrls: ['https://acme.service-now.com'] });
  assert.deepEqual(survivors(out, ['acme']), [], `a client identifier survived: ${out}`);
});

test('ARC-09-C242 — a government\'s, a sector\'s or a state\'s label is masked as a word and a sibling, not as a prefix', async () => {
  const { maskFinding } = await finding();
  for (const [url, note, gone, kept] of [
    ['https://itsm.act.gov.au', 'ACT raised it; act on it; actdev and ACT-ITSM-PROD; the action and active flows.', ['act on', 'actdev', 'act-'], 'the action and active flows'],
    ['https://servicedesk.mod.uk', 'the MOD team, moddev; the model and module', ['mod team', 'moddev'], 'the model and module'],
    ['https://ibm.service-now.com', 'IBMUtils and ibmmid01; the ibm instance', ['ibm'], '']]) {
    reset();
    const out = maskFinding(note, { engagement: 'contoso', storeUrls: [url] });
    assert.deepEqual(survivors(out, gone), [], `${url}: ${out}`);
    if (kept) assert.ok(out.includes(kept), `${url}: a word the label only begins was masked: ${out}`);
  }
});

test('ARC-09-C242 — a store host is masked whole in a note: a bare name, an IPv6 address, a trailing dot', async () => {
  const { maskFinding } = await finding();
  for (const [url, note, gone] of [
    ['https://[fd00:42::17]', 'ping [FD00:42::17] fails; [fd00:42::17]:443 refused', ['fd00:42::17']],
    ['https://snow', 'cannot reach snow:8443; DNS:snow.acmecorp.com; the snowarch doctor and snow_core_capabilities_read', ['snow:', 'acmecorp']],
    ['https://snow.', 'cannot reach snow:8443', ['snow:']]]) {
    reset();
    const out = maskFinding(note, { storeUrls: [url] });
    assert.deepEqual(survivors(out, gone), [], `${url}: ${out}`);
    if (url === 'https://snow') assert.ok(out.includes('the snowarch doctor and snow_core_capabilities_read'), `a product word was masked: ${out}`);
  }
  // A name that holds a bare store host as a part is masked whole first (the C242 review, round 2).
  reset();
  assert.equal(maskFinding('Snow Acme Holdings and itsm.acmebankuk', { aliases: ['Snow Acme Holdings'], usernames: ['itsm.acmebankuk'],
    storeUrls: ['https://snow', 'https://itsm'] }), '<engagement> and <user-1>');
});

// The architect's review of 2026-10-28, one BLOCK: the warnings are printed in the copy the user sends to the person who issued the
// licence, and they named the client's store name, an alias or the engagement. A warning names no value now, and it describes the
// masking's own breadth, every instance in the store (the architect's ruling), so it names no engagement either.
const SHORT_NAME = 'warning: one store name is 3 letters long, so every word that begins with it is masked';
const PRODUCT_NAME = 'warning: a store name is a product word, so every word that begins with it is masked';
const PUBLIC_NAME = 'warning: a store name is a government\'s, a sector\'s or a state\'s label: ';
const word = (value) => new RegExp(`\\b${value}\\b`, 'i');
/** Which of the values a printed copy holds, as words. */
const printed = (out, values) => values.filter((v) => word(v).test(out));

test('ARC-09-C242 — the finding warns about a store name the reader should check, and prints no store name and no alias', async () => {
  const { renderFinding } = await finding();
  // The detector can fail: the text the head printed before this review held the name, and it is found.
  assert.deepEqual(printed('warning: the instance store gives the name "ibm", 3 letters long, so every word that begins with it is masked', ['ibm']), ['ibm']);
  for (const [host, warning, value] of [
    ['servicedesk.bbc.co.uk', SHORT_NAME, 'bbc'],
    ['itsm.act.gov.au', PUBLIC_NAME, 'act'],
    ['itsm.acme', PRODUCT_NAME, 'itsm']]) {
    reset();
    const out = renderFinding('The list view was slow.', { engagement: 'contoso', aliases: ['Contoso Holdings'], storeUrls: [`https://${host}`] },
      { storeRead: true, credentialsRead: true });
    assert.ok(out.split('\n').some((l) => l.startsWith(warning)), `${host}: no warning\n${out}`);
    assert.deepEqual(printed(out, [value, 'contoso', 'Contoso Holdings']), [], `${host}: a value was printed\n${out}`);
  }
  // One line for the class, however many names or hosts carry it (it was a line for each name, the same sentence twice, until
  // ARC-09-C251), and a name the masker does not use is not counted.
  reset();
  const two = renderFinding('x', { storeUrls: ['https://abc.service-now.com', 'https://itsm.abc.com', 'https://xyz.service-now.com'] },
    { storeRead: true, credentialsRead: true });
  assert.equal(two.split('\n').filter((l) => l === SHORT_NAME).length, 1, two);
  reset();
  const product = renderFinding('x', { storeUrls: ['https://servicedesk.servicenow.example'] }, { storeRead: true, credentialsRead: true });
  assert.match(product.split('\n')[0], /^instance names masked by value: 1 \(store read\)/, 'a stem the masker does not use was counted');
});

/** A store of several instances, as `storeFile` writes one: [label, url] pairs, mode 0600. */
function storeOf(t, pairs) {
  const path = join(tempDir('c242-store-', t), 'instances.json');
  const instances = Object.fromEntries(pairs.map(([label, url]) => [label, { url, environment: 'prod',
    auth: { method: 'basic', username: 'svc_snowarch', password: PW },
    preset: 'read-only', flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false }]));
  writeFileSync(path, `${JSON.stringify({ version: 1, defaultInstance: pairs[0][0], instances }, null, 2)}\n`);
  chmodSync(path, 0o600);
  return path;
}

/** A checkout-shaped root with `engagement`'s findings folder and a note in it. */
function checkoutFor(t, engagement, note) {
  const root = tempDir('c242-root-', t);
  mkdirSync(join(root, 'clients', engagement, 'findings'), { recursive: true });
  writeFileSync(join(root, 'clients', engagement, 'findings', '2026-10-28-note.md'), `${note}\n`);
  return root;
}

test('ARC-09-C242 — the script end to end: a finding under any engagement prints no store name, and warns about the store\'s short one', async (t) => {
  const { main } = await finding();
  // One store, two engagements: beta-corp's instance has a long name and the other's a name of 3 letters.
  const store = storeOf(t, [['beta-corp-prod', 'https://betacorp.service-now.com'], ['zqx-prod', 'https://zqx.service-now.com']]);
  const run = async (engagement) => {
    let out = '';
    const code = await main([`clients/${engagement}/findings/2026-10-28-note.md`], { root: checkoutFor(t, engagement, 'The list view on the instance was slow.'),
      env: { SNOW_STORE: store }, credentialReader: async () => ({ read: false, usernames: [] }), out: { write: (s) => { out += s; } } });
    assert.equal(code, 0, out);
    return out;
  };
  for (const engagement of ['beta-corp', 'zqx']) {
    const out = await run(engagement);
    assert.deepEqual(printed(out, ['zqx', 'betacorp', 'beta-corp']), [], `a name was printed under ${engagement}:\n${out}`);
    // ARC-09-C258, the architect's ruling of 2026-11-01: the window's output is what a user copies, so the whole of it, the last
    // paragraph included, names no engagement or store, and a carve-out for that paragraph would be a weaker guard. It names the
    // file by its name beside the note, and that name has passed the masker (a name it masks gets no copy).
    assert.ok(out.endsWith('\nMasked copy written beside the note as 2026-10-28-note.masked.txt: the text above and nothing else.\n'),
      `the last paragraph is not the one ruled, under ${engagement}:\n${out}`);
    // The warning describes the masking, which reads every instance, so both engagements get it.
    assert.ok(out.split('\n').includes(SHORT_NAME), `no warning under ${engagement}:\n${out}`);
  }
});

test('ARC-09-C242 — a store host with a dot is masked whole, on a domain no list knows', async () => {
  const { maskFinding } = await finding();
  // `.br` is on no list here, so the host's own step is the only one that sees `zentrix.sp.gov.br` whole: without it the
  // stem `sp` masks the middle of it and `zentrix` is left (the C242 review, 2026-10-28).
  reset();
  const out = maskFinding('zentrix.sp.gov.br is slow; ping zentrix.sp.gov.br. then zentrix.sp.gov.br:8443',
    { engagement: 'contoso', storeUrls: ['https://zentrix.sp.gov.br'] });
  assert.deepEqual(survivors(out, ['zentrix']), [], out);
  assert.equal(out, '<instance-url-1> is slow; ping <instance-url-1>. then <instance-url-1>:8443');
});

test('ARC-09-C242 — a label that is a public one masks every sibling instance\'s name in a finding, not the words it begins', async () => {
  const { maskFinding } = await finding();
  reset();
  const out = maskFinding('actprod, actuat, act01qa and ACTSBX failed; moduat2, modpreprod, MODSIT and mod3dr too; the action, active and module flows stay',
    { engagement: 'contoso', storeUrls: ['https://itsm.act.gov.au', 'https://servicedesk.mod.uk'] });
  assert.deepEqual(survivors(out, ['actprod', 'actuat', 'act01qa', 'actsbx', 'moduat2', 'modpreprod', 'modsit', 'mod3dr']), [], out);
  assert.ok(out.endsWith('the action, active and module flows stay'), `a word the label only begins was masked: ${out}`);
});

// ── ARC-09-C251 — the follow-ups of the C242 review, as the architect ruled them on 2026-10-29 ──────────────────────────

test('ARC-09-C251 — an engagement name of four letters or more masks every word that begins with it', async () => {
  const { maskFinding } = await finding();
  reset();
  // The ruling's three under the engagement `acme`: the client's name glued to a capital and a digit, to a digit, and to an
  // environment word. A name leaking inside a glued token is what the masker exists to stop.
  assert.equal(maskFinding('AcmeMID01, acme01 and acmedev; then ACMELT0042, Acmes and acmebank', { engagement: 'acme' }),
    '<engagement>, <engagement> and <engagement>; then <engagement>, <engagement> and <engagement>');
  // The name's parts joined any way still count, and the glue follows the last part.
  reset();
  assert.equal(maskFinding('AcmeBankMID01 acme_bank01 acme bankdev acme.bank-prod', { engagement: 'acme-bank' }),
    '<engagement> <engagement> <engagement> <engagement>-prod');
  // A word the name only ends or holds is not the name's.
  reset();
  assert.equal(maskFinding('nacme and the macme01 word', { engagement: 'acme' }), 'nacme and the macme01 word');
});

test('ARC-09-C251 — an alias of four letters or more does the same, and one of three letters or fewer stays whole-word', async () => {
  const { maskFinding } = await finding();
  reset();
  assert.equal(maskFinding('GlobexMID01 and globex2 and Globex', { engagement: 'contoso', aliases: ['Globex'] }),
    '<engagement> and <engagement> and <engagement>');
  // Four letters is the least: `abcd` masks `abcdef`, `abc` masks only `abc`.
  reset();
  assert.equal(maskFinding('abcdef and abc and abcxyz', { engagement: 'contoso', aliases: ['abcd'] }), '<engagement> and abc and abcxyz');
  reset();
  assert.equal(maskFinding('abcdef and abc and ABC-1 and abc01', { engagement: 'contoso', aliases: ['abc'] }),
    'abcdef and <engagement> and <engagement>-1 and abc01');
  // The engagement name follows the same rule: three letters whole-word, four letters or more as a prefix.
  reset();
  assert.equal(maskFinding('xyzzy and xyz', { engagement: 'xyz' }), 'xyzzy and <engagement>');
  reset();
  assert.equal(maskFinding('xyzzy and xyz', { engagement: 'xyzz' }), '<engagement> and xyz');
});

test('ARC-09-C251 — a name that is one of the product\'s words stays whole-word: the product\'s own words are not the client\'s', async () => {
  const { maskFinding } = await finding();
  // `case` and `snow` have four letters, and masking every word they begin would read `cases`, `caseload` and `snowarch`
  // as the client. They keep the whole-word rule and the warning about it (aliasWarnings).
  reset();
  assert.equal(maskFinding('case and cases and caseload', { engagement: 'case' }), '<engagement> and cases and caseload');
  reset();
  assert.equal(maskFinding('snowarch and snow', { engagement: 'snow' }), 'snowarch and <engagement>');
});

test('ARC-09-C251 — two store names of one class give one warning line, and two classes give two', async () => {
  const { stemWarnings } = await finding();
  const url = (stem) => `https://${stem}.service-now.com`;
  const short = 'warning: one store name is 3 letters long, so every word that begins with it is masked';
  const product = 'warning: a store name is a product word, so every word that begins with it is masked';
  assert.deepEqual(stemWarnings([url('abc'), url('xyz')]), [short]);
  assert.deepEqual(stemWarnings([url('abc'), url('abc'), url('xyz'), url('incident')]), [short, product]);
  assert.deepEqual(stemWarnings([url('acmebank')]), []);
});

test('ARC-09-C251 — a stem inside a longer word stays: the left boundary of maskStemWords is pinned', async () => {
  const { maskStemWords } = await maskValues();
  // The review's mutant dropped the lookbehind, and no test turned red. A stem that is only the end or the middle of a word
  // names nobody: `nacme`, `xacmey` and `Macme01` stay, and a stem that begins a word is still masked.
  assert.equal(maskStemWords('nacme, xacmey, Macme01, acme and nacme', ['acme'], () => '<x>'), 'nacme, xacmey, Macme01, <x> and nacme');
});

test('ARC-09-C257 — the review list does not name the product: "The Architect said …" is no hit, and "The Hague" still is', async () => {
  const { reviewList, renderFinding } = await finding();
  // The owner's rc.1 probe: nearly every finding begins by saying what the Architect did, and the capitalised-run pattern read
  // "The Architect" as a company or a person, so "- The Architect" led the one list the reader must read before sending.
  assert.deepEqual(reviewList('The Architect said the incident table had no baseline field for this.'), []);
  assert.deepEqual(reviewList('The Architect\'s answer named Business Rule as the owner.'), []);
  // A product name after a sentence-initial "The" is still the product's: PRODUCT holds the name, and the article is not part of it.
  assert.deepEqual(reviewList('The Now Assist skill was off, and The Service Desk team agreed.'), []);
  // "The" is not stripped in general: a place or a company that begins with it is a true hit, and stays.
  assert.deepEqual(reviewList('The Hague office rejected it; The Architect said so; The Acme Group agreed.'), ['The Hague', 'The Acme Group']);
  // The whole reply, as the owner read it: no "- The Architect" item, and the person the masker kept is still listed.
  reset();
  const out = renderFinding('The Architect said so, and Ivan Petrov agreed.', STORE, { storeRead: true, credentialsRead: true });
  const items = out.slice(out.lastIndexOf('Read before sending:')).split('\n').filter((l) => l.startsWith('- '));
  assert.ok(!items.includes('- The Architect'), 'the product itself is in the review list');
  assert.ok(items.includes('- Ivan Petrov'), 'a person the masker kept left the review list');
});

// ── ARC-09-C258 — the masked copy is also a file, beside the note ────────────────────────────────────────────────────
//
// The owner's rc.1 sitting: copying the printed text out of the Claude Code window lost characters twice, so the finder also
// writes what leaves as a file, `<note>.masked.txt`, and the skill says to send that file, never the note. The file holds the
// masked text and nothing else: the block between the reply's two blank lines. Its name is made from the validated note's, so
// no argument can point the write anywhere else, and a refused path leaves nothing behind. The architect's three hardenings
// (2026-11-01) are tests below: the temporary file (its folder, its name, its mode, its removal on every failure), a symlinked
// findings folder with a mutation control, and the Windows cells, which run every test here except those that need a symlink or
// a read-only folder. His review of the PR added three: the last line names no engagement, the file's name is itself masked (it
// travels with the file, so a note named for the client gets no copy), and a failed write beside an older copy says so.

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const FINDINGS = (root) => join(root, 'clients', 'acme-bank', 'findings');
const NOTE_REL = 'clients/acme-bank/findings/2026-10-23-slow-list.md';
const COPY_REL = 'clients/acme-bank/findings/2026-10-23-slow-list.masked.txt';
const WRITTEN = 'Masked copy written beside the note as 2026-10-23-slow-list.masked.txt: the text above and nothing else.';
const NOT_WRITTEN = /^Masked copy NOT written \([A-Z]+\): the text above is the only copy\. Do not send the note\.$/;
const NAME_LEAK = 'Masked copy NOT written: the note\'s name holds a name the masker masks, and the file\'s name would show it. '
  + 'Rename the note without it and run again. Do not send the note.';
const NO_STORE = { engagement: 'acme-bank', aliases: [], labels: [], storeUrls: [], usernames: [] };
const POSIX_ONLY = { skip: process.platform === 'win32' ? 'a symlink needs elevation on Windows, and a file mode means nothing there' : false };
const NOT_ROOT = { skip: process.platform === 'win32' || process.getuid?.() === 0 ? 'a folder mode stops nobody on Windows, or root' : false };

/** `main` on a checkout with no store: the reply it printed and the code it returned. */
async function runFinder(root, argv) {
  const { main } = await finding();
  let out = '';
  const code = await main(argv, { root, env: {}, out: { write: (s) => { out += s; } } });
  return { code, out };
}

const linesOf = (out) => out.split('\n').filter((l) => l.trim());
/** Every path under a folder, sorted: how a test tells that a run added nothing. */
const tree = (dir) => readdirSync(dir, { recursive: true }).map(String).sort();
/** The window's masked block: after the header and warnings, up to the blank line before the review list. */
function maskedBlock(out) {
  const lines = out.split('\n');
  return lines.slice(lines.indexOf('') + 1, lines.lastIndexOf('Read before sending:') - 1).join('\n');
}

test('ARC-09-C258 — the masked copy is a file beside the note: the window\'s masked block, byte for byte, and nothing else', async (t) => {
  const { FIXED_REVIEW } = await finding();
  const root = checkout(t, 'Ivan Petrov saw INC0010001 on https://acmebank.service-now.com.\n\nA second paragraph, with INC0010002.');
  // A product word as an alias makes the reply carry a warning line, which the file must not carry.
  writeFileSync(join(FINDINGS(root), 'aliases.txt'), 'Incident\n');
  const { code, out } = await runFinder(root, [NOTE_REL]);
  assert.equal(code, 0, out);
  assert.ok(out.includes('warning: alias 1 in aliases.txt is a product word'), 'the fixture gave the reply no warning, so the file could not be shown to lack one');
  const file = join(root, COPY_REL);
  assert.ok(existsSync(file), 'no masked copy beside the note');
  const copy = readFileSync(file, 'utf8');
  assert.equal(copy, `${maskedBlock(out)}\n`, 'the file is not the window\'s masked block with one final LF');
  assert.ok(copy.includes('Ivan Petrov saw <record> on <instance-url-1>.\n\nA second paragraph, with <record>.'), `the masked text is not in the file: ${copy}`);
  for (const absent of ['instance store NOT read', 'credentials NOT read', 'warning:', 'Read before sending', '- Ivan Petrov', ...FIXED_REVIEW]) {
    assert.ok(!copy.includes(absent), `the file holds "${absent}", which is not the masked text`);
  }
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600, 'the copy is readable by others');
});

test('ARC-09-C258 — the reply is what it was through the review list, and its last line names the file', async (t) => {
  const { renderFinding } = await finding();
  const note = 'Ivan Petrov saw INC0010001.';
  const root = checkout(t, note);
  const { code, out } = await runFinder(root, [NOTE_REL]);
  assert.equal(code, 0, out);
  const before = renderFinding(`${note}\n`, NO_STORE, { storeRead: false, credentialsRead: false });
  assert.equal(out, `${before}\n${WRITTEN}\n`, 'the reply changed before its last paragraph, or the paragraph is not the one ruled');
  assert.equal(linesOf(out).at(-1), WRITTEN);
  // renderFinding takes that last line as an optional fourth argument, so the hook's tests run the real function with it.
  assert.equal(renderFinding('x', {}, {}, 'LAST'), `${renderFinding('x', {}, {})}\nLAST\n`);
});

test('ARC-09-C258 — the copy is replaced on every run: an edited note gives the new text', async (t) => {
  const root = checkout(t, 'first text about INC0010001');
  const first = await runFinder(root, [NOTE_REL]);
  assert.equal(first.code, 0, first.out);
  const file = join(root, COPY_REL);
  assert.equal(readFileSync(file, 'utf8'), 'first text about <record>\n');
  writeFileSync(join(root, NOTE_REL), 'second text about INC0010009\n');
  const second = await runFinder(root, [NOTE_REL]);
  assert.equal(second.code, 0, second.out);
  assert.equal(readFileSync(file, 'utf8'), 'second text about <record>\n', 'the second run did not replace the copy');
  assert.deepEqual(readdirSync(FINDINGS(root)).sort(), ['2026-10-23-slow-list.masked.txt', '2026-10-23-slow-list.md'].sort());
});

test('ARC-09-C258 — there is no --out, a masked copy is not a note, and a refused path leaves nothing behind', async (t) => {
  const root = checkout(t);
  mkdirSync(join(root, 'clients', '_unfiled', 'findings'), { recursive: true });
  writeFileSync(join(root, 'clients', '_unfiled', 'findings', 'x.md'), 'x\n');
  writeFileSync(join(FINDINGS(root), 'x.txt'), 'x\n');
  writeFileSync(join(root, COPY_REL), 'an earlier copy\n');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'x.md'), 'x\n');
  const elsewhere = join(tempDir('c258-elsewhere-', t), 'copy.txt');
  const before = tree(root);
  for (const argv of [
    ['--out', elsewhere, NOTE_REL],
    [NOTE_REL, '--out', elsewhere],
    [NOTE_REL, `--out=${elsewhere}`],
    [NOTE_REL, elsewhere],
    [COPY_REL],
    ['clients/acme-bank/findings/x.txt'],
    ['clients/acme-bank/findings/../../../docs/x.md'],
    ['clients/_unfiled/findings/x.md'],
    ['docs/x.md'],
    ['clients/acme-bank/findings/missing.md'],
  ]) {
    const { code, out } = await runFinder(root, argv);
    assert.equal(code, 2, `${argv.join(' ')} was accepted: ${out.slice(0, 100)}`);
    assert.match(out, /^finding: /, `${argv.join(' ')} was refused without a sentence`);
    assert.ok(!out.includes('Masked copy'), `${argv.join(' ')}: a refusal printed a copy line`);
    assert.deepEqual(tree(root), before, `${argv.join(' ')} changed the tree`);
    assert.equal(existsSync(elsewhere), false, `${argv.join(' ')} wrote where --out pointed`);
  }
  assert.equal(readFileSync(join(root, COPY_REL), 'utf8'), 'an earlier copy\n', 'a refusal replaced the earlier copy');
});

test('ARC-09-C258 — a symlink where the copy goes is replaced, and what it pointed at is untouched', POSIX_ONLY, async (t) => {
  const root = checkout(t, 'text about INC0010001');
  const dir = tempDir('c258-target-', t);
  const precious = join(dir, 'precious.txt');
  writeFileSync(precious, 'do not touch\n');
  const copy = join(root, COPY_REL);
  symlinkSync(precious, copy);
  const first = await runFinder(root, [NOTE_REL]);
  assert.equal(first.code, 0, first.out);
  assert.equal(linesOf(first.out).at(-1), WRITTEN);
  assert.equal(readFileSync(precious, 'utf8'), 'do not touch\n', 'the write followed the symlink');
  assert.equal(lstatSync(copy).isSymbolicLink(), false, 'the symlink is still where the copy goes');
  assert.equal(readFileSync(copy, 'utf8'), 'text about <record>\n');
  // A link to nothing is replaced the same way, and the nothing is not created.
  rmSync(copy);
  symlinkSync(join(dir, 'missing.txt'), copy);
  const second = await runFinder(root, [NOTE_REL]);
  assert.equal(linesOf(second.out).at(-1), WRITTEN);
  assert.equal(existsSync(join(dir, 'missing.txt')), false, 'the write followed a dangling symlink');
  assert.equal(lstatSync(copy).isSymbolicLink(), false);
});

test('ARC-09-C258 — when the copy cannot be written the reply says so, still prints the text, exits 0, and leaves no temporary file', async (t) => {
  const root = checkout(t, 'Ivan Petrov saw INC0010001.');
  mkdirSync(join(root, COPY_REL));
  const before = tree(FINDINGS(root));
  const { code, out } = await runFinder(root, [NOTE_REL]);
  assert.equal(code, 0, 'a failed write must not be an error exit: the text is still the reply');
  assert.match(linesOf(out).at(-1), NOT_WRITTEN, 'the last line does not say the copy was not written');
  assert.ok(out.includes('Ivan Petrov saw <record>.') && out.includes('Read before sending:'), 'the masked text and its list are no longer printed');
  assert.ok(!out.includes('Masked copy written'));
  assert.deepEqual(tree(FINDINGS(root)), before, 'a temporary file was left beside the note');
  assert.ok(statSync(join(root, COPY_REL)).isDirectory(), 'the directory where the copy goes was replaced');
});

test('ARC-09-C258 — a folder that cannot be written to gives the same line, with the code the system gave', NOT_ROOT, async (t) => {
  const root = checkout(t, 'text about INC0010001');
  const dir = FINDINGS(root);
  chmodSync(dir, 0o500);
  try {
    const { code, out } = await runFinder(root, [NOTE_REL]);
    assert.equal(code, 0, out);
    assert.equal(linesOf(out).at(-1), 'Masked copy NOT written (EACCES): the text above is the only copy. Do not send the note.');
    assert.ok(out.includes('text about <record>'));
  } finally { chmodSync(dir, 0o700); }
  assert.deepEqual(tree(dir), ['2026-10-23-slow-list.md']);
});

test('ARC-09-C258 — a write that fails once the file is open leaves no temporary file either', async (t) => {
  const { resolveFindingPath, writeMaskedCopy } = await finding();
  const root = checkout(t, 'x');
  const before = tree(FINDINGS(root));
  const full = () => { throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }); };
  const line = writeMaskedCopy(resolveFindingPath(root, NOTE_REL), 'masked\n', { write: full });
  assert.equal(line, 'Masked copy NOT written (ENOSPC): the text above is the only copy. Do not send the note.');
  assert.deepEqual(tree(FINDINGS(root)), before, 'the temporary file was left after a failed write');
});

test('ARC-09-C258 — the copy goes through a temporary file in the note\'s own folder, named at random, mode 0600 from the start', async (t) => {
  const { resolveFindingPath, writeMaskedCopy } = await finding();
  const root = checkout(t, 'x');
  const target = resolveFindingPath(root, NOTE_REL);
  const seen = [];
  const modes = [];
  const spy = (fd, text) => {
    seen.push(readdirSync(FINDINGS(root)).filter((n) => n.endsWith('.tmp')));
    modes.push(fstatSync(fd).mode & 0o777);
    writeFileSync(fd, text);
  };
  for (let i = 0; i < 2; i += 1) assert.match(writeMaskedCopy(target, 'masked\n', { write: spy }), /^Masked copy written beside the note as /);
  assert.deepEqual(seen.map((names) => names.length), [1, 1], `a write has one temporary file, in the note's folder: ${JSON.stringify(seen)}`);
  for (const [name] of seen) assert.match(name, /^2026-10-23-slow-list\.masked\.txt\.[0-9a-f]{12}\.tmp$/);
  assert.notEqual(seen[0][0], seen[1][0], 'the temporary name is not random');
  if (process.platform !== 'win32') assert.deepEqual(modes, [0o600, 0o600], 'the temporary file was readable by others before the data went in');
  assert.deepEqual(tree(FINDINGS(root)).filter((n) => n.endsWith('.tmp')), [], 'a temporary file was left');
  assert.equal(readFileSync(join(root, COPY_REL), 'utf8'), 'masked\n');
});

test('ARC-09-C258 — the temporary file is opened exclusively: a symlink planted at its name is not followed, and not removed', POSIX_ONLY, async (t) => {
  const { resolveFindingPath, writeMaskedCopy } = await finding();
  const root = checkout(t, 'x');
  const victim = join(tempDir('c258-victim-', t), 'victim.txt');
  writeFileSync(victim, 'keep\n');
  const planted = join(FINDINGS(root), '2026-10-23-slow-list.masked.txt.cafe00112233.tmp');
  symlinkSync(victim, planted);
  const line = writeMaskedCopy(resolveFindingPath(root, NOTE_REL), 'masked\n', { suffix: () => 'cafe00112233' });
  assert.match(line, /^Masked copy NOT written \(EEXIST\): /);
  assert.equal(readFileSync(victim, 'utf8'), 'keep\n', 'the write followed a symlink at the temporary name');
  assert.ok(lstatSync(planted).isSymbolicLink(), 'the failure path removed a file the finder did not create');
  assert.equal(existsSync(join(root, COPY_REL)), false);
});

/** A checkout whose findings folder is a symlink to a folder outside clients/ that holds a note: the escape the folder check stops. */
function symlinkedFolder(t) {
  const root = tempDir('c258-root-', t);
  const outside = tempDir('c258-outside-', t);
  writeFileSync(join(outside, 'note.md'), 'a note about INC0010001\n');
  mkdirSync(join(root, 'clients', 'acme-bank'), { recursive: true });
  symlinkSync(outside, join(root, 'clients', 'acme-bank', 'findings'), 'dir');
  return { root, outside };
}
const FOLDER_NOTE = 'clients/acme-bank/findings/note.md';

test('ARC-09-C258 — a symlink on the way to the note, its folder or the note itself, is refused, and nothing is written in either place', POSIX_ONLY, async (t) => {
  const { root, outside } = symlinkedFolder(t);
  const folder = await runFinder(root, [FOLDER_NOTE]);
  assert.equal(folder.code, 2, folder.out);
  assert.match(folder.out, /resolves outside its findings folder/);
  assert.ok(!folder.out.includes('Masked copy'), 'a refusal printed a copy line');
  assert.deepEqual(readdirSync(outside), ['note.md'], 'something was written in the folder the link points at');
  assert.deepEqual(readdirSync(join(root, 'clients', 'acme-bank')), ['findings'], 'something was written beside the link');
  // The note itself a symlink: refused, and no copy is made of what it points at.
  const own = checkout(t, 'a note');
  writeFileSync(join(own, 'outside.md'), 'outside INC0010001\n');
  symlinkSync(join(own, 'outside.md'), join(FINDINGS(own), 'link.md'));
  const before = tree(own);
  const note = await runFinder(own, ['clients/acme-bank/findings/link.md']);
  assert.equal(note.code, 2, note.out);
  assert.match(note.out, /symlink/);
  assert.deepEqual(tree(own), before, 'a copy was made of what a symlinked note points at');
});

/**
 * The finder's source with `mutate` applied and its relative imports made absolute, loaded as a module of its own: a mutation
 * control runs the real code with one check turned off. `marker` is the text the mutation leaves, so a control whose target has
 * moved fails loudly and cannot pass for the wrong reason.
 */
async function loadMutant(t, mutate, marker) {
  const mutated = mutate(readFileSync(join(LIB, 'finding.mjs'), 'utf8'))
    .replace(/from '\.\/([a-z-]+\.mjs)'/g, (_, file) => `from '${pathToFileURL(join(LIB, file)).href}'`);
  assert.ok(mutated.includes(marker), `the mutation did not apply: the code this control turns off is not where it looks (${marker})`);
  const file = join(tempDir('c258-mutant-', t), 'finding-mutant.mjs');
  writeFileSync(file, mutated);
  return import(pathToFileURL(file).href);
}

test('ARC-09-C258 — mutation control: with the folder check removed, the same run writes into the folder outside', POSIX_ONLY, async (t) => {
  // The test above is only worth its name if it can fail. This runs the finder with its realpath comparison turned into `if (false)`.
  const { main } = await loadMutant(t, (s) => s.replace(/if \(realpathSync\(path\) !== [^\n]*\) \{/, 'if (false) {'), 'if (false) {');
  const { root, outside } = symlinkedFolder(t);
  let out = '';
  const code = await main([FOLDER_NOTE], { root, env: {}, out: { write: (s) => { out += s; } } });
  assert.equal(code, 0, out);
  assert.ok(readdirSync(outside).includes('note.masked.txt'),
    'the finder without its folder check wrote nothing outside: the test above cannot tell that check from none');
});

// ── the file's name travels with the file (the architect's finding on the PR, 2026-11-01) ────────────────────────────
//
// The copy is a file the user sends, so its name goes with it, and the name is made from the note's slug, which is only checked for
// its format. `2026-11-01-acme-sla-breach.md` would give an attachment called `2026-11-01-acme-sla-breach.masked.txt`. So the finder
// masks the note's name with the values it masks the text with, and a name the masker changes gets no copy.

/** A note in the checkout's findings folder, with the engagement's alias file in place. */
function leakyCheckout(t) {
  const root = checkout(t, 'unused');
  writeFileSync(join(FINDINGS(root), 'aliases.txt'), 'Contoso Holdings\n');
  return root;
}

test('ARC-09-C258 — a note whose name holds the engagement\'s name, an alias or a record number gets no copy, and the line does not echo the name', async (t) => {
  const root = leakyCheckout(t);
  for (const slug of ['acme-bank-sla-breach', 'contoso-holdings-outage', 'inc0010001-wrong-group']) {
    const name = `2026-11-01-${slug}.md`;
    writeFileSync(join(FINDINGS(root), name), 'The list for INC0010002 never loaded.\n');
    const { code, out } = await runFinder(root, [`clients/acme-bank/findings/${name}`]);
    assert.equal(code, 0, `${slug}: ${out}`);
    assert.equal(linesOf(out).at(-1), NAME_LEAK, `${slug}: the last line is not the one ruled`);
    assert.ok(!out.includes(slug), `${slug}: the reply echoes the name`);
    assert.ok(out.includes('The list for <record> never loaded.') && out.includes('Read before sending:'), `${slug}: the masked text is no longer printed`);
    assert.deepEqual(tree(FINDINGS(root)).filter((n) => /\.masked\.txt|\.tmp$/.test(n)), [], `${slug}: something was written beside the note`);
    rmSync(join(FINDINGS(root), name));
  }
  // A slug that names the problem is copied, with the alias file in place and the engagement named in the folder.
  writeFileSync(join(FINDINGS(root), '2026-11-01-wrong-group.md'), 'The list for INC0010002 never loaded.\n');
  const clean = await runFinder(root, ['clients/acme-bank/findings/2026-11-01-wrong-group.md']);
  assert.equal(linesOf(clean.out).at(-1), 'Masked copy written beside the note as 2026-11-01-wrong-group.masked.txt: the text above and nothing else.');
  assert.ok(existsSync(join(FINDINGS(root), '2026-11-01-wrong-group.masked.txt')));
});

test('ARC-09-C258 — the store\'s own names are masked in the note\'s name too: a slug that holds an instance label gets no copy', async (t) => {
  const { main } = await finding();
  const root = checkout(t, 'unused');
  const name = '2026-11-01-beta-corp-prod-outage';
  writeFileSync(join(FINDINGS(root), `${name}.md`), 'The list view was slow.\n');
  let out = '';
  const store = storeOf(t, [['beta-corp-prod', 'https://betacorp.service-now.com']]);
  const code = await main([`clients/acme-bank/findings/${name}.md`], { root, env: { SNOW_STORE: store },
    credentialReader: async () => ({ read: false, usernames: [] }), out: { write: (s) => { out += s; } } });
  assert.equal(code, 0, out);
  assert.equal(linesOf(out).at(-1), NAME_LEAK);
  assert.equal(existsSync(join(FINDINGS(root), `${name}.masked.txt`)), false);
});

test('ARC-09-C258 — --next-name refuses a slug that holds the engagement\'s name or an alias, and the refusal names no slug', async (t) => {
  const root = leakyCheckout(t);
  for (const slug of ['acme-bank-sla-breach', 'contoso-holdings-outage']) {
    const { code, out } = await runFinder(root, ['--next-name', 'acme-bank', slug]);
    assert.equal(code, 2, `${slug} was given a path: ${out}`);
    assert.match(out, /^finding: .*choose a slug that names the problem, never the client/);
    assert.ok(!out.includes(slug), `the refusal echoes ${slug}`);
  }
  const ok = await runFinder(root, ['--next-name', 'acme-bank', 'wrong-assignment-group']);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /^clients\/acme-bank\/findings\/\d{4}-\d{2}-\d{2}-wrong-assignment-group\.md\n$/);
});

test('ARC-09-C258 — mutation control: with the copy-time name check turned off, the same note is copied under the leaking name', async (t) => {
  const { main } = await loadMutant(t, (s) => s.replace(/const nameClean = [^\n]*;/, 'const nameClean = true;'), 'const nameClean = true;');
  const root = leakyCheckout(t);
  const name = '2026-11-01-acme-bank-sla-breach';
  writeFileSync(join(FINDINGS(root), `${name}.md`), 'The list for INC0010002 never loaded.\n');
  let out = '';
  const code = await main([`clients/acme-bank/findings/${name}.md`], { root, env: {}, out: { write: (s) => { out += s; } } });
  assert.equal(code, 0, out);
  assert.ok(existsSync(join(FINDINGS(root), `${name}.masked.txt`)),
    'the finder without its name check wrote no file under the leaking name: the test above cannot tell that check from none');
});

// ── a failed write beside an older copy (the architect's finding on the PR) ──────────────────────────────────────────

test('ARC-09-C258 — a write that fails beside an older copy says the older one is out of date, and leaves it as it was, edited by hand or not', async (t) => {
  const { resolveFindingPath, writeMaskedCopy } = await finding();
  const root = checkout(t, 'x');
  const older = join(root, COPY_REL);
  writeFileSync(older, 'an older masked copy, edited by hand\n');
  const before = tree(FINDINGS(root));
  const full = () => { throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }); };
  const line = writeMaskedCopy(resolveFindingPath(root, NOTE_REL), 'masked\n', { write: full });
  assert.equal(line, 'Masked copy NOT written (ENOSPC): the text above is the only current copy, and the older 2026-10-23-slow-list.masked.txt '
    + 'beside the note is out of date. Do not send it or the note.');
  assert.equal(readFileSync(older, 'utf8'), 'an older masked copy, edited by hand\n', 'the older copy was changed or deleted');
  assert.deepEqual(tree(FINDINGS(root)), before, 'a temporary file was left, or the older copy went');
});
