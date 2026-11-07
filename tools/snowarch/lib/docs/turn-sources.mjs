// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 (M4) — what this session has actually READ, from the transcript Claude Code keeps.
//
// The Stop hook's grounding check (grounding-check.mjs) asks of every name and citation in an answer: did this session get it from a
// corpus page it Read, a skill it loaded, something the user wrote, or a roster builder — or from nowhere? This file answers from the
// session JSONL (`transcript_path`), and from nothing else. Its facts were measured at Claude Code 2.1.214, 2.1.309 and 2.1.318,
// `claude -p` and interactive (tests/fixtures/transcripts/MANIFEST.json; the architect's P0 rulings of 2026-11-07):
//
//   - a row is classified by its text PREFIX, whether or not a flag is set: on disk a hook's injected row is `isMeta: true` with a
//     string content, in stream-json `isSynthetic: true` with a text block. The flags are recorded and never required.
//   - sub-agent rows are NOT in the main file (`<session>/subagents/agent-<id>.jsonl`, `isSidechain: true`); in stream-json they carry
//     `parent_tool_use_id`. Both are dropped here, whatever the caller passes. A sub-agent's result reaches the main thread as the
//     Agent tool's result, or — an async agent — as a `<task-notification>` user row, which also starts a turn.
//   - at Stop the file holds every tool row and every earlier text block of the turn, but not the final text, which lands 50–130 ms
//     later: the final reply is `last_assistant_message`, and the file's text blocks are the ones before it.
//   - compaction writes a `system` row `compact_boundary`; every source before the LAST one stops grounding, whatever the trigger.
//
// WHAT COUNTS (the architect's table). read: a successful Read of a corpus page (only the lines returned, so offset and limit are
// honoured). skill: a loaded skill body, a Read of a roster SKILL.md or EXAMPLES.md. named: the user's prompts, the always-loaded rules
// and governance read from the checkout (given by the caller, never from api-request or prompt_snapshot rows), MCP results, Reads of
// client inputs. builder: the result of a roster builder sub-agent. A saved Envelope: its own citations, and the names its cited
// pages print. NEVER a source: assistant text, a non-roster agent's result, a Workflow result, a failed Read, a Glob, a Grep line,
// every row of our own hooks.
//
// PURE where it can be: `turnSources(rows, options)` does no I/O and reads no clock. `readTurnSources(path)` reads the file.
import { readFileSync, statSync } from 'node:fs';
import { pageNames } from './name-rules.mjs';
import { corpusRelative } from './resolve.mjs';

/** Over this many bytes a transcript is not read: the check runs on the reply alone. */
export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

/** The prefixes by which a user row is known, in the order tried. A flag never decides; the prefix does. */
const PREFIXES = Object.freeze([
  [/^Stop hook feedback:/, 'hook-feedback'],
  [/ Do not mention this notice\.\s*$/, 'hook-notice'],
  [/^Base directory for this skill:/, 'skill-body'],
  [/^This session is being continued from a previous conversation/, 'compaction-summary'],
  [/^<task-notification>/, 'task-notification'],
  [/^<(?:local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args|bash-input|bash-stdout|bash-stderr|system-reminder)>/, 'command'],
  [/^\[Request interrupted by user/, 'interrupt'],
]);

const FLAGS = ['isMeta', 'isSynthetic', 'isCompactSummary', 'isVisibleInTranscriptOnly'];

/** Rows parsed from the text of a transcript: CRLF and a BOM tolerated, a line that does not parse counted and skipped. */
export function parseTranscript(text) {
  const rows = [];
  let badLines = 0;
  const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === 'object' && !Array.isArray(row)) rows.push(row); else badLines += 1;
    } catch { badLines += 1; }
  }
  return { rows, badLines, crlf: text.includes('\r\n') };
}

/** The shape of Claude Code's session JSONL: at least one row with a string `type`, and most lines parse. */
export const looksLikeTranscript = ({ rows, badLines }) =>
  rows.length > 0 && rows.some((r) => typeof r.type === 'string') && badLines <= rows.length;

const blocksOf = (row) => {
  const c = row?.message?.content;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return Array.isArray(c) ? c.filter((b) => b && typeof b === 'object') : [];
};
const textOfResult = (b) => {
  const c = b?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((x) => x && x.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n');
  return '';
};
const textOf = (row) => blocksOf(row).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
const posix = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/{2,}/g, '/');

/** Which flags a row carries, for the record. */
export const flagsOf = (row) => FLAGS.filter((f) => row?.[f] === true);

/**
 * What a user row's TEXT is, by prefix first. `prompt` is the only kind that is the user's own request. A flagged row with a prefix
 * nothing here knows (command output, a caveat, a reminder) is `flagged` — neither the request nor a source.
 */
export function classifyUserText(text, row = {}) {
  const t = String(text ?? '');
  const head = t.trimStart();
  for (const [re, kind] of PREFIXES) if (re.test(head)) return kind;
  return flagsOf(row).length ? 'flagged' : 'prompt';
}

/** Is this a main-thread row? Sub-agent rows (`isSidechain`, or a `parent_tool_use_id`) are dropped, whatever the caller passes. */
export const isMainRow = (row) => row && row.isSidechain !== true && (row.parent_tool_use_id === undefined || row.parent_tool_use_id === null);

/** The names a text prints: underscore tokens and dotted names, normalised as the names index normalises them. */
export function namesIn(text) {
  const { tokens, dotted } = pageNames(String(text ?? ''));
  const out = new Set(tokens);
  for (const d of dotted) out.add(d);
  return out;
}

const addAll = (set, names) => { for (const n of names) set.add(n); };

// What a Read path is, by its tail: the install's root is not needed, only the folder names the product owns.
const PATH_KINDS = Object.freeze([
  [/(?:^|\/)\.claude\/skills\/[^/]+\/(?:SKILL|EXAMPLES)\.md$/i, 'skill'],
  [/(?:^|\/)clients\/[^/]+\/envelopes\/[^/]+\.md$/i, 'envelope'],
  [/(?:^|\/)clients\/_unfiled\/[^/]+\.md$/i, 'envelope'],
  [/(?:^|\/)clients\//i, 'named'],
  [/(?:^|\/)(?:governance|templates|docs)\/.+\.md$/i, 'named'],
  [/(?:^|\/)\.claude\/rules\/[^/]+\.md$/i, 'named'],
  [/(?:^|\/)CLAUDE\.md$/, 'named'],
  [/(?:^|\/)vendor\/docs-map\.md$/, 'named'],
]);
const pathKind = (p) => {
  const q = posix(p);
  for (const [re, kind] of PATH_KINDS) if (re.test(q)) return kind;
  return null;
};

const CITATION = /markdown\/[A-Za-z0-9_./-]+?\.md/g;

/**
 * The session's sources, from its rows. `rows` are session-JSONL rows (or stream-json rows converted to that shape).
 * `options`: `builders` — the subagent_type names of the roster builders (.claude/agents/), `rosterSkills` — the roster's skill names,
 * `lead` — the opening words of our own block reason, to know a continuation is ours. Pure.
 */
export function turnSources(rows, options = {}) {
  const builders = options.builders ?? new Set();
  const rosterSkills = options.rosterSkills ?? new Set();
  const main = (Array.isArray(rows) ? rows : []).filter(isMainRow);

  // The last compact boundary: nothing before it is a source, a request or a prior reply.
  let boundary = -1;
  main.forEach((r, i) => { if (r.type === 'system' && r.subtype === 'compact_boundary') boundary = i; });
  const live = main.slice(boundary + 1);
  const out = {
    rowCount: main.length, live, boundary, compacted: main.filter((r) => r.type === 'system' && r.subtype === 'compact_boundary').length,
    request: [],                 // the user's prompts after the boundary
    replyBlocks: [],             // the assistant text blocks of the current turn that the file holds
    finalBlocks: [],             // those after the turn's last tool result: what the user reads last
    turnStart: -1,               // index into `live` of the row that began the current turn
    startedBy: null,             // 'prompt' | 'task-notification' | null
    pagesRead: new Set(),        // `markdown/<area>/….md`, distinct, after the boundary
    names: { read: new Set(), skill: new Set(), named: new Set(), builder: new Set() },
    savedCitations: new Set(),   // pages cited by saved Envelopes this session read
    envelopeNames: new Set(),    // names a saved Envelope prints (grounded only through the pages it cites)
    searches: [],                // [{ pattern, path, result }]
    feedback: [],                // [{ index, ours }] Stop-hook feedback rows of the current turn
    scope: { rosterSkill: false, corpus: false },
    classes: {},                 // how many rows of each user-row kind, for the debug record
  };

  // Pass 1 — the tool calls, by id; and where the current turn begins.
  const uses = new Map();
  let lastResult = -1;
  live.forEach((r, i) => {
    if (r.type === 'user' && blocksOf(r).some((b) => b.type === 'tool_result')) lastResult = i;
    if (r.type === 'assistant') {
      for (const b of blocksOf(r)) if (b.type === 'tool_use' && b.id) uses.set(b.id, { name: b.name, input: b.input ?? {}, at: i });
    } else if (r.type === 'user') {
      const hasResult = blocksOf(r).some((b) => b.type === 'tool_result');
      const text = textOf(r);
      if (hasResult && !text) return;
      const kind = classifyUserText(text, r);
      if (kind === 'prompt') { out.turnStart = i; out.startedBy = 'prompt'; }
      else if (kind === 'task-notification') { out.turnStart = i; out.startedBy = 'task-notification'; }
    }
  });

  const classOfAgent = (use) => {
    const type = use?.input?.subagent_type ?? use?.input?.subagentType ?? null;
    return type && builders.has(type) ? 'builder' : null;       // anything else — a reader, general-purpose, Explore, Plan, unknown — is never a source
  };

  live.forEach((r, i) => {
    if (r.type === 'assistant') {
      if (i > out.turnStart && i > (options.replyAfter ?? -1)) {
        for (const b of blocksOf(r)) {
          if (b.type !== 'text' || typeof b.text !== 'string' || !b.text) continue;
          out.replyBlocks.push(b.text);
          if (i > lastResult) out.finalBlocks.push(b.text);
        }
      }
      for (const b of blocksOf(r)) {
        if (b.type !== 'tool_use') continue;
        const input = b.input ?? {};
        if (b.name === 'Skill' && typeof input.skill === 'string' && (rosterSkills.size === 0 || rosterSkills.has(input.skill))) out.scope.rosterSkill = true;
        if (b.name === 'Read' && corpusRelative(input.file_path)) out.scope.corpus = true;
        if (b.name === 'Grep' && (/ServiceNowDocs/i.test(posix(input.path)) || /ServiceNowDocs/i.test(String(input.pattern ?? '')))) out.scope.corpus = true;
      }
      return;
    }
    if (r.type !== 'user') return;

    const text = textOf(r);
    const resultBlocks = blocksOf(r).filter((b) => b.type === 'tool_result');
    if (text && (resultBlocks.length === 0 || text.trim())) {
      const kind = classifyUserText(text, r);
      out.classes[kind] = (out.classes[kind] ?? 0) + 1;
      switch (kind) {
        case 'prompt': out.request.push(text); addAll(out.names.named, namesIn(text)); break;
        case 'skill-body':
          addAll(out.names.skill, namesIn(text));
          if (/[/\\]\.claude[/\\]skills[/\\]/.test(text.slice(0, 400))) out.scope.rosterSkill = true;
          break;
        case 'task-notification': {
          const id = /<tool-use-id>\s*([^<\s]+)\s*<\/tool-use-id>/.exec(text)?.[1];
          if (classOfAgent(id ? uses.get(id) : null) === 'builder') addAll(out.names.builder, namesIn(text));
          break;
        }
        case 'hook-feedback': {
          if (i > out.turnStart) out.feedback.push({ index: i, ours: Boolean(options.lead) && text.includes(options.lead) });
          break;
        }
        default: break;           // hook-notice, compaction-summary, command, interrupt, flagged: neither the request nor a source
      }
    }

    for (const b of resultBlocks) {
      if (b.is_error === true) continue;                                    // a failed Read is not a source, and is not a page read
      const use = uses.get(b.tool_use_id);
      if (!use) continue;                                                    // its call is before the boundary, or unknown
      const body = textOfResult(b);
      switch (use.name) {
        case 'Read': {
          const file = use.input.file_path;
          const rel = corpusRelative(file);
          if (rel && rel.endsWith('.md')) { out.pagesRead.add(rel); addAll(out.names.read, namesIn(body)); break; }
          const kind = pathKind(file);
          if (kind === 'skill') { addAll(out.names.skill, namesIn(body)); out.scope.rosterSkill = true; }
          else if (kind === 'named') addAll(out.names.named, namesIn(body));
          else if (kind === 'envelope') {
            addAll(out.envelopeNames, namesIn(body));
            for (const m of body.replace(/\\/g, '/').matchAll(CITATION)) out.savedCitations.add(m[0]);
          }
          break;
        }
        case 'Grep':
          out.searches.push({ pattern: String(use.input.pattern ?? ''), path: posix(use.input.path ?? ''), result: body });
          break;
        case 'Agent': case 'Task':
          if (classOfAgent(use) === 'builder') addAll(out.names.builder, namesIn(body));
          break;
        default:
          if (typeof use.name === 'string' && use.name.startsWith('mcp__')) addAll(out.names.named, namesIn(body));
          break;                                                              // Glob, Bash, Write, Workflow, WebFetch…: never a source
      }
    }
  });
  return out;
}

/**
 * The rows of the transcript at `transcriptPath` (`{ rows, badLines, crlf, bytes }`), or `null` when there is nothing to read: a
 * missing or unreadable file, an unknown format, a file over MAX_TRANSCRIPT_BYTES. `onDebug` is told why, once. Never throws.
 */
export function readTranscriptRows(transcriptPath, { read = readFileSync, stat = statSync, maxBytes = MAX_TRANSCRIPT_BYTES, onDebug = () => {} } = {}) {
  try {
    if (typeof transcriptPath !== 'string' || !transcriptPath) { onDebug('no transcript path'); return null; }
    const size = stat(transcriptPath).size;
    if (size > maxBytes) { onDebug(`transcript is ${size} bytes, over the ${maxBytes} limit: reply-only checks`); return null; }
    const parsed = parseTranscript(read(transcriptPath, 'utf8'));
    if (!looksLikeTranscript(parsed)) { onDebug('transcript format not recognised'); return null; }
    return { ...parsed, bytes: size };
  } catch (e) {
    onDebug(`transcript unreadable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** The transcript's rows and the sources in them (`readTranscriptRows` + `turnSources`), or `null`. The architect's replay calls this. */
export function readTurnSources(transcriptPath, { options = {}, ...io } = {}) {
  const t = readTranscriptRows(transcriptPath, io);
  return t ? { ...t, ...turnSources(t.rows, options) } : null;
}
