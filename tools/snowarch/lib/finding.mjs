// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C221 — `/snowarch finding`'s masker: a user's finding, as text they can send to the person who issued their
// licence, with the client's data masked.
//
// The note stays in `clients/<engagement>/findings/`, which git ignores; what leaves is this script's output, so the
// masking is code with tests (tools/snowarch/tests/finding.test.mjs), never the model's care. The order and every rule
// are the architect's privacy red-team's (2026-10-23), measured on its corpus before this file was written: 6 of 42
// leak cases survive, each a class no pattern catches and each named in the output's "Read before sending" list.
//
// READ-ONLY, and the only path control there is: the skill's grant is a Bash rule, which cannot constrain arguments, so
// this script accepts nothing but a note under `clients/<engagement>/findings/` and refuses the rest with a sentence.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { redact } from './redact.mjs';
import { byValueEntries, ENV_WORDS, maskByValue, stemOf, storeHostValues } from './mask-values.mjs';
import { FINDING_PATH } from './finding-path.mjs';

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const KEEP_URL = /^https?:\/\/(?:(?:www\.)?servicenow\.com\/docs\/|docs\.servicenow\.com\/|developer\.servicenow\.com\/|support\.servicenow\.com\/kb|github\.com\/farstic\/)/i;
const KEEP_HOST = /^(?:(?:www\.|docs\.|developer\.|support\.)?servicenow\.com|github\.com|nodejs\.org|npmjs\.com|registry\.npmjs\.org)$/i;
const SN_HOST = /\.(?:service-now\.[a-z]{2,}|servicenowservices\.com)$/i;
const TLDS = 'com|net|org|local|corp|internal|lan|intra|intranet|cloud|eu|uk|bg|de|fr|nl|be|at|ch|it|es|pl|ro|gr|us|ca|au|ie|se|dk|no|fi';
const NOT_A_HANDLE = new Set(['do', 'js', 'mjs', 'json', 'md', 'xml', 'html', 'com', 'org', 'net', 'io', 'local', 'list', 'form']);

/** Shapes the red-team's second pass measured, run in front of the rest: certificates, tokens, directory names. */
function preMask(text) {
  let o = text;
  o = o.replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g, '<pem-block>');
  o = o.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, '<secret>');
  o = o.replace(/\b(CN|O|OU|L|ST|C|DC|STREET)=([^,\n+/]+)/g, '$1=<dn>');
  o = o.replace(/\b(user_name|sys_created_by|sys_updated_by|caller_id|assigned_to|opened_by|requested_for|approver)((?:\.[a-z_]+)?)(=|!=|LIKE|STARTSWITH)([^^&\s]+(?: [A-Z][a-z]+)?)/g, '$1$2$3<user>');
  o = o.replace(/(['"])([a-z]+)\.([a-z]+)\1/g, (m, q, a, b) => (NOT_A_HANDLE.has(b) ? m : `${q}<user>${q}`));
  o = o.replace(/\+\d[\d\s().-]{7,}\d/g, '<phone>');
  o = o.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, '<iban>');
  return o;
}

/**
 * The finding's text with the client's data masked, in the red-team's order. Each step runs before the ones whose
 * shapes it would otherwise break: a secret can contain anything, a URL or an e-mail carries names, and names by value
 * come only after the product's own shapes are held aside.
 */
export function maskFinding(text, { engagement = '', aliases = [], labels = [], storeUrls = [], usernames = [] } = {}) {
  const held = [];
  const hold = (s) => { held.push(s); return `\u0001${held.length - 1}\u0001`; };
  const seen = new Map();
  const tag = (kind, value) => {
    const k = `${kind}\u0000${value.toLowerCase()}`;
    if (!seen.has(k)) seen.set(k, [...seen.keys()].filter((x) => x.startsWith(`${kind}\u0000`)).length + 1);
    return `<${kind}-${seen.get(k)}>`;
  };
  const storeHosts = storeUrls.map((u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return null; } }).filter(Boolean);
  const stems = storeHosts.map(stemOf);
  let out = preMask(text);

  // 1. Secrets first: they can contain anything, including shapes the later rules would split.
  out = out.replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s:@/]+:[^\s@/]+@/gi, '$1://');
  out = out.replace(/(^|\s)(-u|--user)\s+\S+:\S+/g, '$1$2 <user>:<secret>');
  out = out.replace(/\b(password|passwd|pwd|secret|client_secret|token|api[_-]?key)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2<secret>');
  // A credential named in a sentence: the word, then "is", "was" or a space, then a value of 6 or more characters with
  // a digit or a symbol in it, which "the token is expired" and "password reset" do not have (the architect's case).
  out = out.replace(/\b(password|passwd|pwd|secret|token|api[ _-]?key|client[ _-]?secret)(\s+(?:is|was)\s+|\s+)(?=[^\s;,]{6,})(?=[^\s;,]*[^A-Za-z\s;,])[^\s;,]+/gi, '$1$2<secret>');
  out = out.replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=._-]{8,}/g, '$1 <secret>');
  out = out.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<secret>');
  // 2. URLs whole: a path or a query carries sys_ids, view names and encoded queries. The keep-list stays verbatim.
  //    Sentence punctuation after a URL is the sentence's, not the URL's: taken into it, a comma made the store's own
  //    host unparsable, so it was tagged a plain <url>, and the comma was lost.
  out = out.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]]+/gi, (whole) => {
    const [, u, tail] = /^([\s\S]*?)([.,;:!?]*)$/.exec(whole);
    if (KEEP_URL.test(u)) return `${hold(u)}${tail}`;
    let host = '';
    try { host = new URL(u).hostname.toLowerCase(); } catch { /* unparsable, still a URL */ }
    return `${(SN_HOST.test(host) || storeHosts.includes(host)) ? tag('instance-url', host || u) : tag('url', host || u)}${tail}`;
  });
  // 3. E-mails whole, before a name rule can break their shape.
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<e-mail>');
  // 4. Home paths (json-boundary's HOME_PATH shape) and the OneDrive folder that names the organisation.
  out = out.replace(/(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/\s"'`,;:]*/g, '~');
  out = out.replace(/OneDrive - [^\\/\n]+/g, 'OneDrive - <org>');
  // 5. Network names: IPv4 addresses, hosts on the TLD list, ServiceNow hosts written bare.
  out = out.replace(/(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/\d{1,2})?(?!\d|\.\d)/g, '<ip>');
  out = out.replace(new RegExp(`(?<![\\w.@-])(?:[a-z0-9-]+\\.)+(?:${TLDS})(?![\\w-]|\\.[A-Za-z])`, 'gi'), (h) => {
    if (KEEP_HOST.test(h)) return h;
    return (SN_HOST.test(h) || storeHosts.includes(h.toLowerCase())) ? tag('instance-url', h) : '<host>';
  });
  out = out.replace(/\b[a-z0-9-]+\.(?:service-now\.[a-z]{2,}|servicenowservices\.com)\b/gi, (h) => tag('instance-url', h));
  // 6. GUIDs, then sys_ids bounded by NON-HEX, so `sys_idIN<id>` and `_<id>` are caught and a longer sha is not.
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<guid>');
  out = out.replace(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g, '<sys_id>');
  out = out.replace(/(?<![0-9A-F])[0-9A-F]{32}(?![0-9A-F])/g, '<sys_id>');
  // 7. The product's own shapes held aside before names by value: versions with their pre-release, CLI flags.
  out = out.replace(/(?<![\w.-])v?\d+\.\d+\.\d+(?:-(?:dev|rc\.\d+|alpha\.\d+|beta\.\d+))?(?![\w.-])/g, hold);
  out = out.replace(/(?<![\w-])--[a-z][a-z0-9-]*/g, hold);
  // 8. Names by value, longest first, case-insensitive and separator-flexible (mask-values.mjs, shared with the doctor).
  out = maskByValue(out, byValueEntries({ engagement, aliases, labels, stems, usernames }),
    (kind, m) => (kind === 'engagement' ? '<engagement>' : tag(kind, m)));
  // 9. A custom scope's vendor prefix names the customer whatever the folder is called; x_snc_ is ServiceNow's own.
  out = out.replace(/(?<![A-Za-z0-9])x_(?!snc_)(?!<)[a-z0-9]+_/g, 'x_<vendor>_');
  // 10. Record numbers: any admin-set prefix of 2 to 10 letters and 6 or more digits; lower case only with a non-hex
  //     letter, so a short git sha never reads as one.
  out = out.replace(/(?<![A-Za-z0-9])[A-Z]{2,10}\d{6,}(?![A-Za-z0-9])/g, '<record>');
  out = out.replace(/(?<![A-Za-z0-9])(?=[a-z]*[g-z])[a-z]{2,10}\d{6,}(?![A-Za-z0-9])/g, '<record>');
  // 11. redact() last, with ServiceNow script and page shapes held aside from its first.last rule.
  out = out.replace(/(?<![\w.])(?:current|previous|gs|gr|g_form|g_user|g_list|g_scratchpad|email|template|producer|workflow|action|answer|event|inputs|outputs|fd_data|task|incident|problem|change_request)\.[A-Za-z_]\w*/g, hold);
  out = out.replace(/\b[a-z][a-z0-9_]*\.(?:do|list|form|xml)\b/gi, hold);
  out = redact(out);
  for (let i = 0; i < 3 && /\u0001\d+\u0001/.test(out); i += 1) out = out.replace(/\u0001(\d+)\u0001/g, (_, n) => held[Number(n)]);
  return out;
}

const PRODUCT = new Set(['Service Desk', 'Now Assist', 'Business Rule', 'Script Include', 'Flow Designer',
  'Service Operations Workspace', 'Online Banking']);

/** Advisory, not a mask: capitalised runs and codes left in the masked text, likely names, places and systems. */
export function reviewList(masked) {
  const hits = masked.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b|\b[A-Z][A-Za-z]*\d+[A-Za-z\d]*\b|\b[A-Z]{3,}(?:-[A-Z0-9]+)+\b/g) ?? [];
  return [...new Set(hits)].filter((h) => !PRODUCT.has(h) && !/^(?:PN|ARC|E|SV)-/.test(h));
}

/** What no pattern catches, said every time: the reader checks these before sending. */
export const FIXED_REVIEW = Object.freeze([
  'people: names of colleagues, users and customers',
  'places: cities, sites and offices',
  'company names and abbreviations that neither the instance store nor aliases.txt holds',
  'ticket keys in other systems, such as Jira or Azure DevOps',
  'record numbers with fewer than 6 digits',
  'a credential written in plain words that no rule recognises',
]);

/** Said in the header and in the review list when the store's usernames and secrets were not read. */
const CREDENTIALS_NOT_READ = 'credentials NOT read — check usernames and passwords before sending';

/** Product words too common to be a client's name: a name that is one masks every use of the word. */
const PRODUCT_WORDS = new Set([...ENV_WORDS, 'incident', 'problem', 'change', 'request', 'task', 'case', 'knowledge',
  'service', 'desk', 'portal', 'workspace', 'itsm', 'csm', 'hrsd', 'itom', 'cmdb', 'now', 'servicenow', 'snowarch',
  'admin', 'user', 'group', 'flow', 'catalog', 'report']);

/** A warning for each engagement name or alias of 3 letters or fewer, or one that is a product word. */
export function aliasWarnings({ engagement = '', aliases = [] } = {}) {
  const out = [];
  for (const name of [engagement, ...aliases].filter(Boolean)) {
    const letters = name.replace(/[^A-Za-z]/g, '');
    if (PRODUCT_WORDS.has(name.trim().toLowerCase())) {
      out.push(`warning: "${name}" is a product word, so every "${name}" is masked, wherever it means the product`);
    } else if (letters.length <= 3) {
      out.push(`warning: "${name}" is ${letters.length} letters long, so it is masked wherever those letters stand alone`);
    }
  }
  return out;
}

/**
 * The whole output: what ran, the warnings, the masked text, and what the reader must still check. The two tiers are
 * reported apart: the store's names can be read where its credentials cannot (a checkout without its dependencies, a
 * store the loader refuses), and a header that said only "(store read)" then hid unmasked usernames.
 */
export function renderFinding(text, values = {}, { storeRead = false, credentialsRead = false } = {}) {
  const masked = maskFinding(text, values);
  const instanceNames = new Set([
    ...(values.labels ?? []).filter((l) => !ENV_WORDS.has(l)),
    ...(values.storeUrls ?? []).flatMap((u) => { try { const h = new URL(u).hostname.toLowerCase(); return [h, stemOf(h)]; } catch { return []; } }),
  ]);
  const head = [storeRead
    ? `instance names masked by value: ${instanceNames.size} (store read)`
    : 'instance store NOT read — check every instance name',
  credentialsRead ? 'credentials read' : CREDENTIALS_NOT_READ].join(' · ');
  const review = [...(credentialsRead ? [] : [CREDENTIALS_NOT_READ]), ...reviewList(masked), ...FIXED_REVIEW];
  return [head, ...aliasWarnings(values), '', masked.trimEnd(), '', 'Read before sending:',
    ...review.map((r) => `- ${r}`), ''].join('\n');
}

const refuse = (why) => ({ ok: false,
  reason: `finding: ${why}. Nothing was read: a finding is a note at clients/<engagement>/findings/<name>.md.` });

/** The note the path names, or why it is refused. Backslashes are read as separators. */
export function resolveFindingPath(root, arg) {
  const rel = String(arg ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel.split('/').includes('..')) return refuse(`"${rel}" contains ".."`);
  const m = FINDING_PATH.exec(rel);
  if (!m) return refuse(`"${rel}" is not under clients/<engagement>/findings/`);
  const [, engagement, name] = m;
  if (engagement === '_unfiled') return refuse('`_unfiled` holds design artefacts only, never a finding');
  if (!name.endsWith('.md')) return refuse(`"${name}" is not a .md note`);
  const path = join(root, 'clients', engagement, 'findings', name);
  let stat;
  try { stat = lstatSync(path); } catch { return refuse(`${rel} does not exist`); }
  if (stat.isSymbolicLink()) return refuse(`${rel} is a symlink`);
  if (!stat.isFile()) return refuse(`${rel} is not a file`);
  // A symlinked folder on the way resolves elsewhere: the real path must be the one asked for.
  if (realpathSync(path) !== join(realpathSync(root), 'clients', engagement, 'findings', name)) {
    return refuse(`${rel} resolves outside its findings folder`);
  }
  return { ok: true, path, engagement, name };
}

const today = () => new Date().toISOString().slice(0, 10);

/** A free path for a new note: <date>-<slug>.md, then -2, -3 and so on, so no note is overwritten. */
export function nextFindingName(root, engagement, slug, { date = today() } = {}) {
  if (engagement === '_unfiled') throw new Error('`_unfiled` holds design artefacts only, never a finding');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(engagement)) throw new Error(`"${engagement}" is not an engagement folder name`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`"${slug}" is not a slug: lowercase letters, digits and hyphens`);
  const base = `clients/${engagement}/findings/${date}-${slug}`;
  for (let n = 1; ; n += 1) {
    const rel = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    if (!existsSync(join(root, rel))) return rel;
  }
}

/** The engagement's other names, one per line, `#` for comments; none when the file is absent. */
function readAliases(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  } catch { return []; }
}

/**
 * The credential tier, this script's alone: usernames, through the store loader that registers the store's secrets
 * with the redactor as it parses (instance-file.mjs:135), so step 11 masks them by value. mask-values.mjs never reads
 * the credential block (label.ts:133), and nothing here prints a credential: it only feeds the masker. When it cannot
 * read them, the caller says so in the header and the review list; it never fails quietly.
 */
async function credentialValues(storePath, root) {
  const { loadContract } = await import('../../../packages/contract/lib/contract.mjs');
  const { readInstanceFile } = await import('./instance-file.mjs');
  const contract = loadContract({ root: ENGINE_ROOT, verifyPin: false });
  const r = await readInstanceFile(storePath, { root, contract });
  if (!r.ok) return { read: false, usernames: [] };
  return { read: true, usernames: Object.values(r.store.instances).map((e) => e?.auth?.username).filter(Boolean) };
}

/** `finding.mjs <clients/<engagement>/findings/<name>.md>` or `finding.mjs --next-name <engagement> <slug>`. */
export async function main(argv, { root = ENGINE_ROOT, env = process.env, out = process.stdout,
  credentialReader = credentialValues } = {}) {
  if (argv[0] === '--next-name') {
    try { out.write(`${nextFindingName(root, argv[1], argv[2])}\n`); return 0; } catch (e) { out.write(`finding: ${e.message}\n`); return 2; }
  }
  const target = resolveFindingPath(root, argv[0]);
  if (!target.ok) { out.write(`${target.reason}\n`); return 2; }
  const storePath = env.SNOW_STORE || join(root, '.local', 'instances.json');
  const hosts = storeHostValues(storePath);
  // A store that cannot be read at all has no credentials to read either; a loader that fails is reported, not hidden.
  let credentials = { read: false, usernames: [] };
  if (hosts.read) { try { credentials = await credentialReader(storePath, root); } catch { /* reported below, as NOT read */ } }
  const values = { engagement: target.engagement,
    aliases: readAliases(join(root, 'clients', target.engagement, 'findings', 'aliases.txt')),
    labels: hosts.labels, storeUrls: hosts.hosts.map((h) => `https://${h}`), usernames: credentials.usernames };
  out.write(renderFinding(readFileSync(target.path, 'utf8'), values, { storeRead: hosts.read, credentialsRead: credentials.read }));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
