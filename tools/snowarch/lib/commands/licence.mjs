/**
 * ARC-11-C1 — `./snowarch licence`: the licensee's three commands and the owner's four.
 *
 *   show                   the installed licence: its fields, its signature, its term, the list it was
 *                          judged against, enforcement, and the product's public keys
 *   verify <file>          the same judgement of any licence file
 *   check [--refresh]      what the start-up check finds; `--refresh` fetches the revocation list first
 *   keygen                 the owner's two key pairs, the creator's licence and the issue ledger
 *   issue                  a signed licence, numbered from the ledger beside the key
 *   init-list              the first revocation list: version 1, empty, signed
 *   revoke <id>            the list with one more entry and a higher version
 *
 * PRIVATE KEYS LIVE OUTSIDE THE CHECKOUT, AND ONLY THERE. Every path a private key is written to or
 * read from is refused when it resolves — symlinks followed — inside this checkout or its `.local/`.
 * A key inside a working tree is one `git add -A` from a public repository, and the private keys are
 * the whole of what makes a licence mean anything. Nothing this command prints contains one.
 *
 * THE PRODUCT NEVER PUSHES. `init-list` and `revoke` write the list in the owner's clone of the list
 * repository and print the git commands; the owner runs them.
 *
 * Exit codes: the three read commands exit 0 when the licence is in force (`ok` or `expiring`) and 1
 * otherwise, so a script can ask; the owner's four exit 0 when they wrote what they said; 2 is usage.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { loadConfig } from '../config.mjs';
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from '../exit.mjs';
import { localDir, licencePath } from '../local-paths.mjs';
import { spellings } from '../text.mjs';
import {
  checkLicence, fingerprint, ID_PATTERN, licenceProblem, publicKeyOf, readList, REASONS, SCOPES, signLicence,
  signList, utcDate,
} from '../licence/core.mjs';
import { PRODUCT_KEYS } from '../licence/keys.mjs';
import { listSource, refreshList, refreshSays } from '../licence/fetch.mjs';
import {
  bannerLine, heldList, isEnforced, licenceStatus, listStale, readListCache, REFUSED,
} from '../licence/state.mjs';

export const USAGE = (where) => {
  const cli = spellings(where).cli;
  return [
    `usage: ${cli} licence <command> …`,
    '',
    '  show                     the installed licence, its signature and term, and the product\'s keys',
    '  verify <file>            the same for any licence file',
    '  check [--refresh]        what the start-up check finds; --refresh fetches the revocation list first',
    '',
    '  the owner\'s, with private keys kept outside this checkout:',
    '  keygen --out <file> --recovery-out <file> --to <name> --org <org>',
    '  issue --to <name> --org <org> --scope live|design-only (--valid-until YYYY-MM-DD | --perpetual)',
    '        --key <file> [--notes <text>] [--id LIC-YYYY-NNNN] [--issuer <name>] [--out <file>]',
    '  init-list --list <dir> --key <file>',
    `  revoke <LIC-YYYY-NNNN> --reason ${REASONS.join('|')} --key <file> --list <dir>`,
  ].join('\n');
};

/** A usage problem: printed with the usage, exit 2. */
class Usage extends Error {}

/** One value of a value flag, or `undefined`; a flag given twice is a usage error, never a guess. */
function one(flags, name) {
  const v = flags[name];
  if (Array.isArray(v)) throw new Usage(`--${name} was given more than once`);
  if (v === true) throw new Usage(`--${name} needs a value`);
  return v;
}

function required(flags, sub, names) {
  const missing = names.filter((n) => one(flags, n) === undefined);
  if (missing.length > 0) throw new Usage(`licence ${sub} needs ${missing.map((n) => `--${n}`).join(', ')}`);
  return names.map((n) => one(flags, n));
}

/** The real path of `p`, following symlinks through the nearest part of it that exists. */
function realish(p) {
  let head = resolve(p);
  const tail = [];
  while (!existsSync(head)) {
    const up = dirname(head);
    if (up === head) break;
    tail.unshift(basename(head));
    head = up;
  }
  let real = head;
  try { real = realpathSync.native(head); } catch { /* keep the resolved spelling */ }
  return join(real, ...tail);
}

const within = (child, parent) => {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
};

/** Is `path` inside this checkout or its `.local/` (which a state root may have moved elsewhere)? */
export const insideCheckout = (path, root) => [root, localDir(root)].some((dir) => within(realish(path), realish(dir)));

function outsideOnly(path, root, what) {
  if (insideCheckout(path, root)) {
    throw new Usage(`${path} is inside this checkout — ${what} is kept only outside it, and never under .local/`);
  }
}

/** Write a new file and never replace one: `wx` fails if it exists, after the check that says why. */
function writeNew(path, text, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, text, { mode, flag: 'wx' });
}

/** Replace a file whole: written beside it, then renamed over it. */
function replace(path, text, mode = 0o600) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text, { mode });
  renameSync(tmp, path);
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function readPrivateKey(path) {
  let pem;
  try { pem = readFileSync(path, 'utf8'); } catch { throw new Usage(`cannot read ${path}`); }
  try { publicKeyOf(pem); } catch { throw new Usage(`${path} is not a private key this command can sign with`); }
  return pem;
}

/** The next free id for `year` in a ledger: one past the highest issued that year. */
function nextId(ledger, year) {
  const nums = (ledger.issued ?? []).map((e) => new RegExp(`^LIC-${year}-(\\d{4})$`).exec(e.id)?.[1]).filter(Boolean).map(Number);
  return `LIC-${year}-${String((nums.length > 0 ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
}

function describe(log, s) {
  if (s.state === 'missing') return;
  if (s.signatureValid) {
    log.step(`  id:           ${s.id}`);
    log.step(`  licensee:     ${s.licensee}`);
    log.step(`  org:          ${s.org}`);
    log.step(`  scope:        ${s.scope}`);
    log.step(`  issued:       ${s.issued}`);
    log.step(`  valid until:  ${s.perpetual ? 'perpetual' : `${s.validUntil} (${s.daysLeft} days)`}`);
    log.step(`  signature:    valid — ${s.key} key`);
  }
  if (s.reason && s.state !== 'ok' && s.state !== 'expiring') log.step(`  why:          ${s.reason}`);
}

function enforcementLines(log, s) {
  if (!s.enforced) {
    log.step('  enforce: off — warn only; SNOW_LICENCE_ENFORCE="true" turns the refusals on');
    return;
  }
  log.step(REFUSED.includes(s.state)
    ? '  enforce: on — every command but licence, doctor, status, version and upgrade is refused, and every MCP tool'
    : '  enforce: on — nothing is refused while the licence is in force');
  if (s.scope === 'design-only' && !REFUSED.includes(s.state)) {
    log.step(`  scope: licence ${s.id} covers design-only; live needs a live-scope licence, so a live server refuses every tool`);
  }
}

/**
 * The list's line. One checked more than a day ago says so: a live server start refreshes it, but a
 * design-only checkout fetches it only when somebody asks.
 */
const listLine = (s, now) => {
  if (!s.list) return '  revocation list: none held';
  const stale = listStale({ checkedAt: s.list.checkedAt }, now) ? ' — more than a day old; --refresh fetches it now' : '';
  return `  revocation list: version ${s.list.version}, checked ${s.list.checkedAt}${stale}`;
};

const inForce = (s) => (s.state === 'ok' || s.state === 'expiring' ? EXIT_OK : EXIT_FAIL);

function show({ log, root, keys, now, env, flags }) {
  const s = licenceStatus(root, { keys, now: now(), env });
  if (flags.json) {
    log.json({ ...s, path: licencePath(root), keys: keys.map(({ role, fingerprint: fp }) => ({ role, fingerprint: fp })) });
    return inForce(s);
  }
  log.step(bannerLine(s, { enforced: s.enforced }));
  if (s.state === 'missing') log.step(`  no licence is installed at ${licencePath(root)}`);
  describe(log, s);
  log.step(listLine(s, now()));
  enforcementLines(log, s);
  log.step('');
  if (keys.length === 0) {
    log.step('Product keys: none ship in this build, so every licence reads invalid until they do.');
  } else {
    log.step('Product keys:');
    for (const k of keys) {
      log.step(`  ${k.role.padEnd(9)} ${fingerprint(k.publicKey)}`);
      for (const line of k.publicKey.trim().split('\n')) log.step(`    ${line}`);
    }
  }
  return inForce(s);
}

function verifyFile({ positional, log, root, keys, now, env }) {
  const file = positional[1];
  if (!file) throw new Usage('licence verify needs the licence file to check');
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { throw new Usage(`cannot read ${file}`); }
  const s = checkLicence(text, { keys, list: heldList(readListCache(root), keys), now: now() });
  log.step(bannerLine(s, { enforced: isEnforced(env) }));
  describe(log, s);
  return inForce(s);
}

function check({ flags, log, root, keys, now, env, config }) {
  if (flags.refresh) {
    const r = refreshList(root, { config: config(), keys, now: now(), env });
    log.step(refreshSays(r));
  }
  const s = licenceStatus(root, { keys, now: now(), env });
  if (flags.json) {
    log.json(s);
    return inForce(s);
  }
  log.step(bannerLine(s, { enforced: s.enforced }));
  if (s.reason && s.state !== 'ok' && s.state !== 'expiring') log.step(`  why: ${s.reason}`);
  log.step(listLine(s, now()));
  enforcementLines(log, s);
  return inForce(s);
}

function keygen({ flags, log, root, now, where }) {
  const [out, rec, to, org] = required(flags, 'keygen', ['out', 'recovery-out', 'to', 'org']);
  outsideOnly(out, root, 'a private key');
  outsideOnly(rec, root, 'a private key');
  if (realish(out) === realish(rec)) throw new Usage('the primary and the recovery key need two different paths');
  const dir = dirname(resolve(out));
  const year = now().getUTCFullYear();
  const id = `LIC-${year}-0001`;
  const creator = join(dir, `${id}.json`);
  const ledger = join(dir, 'issued.json');
  const pub = join(dir, 'public-keys.json');
  for (const p of [out, rec]) if (existsSync(p)) throw new Usage(`${p} exists — keygen never overwrites a key`);
  for (const p of [creator, ledger, pub]) {
    if (existsSync(p)) throw new Usage(`${p} exists — it belongs to another set of keys; choose an empty directory`);
  }

  const pair = () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return { publicKey: publicKey.export({ type: 'spki', format: 'pem' }), privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  };
  const primary = pair();
  const recovery = pair();
  writeNew(out, primary.privateKey);
  writeNew(rec, recovery.privateKey);
  const keys = [
    { role: 'primary', fingerprint: fingerprint(primary.publicKey), publicKey: primary.publicKey },
    { role: 'recovery', fingerprint: fingerprint(recovery.publicKey), publicKey: recovery.publicKey },
  ];
  const issued = utcDate(now());
  const payload = { id, licensee: to, org, scope: 'live', issued, issuer: to, notes: 'creator licence, issued by keygen' };
  writeNew(creator, json(signLicence(payload, primary.privateKey)));
  writeNew(ledger, json({ issuer: to, issued: [{ id, licensee: to, org, scope: 'live', issued, valid_until: null }] }));
  writeNew(pub, json({ keys }), 0o644);

  const cli = spellings(where).cli;
  log.step('licence keygen: two key pairs, the creator licence and the issue ledger');
  log.step(`  primary key     ${out}`);
  log.step(`  recovery key    ${rec}`);
  log.step(`  creator licence ${creator} — ${id}, live, perpetual`);
  log.step(`  ledger          ${ledger}`);
  log.step(`  public keys     ${pub}`);
  log.step('');
  log.step('The two PUBLIC keys, to be committed into the product (public — safe to send):');
  for (const k of keys) {
    log.step(`  ${k.role.padEnd(9)} ${k.fingerprint}`);
    for (const line of k.publicKey.trim().split('\n')) log.step(`    ${line}`);
  }
  log.step('');
  log.step('Back up both private keys offline now, and keep the recovery key off this machine: it signs only when '
    + 'the primary is lost. With both lost, every licence has to be issued again under new keys, in a new release.');
  log.step(`Send ${basename(pub)} — never a private key — to have the public keys committed into the product.`);
  log.step(`Install the creator licence by copying ${creator} to .local/licence.json in your checkout, `
    + `then run ${cli} licence check.`);
  return EXIT_OK;
}

function issue({ flags, log, root, keys, now }) {
  const [to, org, scope, keyPath] = required(flags, 'issue', ['to', 'org', 'scope', 'key']);
  const validUntil = one(flags, 'valid-until');
  const perpetual = flags.perpetual === true;
  if ((validUntil === undefined) === !perpetual) {
    throw new Usage('licence issue needs exactly one of --valid-until YYYY-MM-DD and --perpetual');
  }
  if (!SCOPES.includes(scope)) throw new Usage(`--scope is one of ${SCOPES.join(', ')}`);
  outsideOnly(keyPath, root, 'a private key');
  const key = readPrivateKey(keyPath);
  const ledgerPath = join(dirname(resolve(keyPath)), 'issued.json');
  let ledger = null;
  if (existsSync(ledgerPath)) {
    try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')); } catch { throw new Usage(`${ledgerPath} is not JSON`); }
  }
  const idFlag = one(flags, 'id');
  if (idFlag !== undefined && !ID_PATTERN.test(idFlag)) throw new Usage('--id is LIC-YYYY-NNNN');
  if (idFlag === undefined && !ledger) {
    throw new Usage(`there is no issued.json beside ${keyPath} to number from — pass --id LIC-YYYY-NNNN, `
      + 'checked against the ledger beside the primary key, so no two licences share an id');
  }
  const id = idFlag ?? nextId(ledger, now().getUTCFullYear());
  if (ledger?.issued?.some((e) => e.id === id)) throw new Usage(`${id} is already in ${ledgerPath}`);
  const issuer = one(flags, 'issuer') ?? ledger?.issuer;
  if (!issuer) throw new Usage('licence issue needs --issuer when the ledger does not name one');

  const payload = { id, licensee: to, org, scope, issued: utcDate(now()), ...(perpetual ? {} : { valid_until: validUntil }),
    issuer, notes: one(flags, 'notes') ?? '' };
  const problem = licenceProblem(payload);
  if (problem) throw new Usage(`licence issue: ${problem}`);
  const outPath = one(flags, 'out') ?? join(dirname(resolve(keyPath)), `${id}.json`);
  if (existsSync(outPath)) throw new Usage(`${outPath} exists — issue never replaces a licence`);

  const fp = fingerprint(publicKeyOf(key));
  if (!keys.some((k) => fingerprint(k.publicKey) === fp)) {
    log.warn(`the signing key ${fp} is not one this build ships, so this licence verifies only in a build that ships it`);
  }
  writeNew(outPath, json(signLicence(payload, key)));
  if (ledger) {
    const entry = { id, licensee: to, org, scope, issued: payload.issued, valid_until: payload.valid_until ?? null };
    replace(ledgerPath, json({ ...ledger, issued: [...(ledger.issued ?? []), entry] }));
  } else {
    log.warn(`no ledger beside ${keyPath}: record ${id} in the ledger beside the primary key yourself`);
  }
  log.step(`licence issue: ${id} for ${to} (${org}), ${scope}, ${perpetual ? 'perpetual' : `until ${validUntil}`}`);
  log.step(`  written to ${outPath}`);
  log.step('Send this file to the licensee, who installs it by copying it to .local/licence.json in their checkout.');
  return EXIT_OK;
}

/** The git commands that publish the list; the product never runs them. */
function pushCommands(log, dir, source, { first }) {
  const q = `"${dir}"`;
  const url = source?.url ?? '<the list repository\'s URL>';
  const ref = source?.ref ?? 'main';
  const file = source?.path ?? 'revocations.json';
  const lines = [];
  if (!existsSync(join(dir, '.git'))) {
    lines.push(`git -C ${q} init -b ${ref}`, `git -C ${q} remote add origin ${url}`);
  }
  lines.push(`git -C ${q} add ${file}`, `git -C ${q} commit -m "${first ? 'Revocation list, version 1' : 'Revocation list'}"`,
    `git -C ${q} push ${first ? '-u ' : ''}origin ${ref}`);
  log.step('');
  log.step('Publish it — the product never pushes, so run these yourself:');
  for (const l of lines) log.step(`  ${l}`);
}

function listDir(flags, root, sub) {
  const [dir, keyPath] = required(flags, sub, ['list', 'key']);
  outsideOnly(dir, root, 'the revocation list repository');
  outsideOnly(keyPath, root, 'a private key');
  if (!existsSync(dir)) throw new Usage(`${dir} does not exist — clone the list repository there first`);
  return { dir, key: readPrivateKey(keyPath) };
}

function initList({ flags, log, root, config }) {
  const { dir, key } = listDir(flags, root, 'init-list');
  const source = listSource(config());
  const file = join(dir, source?.path ?? 'revocations.json');
  if (existsSync(file)) throw new Usage(`${file} exists — init-list writes the first list only; revoke adds to it`);
  writeNew(file, json(signList({ version: 1, revoked: [] }, key)), 0o644);
  log.step(`licence init-list: ${file} — version 1, empty, signed`);
  pushCommands(log, dir, source, { first: true });
  return EXIT_OK;
}

function revoke({ positional, flags, log, root, keys, now, config, where }) {
  const id = positional[1];
  if (!id || !ID_PATTERN.test(id)) throw new Usage('licence revoke takes a licence id, LIC-YYYY-NNNN — never a name');
  const reason = one(flags, 'reason');
  if (!REASONS.includes(reason)) {
    throw new Usage(`--reason is one of ${REASONS.join(', ')}: the list carries no names and no free text`);
  }
  const { dir, key } = listDir(flags, root, 'revoke');
  const source = listSource(config());
  const file = join(dir, source?.path ?? 'revocations.json');
  let held = null;
  if (existsSync(file)) {
    // The signing key is trusted for its own list as well as the shipped keys, so the owner can manage
    // the list with a key a given build does not ship yet.
    const trust = [...keys, { role: 'signing', publicKey: publicKeyOf(key) }];
    held = readList(readFileSync(file, 'utf8'), { keys: trust });
    if (!held.ok) {
      log.fail(`licence revoke: ${file} does not verify (${held.reason}) — nothing was changed`);
      return EXIT_FAIL;
    }
    if (held.revoked.some((e) => e.id === id)) throw new Usage(`${id} is already revoked in version ${held.version}`);
  }
  const next = { version: (held?.version ?? 0) + 1,
    revoked: [...(held?.revoked ?? []), { id, revokedAt: utcDate(now()), reason }] };
  if (held) replace(file, json(signList(next, key)), 0o644);
  else writeNew(file, json(signList(next, key)), 0o644);
  log.step(`licence revoke: ${id} (${reason}) — ${file} is now version ${next.version}`);
  pushCommands(log, dir, source, { first: !held });
  const cli = spellings(where).cli;
  log.step('');
  log.step('A machine with that licence reads it as revoked at its next refresh: its next live server start, '
    + `${cli} upgrade, ${cli} upgrade --check, or ${cli} licence check --refresh.`);
  return EXIT_OK;
}

const SUBCOMMANDS = { show, verify: verifyFile, check, keygen, issue, 'init-list': initList, revoke };

export async function licenceCommand({ flags = {}, positional = [], log, root, env = process.env,
  now = () => new Date(), keys = PRODUCT_KEYS, config = undefined, platform = process.platform } = {}) {
  const where = { platform, env };
  const sub = SUBCOMMANDS[positional[0]];
  const configOf = () => {
    if (config !== undefined) return config;
    try { return loadConfig(root); } catch { return null; }
  };
  try {
    if (!sub) throw new Usage(positional[0] ? `licence has no "${positional[0]}" command` : 'licence needs a command');
    return sub({ flags, positional, log, root, env, now, keys, config: configOf, where });
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    log.fail(e.message);
    log.step(USAGE(where));
    return EXIT_USAGE;
  }
}
