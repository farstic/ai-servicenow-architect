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
//   node scripts/validation/turn-report.mjs <stream.jsonl> <checkout>
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

export function reportTurn(streamText, { repoRoot, corpusRoot = join(repoRoot, 'vendor', 'ServiceNowDocs') } = {}) {
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

  // The answer: the result event when there is one, else what the assistant said.
  const result = [...evs].reverse().find((e) => e?.type === 'result' && typeof e.result === 'string');
  const answer = result ? result.result
    : evs.flatMap(blocks).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');

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
  return { skills, corpusReads: [...reads], corpusSearches: searches, citations };
}

export function formatReport(r) {
  const n = (s) => r.citations.filter((c) => c.status === s).length;
  const head = `skills: ${r.skills.length ? r.skills.map((s) => `${s.name} (${s.how})`).join(', ') : 'none'}`
    + ` · corpus pages read: ${r.corpusReads.length}${r.corpusSearches ? ` (+${r.corpusSearches} searches)` : ''}`
    + ` · citations: ${r.citations.length}`
    + (r.citations.length ? ` (ok ${n('ok')} · bare ${n('bare')} · ambiguous ${n('ambiguous')} · missing ${n('missing')})` : '');
  const detail = r.citations.filter((c) => c.status !== 'ok').map((c) => {
    if (c.status === 'missing') return `  MISSING ${c.cited}`;
    if (c.status === 'bare') return `  BARE ${c.cited} -> ${c.resolved}`;
    return `  AMBIGUOUS ${c.cited} (${c.resolved} pages)`;
  });
  return [head, ...detail].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [stream, repoRoot] = process.argv.slice(2);
  if (!stream || !repoRoot) { console.error('usage: turn-report.mjs <stream.jsonl> <checkout>'); process.exit(2); }
  console.log(formatReport(reportTurn(readFileSync(stream, 'utf8'), { repoRoot })));
}
