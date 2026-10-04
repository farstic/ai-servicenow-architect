// ARC-09-C81 — the roster's identifiers against the bundled corpus, as a library.
//
// The citation gate proves that a cited PAGE exists. It never asked whether the NAMES a skill
// writes — a table, a field, a role, a property — exist in the corpus that page came from, and on
// 2026-10-04 the roster wrote 232 snake_case names the corpus does not contain, 66 of them with a
// platform prefix (`sn_customerservice_contract`, `cmdb_ci_appl_cluster`), each one read by a model
// as a fact. This is the other half of the gate: every identifier in `.claude/skills/**` and
// `.claude/agents/*.md` is looked up, whole, in the corpus, and one the corpus lacks must be excused
// in a way a reader can check.
//
// Tier 1 — an absent name whose first segment is a platform namespace (PLATFORM_PREFIXES) is a claim
// about the platform. It passes only as a snowarch tool, read from the contract; with MARKER on its
// line; written `<stem>_*` over a family the corpus holds; as a declared name the corpus prints glued
// to its label; or as an example's own proposal, declared once in its file with PROPOSED on the line
// (`sn_customerservice_case_escalation`, a table proposed in the module's baseline scope). There is no
// allow-list for it: the fix is the corpus's name, the marker, the declaration, or a rename.
// Tier 2 — any other absent name passes with an allow-list entry keyed by (file, identifier) and a
// reason from REASONS. A name the text places on a corpus name (`incident.assigned_at`) is a claim
// about that table, so no example-local reason covers it.
// Qualified names — `com.*`, `glide.*`, and `sn_<scope>.<name>` where the corpus uses `sn_<scope>.`
// as a namespace — are looked up whole: both halves of `sn_si.major_incident_manager` exist, and the
// pair does not. A dotted name whose left part is `x_`/`u_` is custom as a whole, and so is a name
// written straight after the roster's placeholder prefix, `x_<vendor>_<app>_business_severity`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { loadContract, toolNames } from '../../../../packages/contract/lib/contract.mjs';

/** The one phrase that marks a platform name the corpus does not document. Checked on the line. */
export const MARKER = 'not documented in the bundled corpus — verify on the instance';

/**
 * The phrase that declares an example's own proposal under a platform name — a table proposed in a
 * module's baseline scope, which the platform would name `sn_<module>_…`. One line carrying it with
 * the name declares that name for the whole file; no phrase, no pass.
 */
export const PROPOSED = 'proposed — not baseline';

/** First segments that make an absent name a claim about the platform. Each must begin a corpus name. */
export const PLATFORM_PREFIXES = Object.freeze([
  'change', 'chg', 'cmdb', 'cmn', 'csm', 'customer', 'em', 'hr', 'incident', 'kb', 'mid', 'service',
  'sla', 'sn', 'snow', 'sys',
  // The abbreviated namespaces. Each begins corpus tables (`sc_req_item`, `sa_pattern`, `ecc_agent`,
  // `ast_contract`, `sysrule_assignment`), so a name that starts with one reads as a platform object.
  'sc', 'sa', 'ecc', 'ast', 'alm', 'pa', 'wf', 'fm', 'ais', 'awa', 'asmt', 'm2m', 'imp', 'sp', 'oauth',
  'sysapproval', 'sysevent', 'sysauto', 'syslog', 'sysrule',
]);

/** Why a tier-2 name may be absent from the corpus. Closed: a new reason is a change to this file. */
export const REASONS = Object.freeze({
  'example-field': "a field of the example's own table; the entry names that table — x_/u_, or declared proposed in the file",
  'payload-key': "a key of an external system's payload, or an input or output of an example action",
  'example-role': 'a role the example invents',
  'script-variable': 'a variable, parameter or property inside example code',
  'example-name': 'any other name the example invents: a group, a metric, an index, a file, a value',
});

/**
 * A left part with fewer distinct dotted names in the corpus is a table written with a field
 * (`sn_hr_core_case.state`), not a namespace. Measured 2026-10-04: the tables the roster writes that
 * way reach 2 (`sn_hr_core_case`); `sn_si.` has 7; and four insurance scopes sit in the gap below the
 * line and are not looked up whole — `sn_ins_underwrite` (4), `sn_ins_uw_b2b`, `sn_ins_indiv_uw` and
 * `sn_ins_group_uw` (3 each).
 */
export const NAMESPACE_MIN = 5;

/** A `<stem>_*` site names a family: the corpus must hold this many names beginning `<stem>_`. A family of one is a name. */
export const FAMILY_MIN = 2;

const ALLOWLIST = new URL('./identifier-allowlist.json', import.meta.url);
const TOKEN = /[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g;
const DOTTED = /[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+/g;
const CUSTOM = /^(x|u)_/;
// The roster's placeholder prefix, one or more angle-bracket segments: `x_<vendor>_<app>_`.
const PLACEHOLDER = /x_(?:<[^<>\s]+>_)+$/;
// Leading and trailing underscores are markdown emphasis (`_sn_hr_core_`), not part of the name.
const bare = (t) => t.toLowerCase().replace(/^_+|_+$/g, '');
const dotted = (t) => t.toLowerCase().split('.').map((p) => p.replace(/^_+|_+$/g, '')).filter(Boolean).join('.');
const candidate = (left) => left === 'com' || left === 'glide' || /^sn_[a-z0-9_]+$/.test(left);
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : (e.name.endsWith('.md') ? [join(d, e.name)] : []));

/** `{ allow, glued }` — the tier-2 entries and the declared corpus-glued names. */
export function readAllowList() {
  const { allow, glued } = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
  return { allow, glued };
}

/** The files the check reads: every `.md` under `.claude/skills/`, and the agent definitions. */
export function rosterFiles(root) {
  const skills = join(root, '.claude', 'skills');
  const agents = join(root, '.claude', 'agents');
  return [
    ...(existsSync(skills) ? walk(skills) : []),
    ...(existsSync(agents) ? readdirSync(agents).filter((f) => f.endsWith('.md')).map((f) => join(agents, f)) : []),
  ].sort();
}

/**
 * Every identifier site in the roster, with no corpus involved, so the allow-list's own checks run
 * on a cell that has none. A site records the name it sits on (`incident` in `incident.assigned_at`),
 * the dotted name it is part of (only the corpus can say whether that one is qualified), and whether
 * it is written as a `<stem>_*` family.
 */
export function scanRoster(root) {
  const tokens = new Map();     // lower-cased name → { spellings, sites: [{ file, line, text, on, within, glob }] }
  const qualified = new Map();  // lower-cased dotted name → [{ file, line, text }]
  const texts = new Map();      // file → its text, for an allow-list entry's table
  const proposed = new Map();   // file → the names a PROPOSED line declares there
  const placeholders = [];      // names written straight after the x_<vendor>_<app>_ placeholder
  for (const abs of rosterFiles(root)) {
    const file = relative(root, abs).split(sep).join('/');
    const body = readFileSync(abs, 'utf8');
    texts.set(file, body);
    proposed.set(file, new Set(body.split(/\r?\n/).filter((l) => l.toLowerCase().includes(PROPOSED))
      .flatMap((l) => [...l.matchAll(TOKEN)].map((m) => m[0].toLowerCase()))));
    body.split(/\r?\n/).forEach((text, i) => {
      const line = i + 1;
      const spans = [];
      for (const m of text.matchAll(DOTTED)) {
        const whole = dotted(m[0]);
        const left = whole.split('.')[0];
        if (!whole.includes('.')) continue;
        const span = { from: m.index, to: m.index + m[0].length, whole, custom: CUSTOM.test(left) };
        spans.push(span);
        if (!span.custom && candidate(left)) {
          if (!qualified.has(whole)) qualified.set(whole, []);
          qualified.get(whole).push({ file, line, text });
        }
      }
      for (const m of text.matchAll(TOKEN)) {
        const span = spans.find((s) => m.index >= s.from && m.index < s.to);
        if (span?.custom) continue;
        if (PLACEHOLDER.test(text.slice(0, m.index))) { placeholders.push({ file, line, identifier: m[0].toLowerCase() }); continue; }
        const low = m[0].toLowerCase();
        const on = /([A-Za-z0-9_]+)\.$/.exec(text.slice(0, m.index))?.[1].toLowerCase() ?? null;
        const glob = text.startsWith('_*', m.index + m[0].length);
        if (!tokens.has(low)) tokens.set(low, { spellings: new Set(), sites: [] });
        const e = tokens.get(low);
        e.spellings.add(m[0]);
        e.sites.push({ file, line, text, on, glob, within: span && candidate(span.whole.split('.')[0]) ? span.whole : null });
      }
    });
  }
  return { tokens, qualified, texts, proposed, placeholders };
}

/**
 * The corpus's names: underscore tokens, the plain words the roster writes a field on, and the
 * dotted names under `com.`, `glide.` and `sn_*.`. One pass over every page; the `\_` escape the
 * corpus writes is removed before tokenising, or `sys\_user` would never match `sys_user`.
 */
export function corpusIndex(corpus, { words = new Set() } = {}) {
  const tokens = new Set();
  const seen = new Set();
  const names = new Set();
  for (const f of walk(join(corpus, 'markdown'))) {
    const text = readFileSync(f, 'utf8').replace(/\\_/g, '_');
    for (const m of text.matchAll(/[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*/g)) {
      const parts = m[0].split('.');
      for (const p of parts) {
        const t = bare(p);
        if (t.includes('_')) tokens.add(t);
        else if (words.has(t)) seen.add(t);
      }
      if (parts.length > 1) {
        const d = dotted(m[0]);
        if (d.includes('.') && candidate(d.split('.')[0])) names.add(d);
      }
    }
  }
  const namespaces = new Map();
  for (const d of names) {
    const left = d.split('.')[0];
    namespaces.set(left, (namespaces.get(left) ?? 0) + 1);
  }
  return { tokens, words: seen, dotted: names, namespaces, has: (t) => tokens.has(t) || seen.has(t) };
}

// The measured order: presence in the corpus decides first, whatever the capitalisation.
function classOf(low, spellings, has) {
  const sp = [...spellings];
  if (has(low)) return 'found';
  if (CUSTOM.test(low)) return 'custom';
  if (sp.every((s) => s === s.toUpperCase() && /[A-Z]/.test(s))) return 'constant';
  if (sp.every((s) => /[A-Z]/.test(s))) return 'mixed';
  return 'absent';
}

/** The allow-list and the glued list against the roster alone. Each error names its entry. */
export function checkAllowList(list, roster, { prefixes = PLATFORM_PREFIXES, glued = [] } = {}) {
  const errors = [];
  const keys = new Set();
  for (const e of list) {
    const fail = (why) => errors.push({ file: e.file, identifier: e.identifier, why });
    const key = `${e.file}\0${e.identifier}`;
    if (keys.has(key)) { fail('listed twice'); continue; }
    keys.add(key);
    if (!Object.hasOwn(REASONS, e.reason)) { fail(`reason "${e.reason}" is not one of ${Object.keys(REASONS).join(', ')}`); continue; }
    if (prefixes.includes(e.identifier.split('_')[0])) {
      fail('a platform-prefixed name has no allow-list: use the corpus name, the marker, or a rename');
      continue;
    }
    const t = roster.tokens.get(e.identifier);
    if (!t?.sites.some((s) => s.file === e.file)) { fail('the file does not write this name'); continue; }
    if (classOf(e.identifier, t.spellings, () => false) !== 'absent') { fail('a custom, constant or mixed-case name needs no entry'); continue; }
    if (e.reason !== 'example-field') {
      if (e.table) fail('only an example-field entry names a table');
      continue;
    }
    if (!e.table || !(CUSTOM.test(e.table) || roster.proposed.get(e.file)?.has(e.table.toLowerCase()))) {
      fail("an example-field entry names the example's own table: x_/u_, or declared proposed in that file");
      continue;
    }
    const esc = e.table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(^|[^A-Za-z0-9_])${esc}([^A-Za-z0-9_]|$)`, 'i').test(roster.texts.get(e.file) ?? '')) {
      fail(`the file does not write the table ${e.table}`);
    }
  }
  for (const g of glued) {
    const fail = (why) => errors.push({ file: g.page, identifier: g.identifier, why });
    if (!g.identifier || !g.glued || !g.page) { fail('a glued entry names the identifier, its glued spelling and the page'); continue; }
    if (!roster.tokens.has(g.identifier)) fail('the roster does not write this name');
  }
  return errors;
}

export function reasonCounts(list) {
  const counts = Object.fromEntries(Object.keys(REASONS).map((r) => [r, 0]));
  for (const e of list) if (Object.hasOwn(counts, e.reason)) counts[e.reason] += 1;
  return counts;
}

/**
 * Status `missing` when the corpus is absent: nothing is examined, and the result says so rather
 * than reporting a clean zero. The allow-list's roster-side errors are reported either way.
 */
export function verifyIdentifiers({ root = process.cwd(), corpusDir = 'vendor/ServiceNowDocs', allow, glued, tools,
                                    prefixes = PLATFORM_PREFIXES, index } = {}) {
  const lists = (allow && glued) ? null : readAllowList();
  const list = allow ?? lists.allow;
  const gluedList = glued ?? lists.glued;
  const roster = scanRoster(root);
  const allowErrors = checkAllowList(list, roster, { prefixes, glued: gluedList });
  const reasons = reasonCounts(list);
  const corpus = resolve(root, corpusDir);
  if (!index && !existsSync(join(corpus, 'markdown'))) {
    return { status: 'missing', checked: 0, classes: null, unexcused: [], excused: [], stale: [], deadPrefixes: [], allowErrors, reasons };
  }
  const words = new Set();
  for (const t of roster.tokens.values()) for (const s of t.sites) if (s.on && !s.on.includes('_')) words.add(s.on);
  const idx = index ?? corpusIndex(corpus, { words });
  // Names only, to excuse a mention of a tool. Whether the contract matches its pin is the contract
  // gate's question; this check must not fail on it.
  const toolSet = tools ?? new Set(toolNames(loadContract({ verifyPin: false })));
  const qualifies = (whole) => {
    const left = whole.split('.')[0];
    return left === 'com' || left === 'glide' || (idx.namespaces.get(left) ?? 0) >= NAMESPACE_MIN;
  };
  const families = new Map();
  const family = (stem) => {
    if (!families.has(stem)) families.set(stem, [...idx.tokens].filter((t) => t.startsWith(`${stem}_`)).length);
    return families.get(stem);
  };
  // A glued entry holds while the corpus still prints the name glued to its label on that page.
  const stale = [];
  const gluedOk = new Set();
  for (const g of gluedList) {
    const page = join(corpus, ...g.page.split('/'));
    const printed = existsSync(page) && readFileSync(page, 'utf8').replace(/\\_/g, '_').toLowerCase().includes(g.glued);
    if (idx.has(g.identifier)) stale.push({ file: g.page, identifier: g.identifier, why: 'the corpus has the name itself now: remove the glued entry' });
    else if (!idx.tokens.has(g.glued) || !printed) stale.push({ file: g.page, identifier: g.identifier, why: `the page no longer prints "${g.glued}": remove the glued entry` });
    else gluedOk.add(g.identifier);
  }
  const marked = (s) => s.text.toLowerCase().includes(MARKER);
  const entries = new Set(list.map((e) => `${e.file}\0${e.identifier}`));
  const unexcused = [];
  const miss = (s, identifier, why) => unexcused.push({ file: s.file, line: s.line, identifier, why });
  // Every site that passed only because of an excuse, and which one — the review reads this list.
  const excused = roster.placeholders.map((p) => ({ ...p, by: 'placeholder' }));
  const pass = (s, identifier, by) => excused.push({ file: s.file, line: s.line, identifier, by });
  const classes = { found: 0, custom: 0, constant: 0, mixed: 0, absent: 0, qualified: 0, qualifiedAbsent: 0 };

  for (const [whole, sites] of roster.qualified) {
    if (!qualifies(whole)) continue;
    classes.qualified += 1;
    if (idx.dotted.has(whole)) continue;
    classes.qualifiedAbsent += 1;
    for (const s of sites) {
      if (marked(s)) pass(s, whole, 'marker');
      else miss(s, whole, 'a qualified name the corpus does not have');
    }
  }
  for (const [low, t] of roster.tokens) {
    const sites = t.sites.filter((s) => !(s.within && qualifies(s.within)));
    if (!sites.length) continue;
    const cls = classOf(low, t.spellings, idx.has);
    classes[cls] += 1;
    if (cls !== 'absent') continue;
    // A snowarch tool is snowarch's name, not the platform's: the contract answers for it, in either tier.
    if (toolSet.has(low) || gluedOk.has(low)) {
      for (const s of sites) pass(s, low, toolSet.has(low) ? 'tool' : 'glued');
      continue;
    }
    const tier1 = prefixes.includes(low.split('_')[0]);
    for (const s of sites) {
      if (marked(s)) { pass(s, low, 'marker'); continue; }
      if (s.glob) {
        const n = family(low);
        if (n < FAMILY_MIN) miss(s, `${low}_*`, `a family needs ${FAMILY_MIN} corpus names beginning ${low}_; the corpus has ${n}`);
        else pass(s, `${low}_*`, 'glob');
        continue;
      }
      if (tier1) {
        if (roster.proposed.get(s.file)?.has(low)) pass(s, low, 'proposed');
        else miss(s, low, 'platform-prefixed and not in the corpus: use its name, the marker, or a rename');
      } else if (s.on && !CUSTOM.test(s.on) && idx.has(s.on)) {
        miss(s, low, `written on ${s.on}, which the corpus names, so no example reason covers it`);
      } else if (entries.has(`${s.file}\0${low}`)) {
        pass(s, low, 'allow-list');
      } else {
        miss(s, low, 'not in the corpus and not in the allow-list');
      }
    }
  }
  for (const e of list) if (idx.has(e.identifier)) stale.push({ file: e.file, identifier: e.identifier, why: 'the corpus has this name: remove the entry' });
  const firsts = new Set([...idx.tokens].map((t) => t.split('_')[0]));
  const deadPrefixes = prefixes.filter((p) => !firsts.has(p));
  const bad = unexcused.length + stale.length + deadPrefixes.length + allowErrors.length;
  return {
    status: bad ? 'fail' : 'ok',
    checked: classes.found + classes.custom + classes.constant + classes.mixed + classes.absent + classes.qualified,
    classes, unexcused, excused, stale, deadPrefixes, allowErrors, reasons,
  };
}

export function formatIdentifiers(r) {
  const lines = r.allowErrors.map((e) => `ALLOW ${e.file} ${e.identifier} — ${e.why}`);
  if (r.status === 'missing') {
    lines.push('identifiers: examined nothing — the corpus is absent');
    return { text: lines.join('\n'), code: r.allowErrors.length ? 1 : 0 };
  }
  for (const p of r.deadPrefixes) lines.push(`PREFIX ${p} — begins no corpus name; remove it from PLATFORM_PREFIXES`);
  for (const u of r.unexcused) lines.push(`UNEXCUSED ${u.file}:${u.line} ${u.identifier} — ${u.why}`);
  for (const s of r.stale) lines.push(`STALE ${s.file} ${s.identifier} — ${s.why}`);
  lines.push(`identifiers: checked ${r.checked} | unexcused ${r.unexcused.length}`);
  return { text: lines.join('\n'), code: r.status === 'ok' ? 0 : 1 };
}
