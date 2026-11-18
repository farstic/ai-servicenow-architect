#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — the Stop hook. The corpus's own links name a page at a path the corpus does not have, and a reply that
// copies one cites a page that is not there. When the reply ends, the paths it cites are looked up; one that does not
// exist, and that the resolver knows the page for, sends the turn on once with `decision: "block"` and a reason that asks
// for ONE line starting "Correction:". Not the answer again: asked to correct a citation "in the answer", a model wrote
// the whole answer out again and named the dead path in it, which for an Envelope is minutes.
//
// THREE PROMISES, after post-write.mjs's.
//
//   IT ASKS ONCE. `stop_hook_active` is true when Claude Code is already continuing because a Stop hook asked, and then
//   this never blocks again; Claude Code ends a run of consecutive blocks by itself (after eight, since 2.1.143), and this is
//   a cap of one. It is also true after ANY Stop hook continued the turn, so another one that goes first makes this skip:
//   it fails open. ARC-09-C263: on that continuation, when the earlier block was OURS (a "Stop hook feedback:" row carrying our
//   lead), it may tell the USER what stayed open, as a `systemMessage` — never the model, and never a second block.
//
//   IT NEVER FAILS A TURN ON ITS OWN ACCOUNT. Any exception exits 0 with nothing on stderr. A citation the gate cannot read
//   (a second brace group) is skipped with its line, and the other lines are still read. ARC-09-C263's grounding part (below) sits
//   in its own try/catch with a 3 s deadline for the whole run (DEADLINE_MS), inside the 10 s the entry is given: an error, an unreadable
//   transcript, an input cut short (a sub-agent folder past its cap, a lost line of the session file) or the deadline leaves the citation part alone,
//   and a debug line says why when SNOWARCH_HOOK_DEBUG is set.
//
//   IT IS FAST. It runs at the end of every turn. A reply with no backtick, no `markdown/`, no absence phrase, no resting phrase
//   and no `Pages read` exits having imported nothing; one whose citations are all on disk looks at the disk and nothing else; one
//   that cites a path that is not reads the corpus tree once (lib/docs/resolve.mjs). The grounding part reads the transcript once
//   (a Stop reads the session file once, whoever asks first) and the names index (built at docs sync, never here) when a name or an absence
//   phrase needs it. When `citedUnread` may ask (lever 2, ARC-09-C267) a reply with a `.md` name in it, or a session whose file holds `markdown/`,
//   goes to the check although its words show nothing: a bare file name is a citation, and a file the turn wrote may cite. The names a session's
//   pages print are collected only for a class that asks for them, so the walk of a 63 MB session file takes about half a second.
//
// It says nothing for a citation that cannot be resolved, or that is alive (a real page this install did not check out
// is alive: ARC-09-C239), and nothing for a dead path whose page the reply already carries: the floor run found a model that
// followed the Read hook's note and then wrote where it had looked first and that the path does not exist, next to the right
// page, and a line that said the same again was no correction. `decision: "block"` is the form every Claude Code version has; the quieter
// `hookSpecificOutput.additionalContext` on a Stop hook came with 2.1.163. The root comes from this file's own location,
// for the reason session-start.mjs gives.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MB } from '../lib/size.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** A path with its links resolved, or as given when it cannot be. */
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

/** The last words of the reason: the user is to see the correction and never the mechanism, so the notice stays out of the reply. */
const KEEP_OUT = ' Do not mention this notice.';

/** What the model is asked, word for word: two paths for each citation, and fixed words. */
function asking(pairs) {
  const list = pairs.map(([cited, page]) => `${cited} -> ${page}`).join('; ');
  const ask = pairs.length === 1
    ? `Your reply cites a corpus page at a path that does not exist: ${list}. `
      + 'Add one line that starts "Correction:" and gives the right path. Do not repeat the answer, and do not write the wrong path again.'
    : `Your reply cites ${pairs.length} corpus pages at paths that do not exist: ${list}. `
      + 'Add one line that starts "Correction:" and gives the right path for each. Do not repeat the answer, and do not write the wrong paths again.';
  return ask + KEEP_OUT;
}

/** The cheapest test that a reply has anything to check: a backtick, a corpus path, an absence or a resting phrase, a page count. */
const NEEDS_CHECK = /`|markdown\/|not documented|not in the (?:bundled )?corpus|undocumented|citation unavailable|Pages read|un-?verified|not (?:yet )?(?:opened|read|checked|verified)|(?:did|could) not (?:open|read)|budget/i;

/** A transcript over this is not read by the cheap gate below (the same limit as lib/docs/turn-sources.mjs). */
const MAX_GATE_BYTES = 64 * MB;
/** The largest page the name support check reads whole (ARC-09-C291); a larger one cannot be judged, and its lines are not asked about. */
const MAX_SUPPORT_PAGE = 8 * MB;

/**
 * Could the turn have cited a corpus page the answer's own words do not show? (ARC-09-C267, lever 2.) Only when the class `citedUnread` may ask (the
 * classes data, or the test seam's `options.blocking`) and either the answer holds a `.md` name (a bare `c_Name.md` is a citation) or the session's own
 * file has `markdown/` in it at all (a file the turn wrote may cite; a session that never met the corpus has none). The file is read through `readOnce`,
 * which the check shares, so a Stop reads it once. Nothing is imported. False on anything it cannot read.
 */
function writtenMayCite(input, seams, readOnce, message = '') {
  try {
    if (typeof input?.transcript_path !== 'string') return false;
    let blocking = seams.options?.blocking;
    if (!Array.isArray(blocking)) {
      const text = Object.hasOwn(seams, 'classesText') ? seams.classesText : readFileSync(fileURLToPath(new URL('../lib/docs/grounding-classes.json', import.meta.url)), 'utf8');
      blocking = typeof text === 'string' ? JSON.parse(text)?.blocking : [];
    }
    if (!Array.isArray(blocking)) return false;
    // A bare `.md` name in the reply is a citation for either class: of a page that may be unread, and of a page that may not print a name cited for it (ARC-09-C291).
    if ((blocking.includes('citedUnread') || blocking.includes('unsupportedName')) && /[A-Za-z0-9_-]\.md\b/.test(message)) return true;
    if (!blocking.includes('citedUnread')) return false;
    if (statSync(input.transcript_path).size > MAX_GATE_BYTES) return false;
    return readOnce(input.transcript_path, 'utf8').includes('markdown/');
  } catch { return false; }
}

/**
 * The deadline of the whole grounding part, inside the 10 s the entry is given: past it nothing is asked and a debug line says so. The walk of a session
 * file takes a few hundred milliseconds on the largest ones measured (the names a page prints are not collected, which was nearly all of it), so this is
 * a ceiling for the unforeseen (a slow disk under the glob, a very large sub-agent folder) and not a budget a Stop is meant to use.
 */
export const DEADLINE_MS = 3000;

/** One debug line, only when asked for: a hook that fails open says nothing on stderr unless `SNOWARCH_HOOK_DEBUG` is set. */
const debugLine = (line) => { if (process.env.SNOWARCH_HOOK_DEBUG) process.stderr.write(`stop-citations: ${line}\n`); };

/** The citation part (ARC-09-C254), unchanged: the dead paths a reply cites whose page the resolver knows. `{ pairs, dead }`. */
async function deadCitations(message, { root, load }) {
  const empty = { pairs: [], dead: new Set() };
  if (!message.includes('markdown/')) return empty;
  const { extract } = await import('../lib/docs/citations.mjs');
  const lines = message.split('\n');
  const where = new Map();                                    // each cited path, in the order it first appears, and the lines it stands on
  lines.forEach((line, i) => {
    if (!line.includes('markdown/')) return;
    try {
      for (const c of extract(line).citations) {
        if (!where.has(c.path)) where.set(c.path, []);
        where.get(c.path).push(i);
      }
    } catch { /* a malformed group on this line: the other lines are still read */ }
  });
  if (where.size === 0) return empty;
  const { CORPUS_DIR } = await import('../lib/docs/sync.mjs');
  const corpus = join(root, CORPUS_DIR);
  // A page on disk is alive, and a design answer cites pages it has just read: the corpus tree is read only for a path that is not.
  const absent = [...where.keys()].filter((path) => !existsSync(join(corpus, ...path.split('/'))));
  if (absent.length === 0) return empty;
  // A finding records a path as the user saw it, and C231 does not check findings: a path that stands only inside the finder's
  // printed copy is not checked either, and a dead path written outside the copy still is.
  const { copyLines } = await import('../lib/finding-copy.mjs');
  const inCopy = copyLines(lines);
  const checked = absent.filter((path) => where.get(path).some((i) => !inCopy.has(i)));
  if (checked.length === 0) return empty;
  const { loadIndex, resolve: resolvePage } = await import('../lib/docs/resolve.mjs');
  const index = (load ?? loadIndex)(corpus);
  if (!index) return empty;
  // A reply that already carries the page the resolver names has nothing to correct, whatever it says of the dead path: a model that
  // followed the Read hook's note writes "I found it at <real>; my first read used <dead>, which does not exist". Separators are
  // read as slashes, so the real page spelled the Windows way counts.
  const carried = message.replaceAll('\\', '/');
  const pairs = [];
  for (const path of checked) {
    if (index.has(path)) continue;
    const page = resolvePage(path, index);
    if (page && !carried.includes(page.path)) pairs.push([path, page.path]);
  }
  return { pairs, dead: new Set(checked) };
}

/** Everything the grounding check needs from the checkout, read lazily: the roster, the always-loaded text, the docs pin, the tool names. */
function checkoutFacts(root) {
  const names = (dir, keep) => { try { return readdirSync(join(root, dir), { withFileTypes: true }).filter(keep).map((e) => e.name); } catch { return []; } };
  let tools = null;
  const toolSet = () => {
    if (tools) return tools;
    try { tools = new Set(JSON.parse(readFileSync(join(root, 'packages/snowarch/dist/contract.json'), 'utf8')).tools.map((t) => String(t.name).toLowerCase())); } catch { tools = new Set(); }
    return tools;
  };
  const text = (dir, ext) => names(dir, (e) => e.isFile() && e.name.endsWith(ext)).sort().map((f) => { try { return readFileSync(join(root, dir, f), 'utf8'); } catch { return ''; } }).join('\n');
  return {
    builders: new Set(names('.claude/agents', (e) => e.isFile() && e.name.endsWith('.md')).map((f) => f.slice(0, -3))),
    rosterSkills: new Set(names('.claude/skills', (e) => e.isDirectory())),
    isToolName: (n) => n.startsWith('snow_') && toolSet().has(n),
    named: () => {
      let claude = '';
      try { claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8'); } catch { /* none */ }
      return [claude, text('.claude/rules', '.md'), text('governance', '.md')].join('\n');
    },
    pin: () => { try { return JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'))?.docs?.pin ?? null; } catch { return null; } },
  };
}

/** Claude Code returns a Bash tool to the project folder after each command when this is set: a `cd` is then not the next call's. */
const keepsFolder = (env) => !/^(?:1|true|yes|on)$/i.test(String(env?.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR ?? '').trim());

/**
 * The grounding part (ARC-09-C263): the answer's names and citations against what this session read. Its own try/catch and its own
 * deadline; `null` leaves the citation part alone. `{ findings }` for a first Stop, `{ residual }` on the continuation. It asks nothing, and says why
 * on stderr when asked to, if the deadline passed or an input was cut short.
 */
async function grounding(input, message, { root, dead, started, seams = {}, debug, load, readOnce }) {
  const limit = seams.deadlineMs ?? DEADLINE_MS;
  const stop = () => Date.now() - started > limit;
  const late = () => { debug(`deadline: the grounding check passed its ${limit} ms and asked nothing`); return null; };
  try {
    const { groundingFindings, residualFindings, parseClasses, LEAD } = await import('../lib/docs/grounding-check.mjs');
    const { readSubagents, readTranscriptRows } = await import('../lib/docs/turn-sources.mjs');
    const { makeGlob } = await import('../lib/docs/glob-fs.mjs');
    const { CORPUS_DIR } = await import('../lib/docs/sync.mjs');
    const { loadNamesIndex } = await import('../lib/docs/names-index.mjs');
    const { normalisePage } = await import('../lib/docs/name-support.mjs');
    const { corpusNamesDir } = await import('../lib/local-paths.mjs');
    const { loadIndex } = await import('../lib/docs/resolve.mjs');
    const facts = checkoutFacts(root);
    const read = seams.readRows ?? readTranscriptRows;
    const transcript = typeof input.transcript_path === 'string' ? read(input.transcript_path, { onDebug: debug, read: readOnce }) : null;
    if (stop()) return late();
    const pin = facts.pin();
    const index = pin ? (seams.loadIndex ?? loadNamesIndex)(corpusNamesDir(root, pin), { pin }) : null;
    // Which classes block and the ubiquity threshold are DATA (grounding-classes.json), so the measurement changes them without a code diff.
    let classesText = null;
    if (Object.hasOwn(seams, 'classesText')) classesText = seams.classesText ?? null;                  // a test's: the file's text, or none
    else { try { classesText = readFileSync(fileURLToPath(new URL('../lib/docs/grounding-classes.json', import.meta.url)), 'utf8'); } catch { /* missing: nothing asks */ } }
    const classes = parseClasses(classesText);
    // The corpus tree, read once and only if a bare file name needs it (a `c_Name.md` that is a page of the corpus is a citation of every page of the name).
    let tree;
    const treeOf = () => {
      if (tree === undefined) { try { tree = (load ?? loadIndex)(join(root, CORPUS_DIR)); } catch { tree = null; } }
      return tree;
    };
    const pagesNamed = (name) => treeOf()?.named(name) ?? [];
    // Every page of the corpus, for the one question how many pages a pattern with no folder names (read-routes.mjs, B4 (c)); null when there is no tree.
    const allPages = () => treeOf()?.list?.() ?? null;
    // An input cut short asks nothing about citations: the page might have been read in what was lost.
    const incomplete = transcript?.lostLines > 0 ? [`the session file has ${transcript.lostLines} line(s) that do not parse`] : [];
    // The sub-agents' files are read once for the run, whoever asks for them (the check, and the notice, ask more than once).
    let sub;
    const sideRows = () => { if (sub === undefined) sub = (seams.sideRows ?? (() => readSubagents(input.transcript_path, { onDebug: debug, ...(seams.subagentLimits ?? {}) })))(); return sub; };
    // A page's text as the name support check compares it (name-support.mjs, ARC-09-C291): the whole page, read once for a Stop; null when it cannot be read or is too large.
    const norms = new Map();
    const pageNorm = (page) => {
      if (!norms.has(page)) {
        let norm = null;
        try {
          const file = join(root, CORPUS_DIR, ...page.split('/'));
          if (statSync(file).size <= MAX_SUPPORT_PAGE) norm = normalisePage(readFileSync(file, 'utf8'));
        } catch { /* the page cannot be judged */ }
        norms.set(page, norm);
      }
      return norms.get(page);
    };
    const options = { blocking: classes.blocking, ubiquity: classes.ubiquity, builders: facts.builders, rosterSkills: facts.rosterSkills,
      isToolName: facts.isToolName, named: facts.named, deadPaths: dead, shouldStop: stop, lead: LEAD, askedOnly: true, incomplete, pagesNamed, allPages,
      carryFolder: keepsFolder(seams.env ?? process.env),
      sideRows,
      glob: makeGlob({ shouldStop: stop }), pageExists: (page) => existsSync(join(root, CORPUS_DIR, ...page.split('/'))),
      // The text of a page, for the one question whether the result of a call that failed holds a line of it (read-routes.mjs, B2); the first 200,000 characters.
      pageText: (page) => { try { return readFileSync(join(root, CORPUS_DIR, ...page.split('/')), 'utf8').slice(0, 200_000); } catch { return null; } },
      pageNorm,
      ...(seams.options ?? {}) };
    if (input.stop_hook_active) {
      const r = residualFindings({ rows: transcript?.rows ?? null, reply: message, index, coverage: index?.coverage ?? null, options });
      for (const n of r.notes ?? []) debug(n);
      return stop() ? late() : { residual: r };
    }
    const f = groundingFindings({ rows: transcript?.rows ?? null, reply: message, index, coverage: index?.coverage ?? null, options });
    for (const n of f.notes ?? []) debug(n);
    debug(`names scanned: ${f.stats?.namesScanned ?? 0}`);
    return stop() ? late() : { findings: f };
  } catch (e) {
    debug(`grounding failed open: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * What the hook says for one Stop input: `{ code, stderr, stdout }`, always code 0.
 * - A reply citing a path that does not exist, with a page the resolver knows that the reply does not carry (C254), and/or names and
 *   citations the session did not get from what it read (C263): one line of JSON, `decision: "block"`, once per turn. Alone, the C254
 *   reason is byte for byte what it was; with both, C254's ask comes first without its closing words, then the grounding ask, then the
 *   closing words once.
 * - On the continuation (`stop_hook_active`): never a block; at most `{ systemMessage }` for the user, naming what stayed open.
 * - Anything else: nothing.
 * `load` reads the corpus tree (lib/docs/resolve.mjs's `loadIndex` when it is not given); `seams` are a test's.
 */
export async function report(input, { root = ROOT, load, seams = {} } = {}) {
  const none = { code: 0, stderr: '', stdout: '' };
  const started = Date.now();
  const debug = seams.debug ?? debugLine;
  const message = input?.last_assistant_message;
  if (typeof message !== 'string' || !message) return none;
  // The session file is read once for a Stop, whoever asks for it first.
  const fileRead = seams.read ?? readFileSync;
  const texts = new Map();
  const readOnce = (path, encoding) => {
    if (!texts.has(path)) texts.set(path, fileRead(path, encoding));
    return texts.get(path);
  };
  // The continuation of a turn goes to the check whatever it says: what it reports is what the ask left open, and that is in the session file (a bare file
  // name cited, with no `markdown/` anywhere in it, is such a case), not in the words of "Understood.".
  if (!input?.stop_hook_active && !NEEDS_CHECK.test(message) && !writtenMayCite(input, seams, readOnce, message)) return none;
  if (input?.stop_hook_active) {
    const g = await grounding(input, message, { root, dead: new Set(), started, seams, debug, load, readOnce });
    return g?.residual?.text ? { code: 0, stderr: '', stdout: `${JSON.stringify({ systemMessage: g.residual.text })}\n` } : none;
  }
  const { pairs, dead } = await deadCitations(message, { root, load });
  const g = await grounding(input, message, { root, dead, started, seams, debug, load, readOnce });
  const body = g?.findings?.reasonBody ?? null;
  if (pairs.length === 0 && !body) return none;
  const reason = !body ? asking(pairs)
    : pairs.length === 0 ? `${body}${KEEP_OUT}`
      : `${asking(pairs).slice(0, -KEEP_OUT.length)} ${body}${KEEP_OUT}`;
  return { code: 0, stderr: '', stdout: `${JSON.stringify({ decision: 'block', reason })}\n` };
}

const samePath = (a, b) => real(a) === real(b);
const isMain = process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  let out = { code: 0, stderr: '', stdout: '' };
  try {
    out = await report(JSON.parse(readFileSync(0, 'utf8')));
  } catch {
    // Its own failure is never the model's business: no block, and nothing on stderr.
    out = { code: 0, stderr: '', stdout: '' };
  }
  if (out.stdout) process.stdout.write(out.stdout);
  process.exitCode = out.code;
}
