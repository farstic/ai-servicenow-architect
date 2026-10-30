// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C87 — what a reviewer used to count by hand, per turn: the skills invoked, the corpus pages
// read, and the cited pages that do not exist.
//
// It judges nothing. A turn that read no corpus page, or cites one that is not there, is a fact the
// reviewer weighs against the case's Pass criteria; the runner does not mark its own work. What it
// does is resolve a citation the way a reader would: a full path is looked up as written, and a bare
// file name is looked up by name across the corpus — one match is reported as BARE (it resolves, and
// should have been a path), several as AMBIGUOUS, none as MISSING. The pre-cut Sonnet sitting cited by
// bare file name in three of nine answers, which a checker has to be able to tell apart from a page
// that does not exist.
//
// A skill run by its slash command (`/snowarch status`) is expanded by the CLI before the model's first step, so the stream
// holds no Skill call and no Read of its file. The turn's prompt says it ran, so a run that is given the prompt reports it
// as `slash command`; without that, the line read `skills: none` for a turn that followed the skill (ARC-09-C243).
//
// THE FINDING COPY (ARC-09-C252 (a)). `/snowarch finding` ends by running tools/snowarch/lib/finding.mjs on the note, and its output is
// what the user sends. A turn that ran it is reported as: in the reply as printed, in the reply but in a code fence, or not in the reply
// as printed (only in the tool result, or changed). T-37 turn 3 was judged by eye until a sitting found the copy fenced on one tree and
// pointed to ("its output is above") on another; counted, a before and an after are numbers.
//
//   node scripts/validation/turn-report.mjs <stream.jsonl> <checkout> [<prompt.txt>]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Files of this repository that the text may name without citing the corpus.
// (The checkout's own file names are read from git below; these are the ones every checkout has.)
const REPO_NAMES = new Set(['CLAUDE.md', 'SKILL.md', 'EXAMPLES.md', 'README.md', 'CHANGELOG.md']);
const MD = /[A-Za-z0-9_./\\-]+\.md\b/g;

function events(streamText) {
  const out = [];
  for (const line of String(streamText).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a ragged line is not a finding */ }
  }
  return out;
}

const blocks = (e) => (e?.type === 'assistant' && Array.isArray(e.message?.content) ? e.message.content : []);

/**
 * What the main thread wrote after its last tool result: the reply, and the line after it when a Stop hook sent the turn
 * on for a correction (ARC-09-C254). The stream's `result` row is only the last message, so it is the correction alone then.
 * Text written before a tool call is narration, and a sub-agent's text (`parent_tool_use_id`) is not the main thread's.
 */
function finalText(evs) {
  const main = evs.filter((e) => !e?.parent_tool_use_id);
  const last = main.findLastIndex((e) => e?.type === 'user' && Array.isArray(e.message?.content)
    && e.message.content.some((c) => c?.type === 'tool_result'));
  return main.slice(last + 1).flatMap(blocks).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
}

/** `markdown/...` for a path that names a corpus page by any of its spellings, else null. */
function corpusRelative(p) {
  const norm = String(p ?? '').replace(/\\/g, '/');
  return norm.match(/(?:^|\/)(?:vendor\/)?ServiceNowDocs\/(markdown\/.+)$/)?.[1] ?? null;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

export function reportTurn(streamText, { repoRoot, corpusRoot = join(repoRoot, 'vendor', 'ServiceNowDocs'), prompt = '' } = {}) {
  const evs = events(streamText);
  const skills = [];
  const reads = new Set();
  let searches = 0;
  const addSkill = (name, how) => { if (name && !skills.some((s) => s.name === name && s.how === how)) skills.push({ name, how }); };
  for (const e of evs) {
    for (const b of blocks(e)) {
      if (b?.type !== 'tool_use') continue;
      const input = b.input ?? {};
      if (b.name === 'Skill') addSkill(input.skill ?? input.command ?? input.name, 'Skill');
      if (b.name === 'Read') {
        const file = String(input.file_path ?? '').replace(/\\/g, '/');
        const skill = file.match(/(?:^|\/)\.claude\/skills\/([^/]+)\/SKILL\.md$/)?.[1];
        if (skill) addSkill(skill, 'Read');
        const page = corpusRelative(file);
        if (page) reads.add(page);
      }
      if ((b.name === 'Grep' || b.name === 'Glob') && JSON.stringify(input).includes('ServiceNowDocs')) searches += 1;
    }
  }

  // A skill the CLI ran from the prompt's slash command: no tool call in the stream shows it, the prompt does. Only a command
  // that starts the prompt, whole, and names a skill this checkout has.
  const slash = /^\/([a-z0-9][a-z0-9-]*)(?:\s|$)/.exec(String(prompt).trim());
  if (slash && existsSync(join(repoRoot, '.claude', 'skills', slash[1], 'SKILL.md'))) addSkill(slash[1], 'slash command');

  // The answer: what the model wrote after its last tool result when there is a result event (the result row alone is the last
  // message, which is a correction line when a Stop hook asked for one), else all that the assistant said.
  const result = [...evs].reverse().find((e) => e?.type === 'result' && typeof e.result === 'string');
  const answer = result ? (finalText(evs) || result.result)
    : evs.flatMap(blocks).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');

  // The finder's output: the tool result of a Bash call that ran finding.mjs and printed the review list (the --next-name run prints a path
  // and none, so it is no copy). Whether the reply holds it as printed, and whether inside a code fence (an odd number of fence lines before it).
  const finderIds = new Set();
  let finderOutput = null;
  for (const e of evs) {
    for (const b of blocks(e)) {
      const command = String(b?.input?.command ?? '');
      if (b?.type === 'tool_use' && b.name === 'Bash' && /lib\/finding\.mjs/.test(command)) finderIds.add(b.id);
    }
    if (e?.type === 'user' && Array.isArray(e.message?.content)) {
      for (const c of e.message.content) {
        if (c?.type !== 'tool_result' || !finderIds.has(c.tool_use_id)) continue;
        const out = typeof c.content === 'string' ? c.content : (Array.isArray(c.content) ? c.content.map((x) => x?.text ?? '').join('\n') : '');
        if (/Read before sending:/.test(out)) finderOutput = out.trim();
      }
    }
  }
  let findingCopy = null;
  if (finderOutput) {
    const at = answer.indexOf(finderOutput);
    findingCopy = { verbatim: at >= 0, fenced: at >= 0 && (answer.slice(0, at).match(/^[ \t]*```/gm) ?? []).length % 2 === 1 };
  }

  let repoNames = null;
  const repoBase = () => {
    if (!repoNames) {
      try {
        repoNames = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 26 })
          .split('\0').filter(Boolean).map((f) => basename(f)));
      } catch { repoNames = new Set(); }
    }
    return repoNames;
  };
  let byBase = null;
  const corpusByBase = () => {
    if (!byBase) {
      byBase = new Map();
      const md = join(corpusRoot, 'markdown');
      if (existsSync(md)) {
        for (const f of walk(md)) {
          const rel = `markdown/${f.slice(md.length + 1).replace(/\\/g, '/')}`;
          const b = basename(f);
          byBase.set(b, [...(byBase.get(b) ?? []), rel]);
        }
      }
    }
    return byBase;
  };

  const citations = [];
  const seen = new Set();
  for (const m of String(answer).matchAll(MD)) {
    const cited = m[0].replace(/^\.\//, '');
    if (seen.has(cited)) continue;
    seen.add(cited);
    const rel = corpusRelative(cited) ?? (cited.startsWith('markdown/') ? cited : null);
    if (rel) {
      citations.push({ cited, status: existsSync(join(corpusRoot, rel)) ? 'ok' : 'missing', resolved: rel });
    } else if (cited.includes('/')) {
      continue;                                           // a path in the repository, or elsewhere: not a corpus citation
    } else if (REPO_NAMES.has(cited) || repoBase().has(cited)) {
      continue;
    } else {
      const hits = corpusByBase().get(cited) ?? [];
      if (hits.length === 1) citations.push({ cited, status: 'bare', resolved: hits[0] });
      else if (hits.length > 1) citations.push({ cited, status: 'ambiguous', resolved: hits.length });
      else citations.push({ cited, status: 'missing', resolved: null });
    }
  }
  return { skills, corpusReads: [...reads], corpusSearches: searches, citations, findingCopy };
}

export function formatReport(r) {
  const n = (s) => r.citations.filter((c) => c.status === s).length;
  const head = `skills: ${r.skills.length ? r.skills.map((s) => `${s.name} (${s.how})`).join(', ') : 'none'}`
    + ` · corpus pages read: ${r.corpusReads.length}${r.corpusSearches ? ` (+${r.corpusSearches} searches)` : ''}`
    + ` · citations: ${r.citations.length}`
    + (r.citations.length ? ` (ok ${n('ok')} · bare ${n('bare')} · ambiguous ${n('ambiguous')} · missing ${n('missing')})` : '')
    + (r.findingCopy ? ` · finding copy: ${!r.findingCopy.verbatim ? 'NOT in the reply as printed (only in the tool result, or changed)'
      : r.findingCopy.fenced ? 'in the reply, but in a code fence' : 'in the reply, verbatim, unfenced'}` : '');
  const detail = r.citations.filter((c) => c.status !== 'ok').map((c) => {
    if (c.status === 'missing') return `  MISSING ${c.cited}`;
    if (c.status === 'bare') return `  BARE ${c.cited} -> ${c.resolved}`;
    return `  AMBIGUOUS ${c.cited} (${c.resolved} pages)`;
  });
  return [head, ...detail].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [stream, repoRoot, promptFile] = process.argv.slice(2);
  if (!stream || !repoRoot) { console.error('usage: turn-report.mjs <stream.jsonl> <checkout> [<prompt.txt>]'); process.exit(2); }
  const prompt = promptFile && existsSync(promptFile) ? readFileSync(promptFile, 'utf8') : '';
  console.log(formatReport(reportTurn(readFileSync(stream, 'utf8'), { repoRoot, prompt })));
}
