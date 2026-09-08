#!/usr/bin/env node
// ARC-02-S04 — the T-01 regression harness. Throwaway with the rest of scripts/maint/ (S01).
//
// Criterion 4 asks a narrow question: does a dispatched `developer` sub-agent return an artefact with
// the SAME STRUCTURE after `model: inherit` + `skills:` preload as before. So this dispatches that one
// sub-agent with the T-01 prompt rather than driving the whole interactive routing chain, which needs
// approval turns a headless run cannot give.
//
//   node scripts/maint/t01-regression.mjs <label> [git-ref]
//
// The optional ref lets the same harness re-run an OLDER tree, which is how the run-to-run noise floor
// is measured: two captures of the SAME tree bound how much of a before/after difference is signal.
//
// It exports the repo at HEAD into a clean scratch project (so `.claude/` and `CLAUDE.md` are exactly
// what is committed, and nothing in the working tree leaks in), runs one headless session, and writes:
//   <out>/<label>.structure.txt   ordered H2/H3 headings + block kinds — what the diff compares
//   <out>/<label>.stream.jsonl    the raw stream, for the sub-agent tool-use evidence
//   <out>/<label>.artefact.md     the returned text
//
// Scratch location is checked for ancestor `.claude/skills` first (S-13 addendum): a polluted parent
// would load a second roster into the session under test.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanScratchParent } from '../ci/skill-listing-check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const label = process.argv[2];
const ref = process.argv[3] || 'HEAD';
if (!label) { console.error('usage: t01-regression.mjs <label>'); process.exit(2); }
const outDir = process.env.T01_OUT || join(root, '.t01');
mkdirSync(outDir, { recursive: true });

// The T-01 prompt, verbatim from VALIDATION-TESTS.md.
const T01 = 'Implement a Script Include that calculates SLA breach risk for incidents based on '
  + 'assignment group historical data.';

// Dispatch the one sub-agent under test. Naming it explicitly is what the story's criterion 4 scopes:
// the orchestration chain is T-01's own subject and is covered by the interactive validation runs.
const PROMPT = `Use the Agent tool to dispatch the \`developer\` sub-agent exactly once, with this task:

${T01}

Assume the ITSM gateway has already produced its Constraint Envelope with Verdict A: baseline tables
\`incident\`, \`task_sla\`, \`contract_sla\`, \`sys_user_group\`; no custom objects approved.

Return the sub-agent's artefact verbatim as your final message. Do not review it, do not summarise it,
and do not add commentary of your own.`;

const { parent } = cleanScratchParent();
if (!parent) { console.error('t01: no uncontaminated scratch parent (S-13 addendum)'); process.exit(2); }
const dir = mkdtempSync(join(parent, `snowarch-t01-${label}-`));

try {
  // git archive HEAD: the committed tree only — no working-tree edits, no .git, no node_modules.
  execFileSync('bash', ['-c', `git -C '${root}' archive ${ref} | tar -x -C '${dir}'`], { stdio: 'inherit' });
  const head = execFileSync('git', ['-C', root, 'rev-parse', ref], { encoding: 'utf8' }).trim();

  const stream = join(outDir, `${label}.stream.jsonl`);
  const r = spawnSync('claude', [
    '-p', PROMPT,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'dontAsk',       // no interactive prompts; NOT bypassPermissions
    '--disallowed-tools', 'Bash',         // the harness never needs a shell inside the session
  ], { cwd: dir, encoding: 'utf8', input: '', maxBuffer: 256 * 1024 * 1024 });
  writeFileSync(stream, r.stdout ?? '');
  if (r.status !== 0) console.error(`t01: claude exited ${r.status}\n${(r.stderr ?? '').slice(0, 2000)}`);

  // Final assistant text = the artefact.
  const events = (r.stdout ?? '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const result = events.find((e) => e.type === 'result');
  const artefact = result?.result ?? '';
  writeFileSync(join(outDir, `${label}.artefact.md`), artefact);

  // Structure only: ordered headings and block kinds. Never prose — prose is expected to vary.
  const lines = [];
  lines.push(`# T-01 structure — ${label}`);
  lines.push(`# tree: ${head}`);
  lines.push('');
  let fence = null;
  for (const line of artefact.split('\n')) {
    const f = line.match(/^```(\w*)/);
    if (f) { if (fence === null) { fence = f[1] || 'plain'; lines.push(`BLOCK ${fence}`); } else fence = null; continue; }
    if (fence !== null) continue;
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) lines.push(`${'H'}${h[1].length} ${h[2].trim()}`);
  }
  // THE COMPARISON THAT DISCRIMINATES.
  //
  // Literal heading equality does not: two captures of the SAME unchanged tree differ by whole H2
  // sections, because heading wording is model output and varies run to run. What does NOT vary — and
  // what "the same artefact structure" actually means — is the Output contract in the agent body:
  // artefacts with a path and a type, a spec compliance statement, decisions made, and the verbatim
  // §6.2 manifest proposal. Those are asserted; the headings above are recorded for the reader.
  const CONTRACT = [
    ['code-block-js', /```(javascript|js)\b/i],
    ['file-path', /script_includes\/|\.js`|Suggested file path|File path/i],
    ['artefact-type', /Script Include/i],
    ['spec-compliance', /spec compliance/i],
    ['decisions-made', /decisions? made/i],
    ['manifest-6.2', /§\s*6\.2[^\n]*manifest/i],
    ['manifest-verbatim', /Code artefact produced\. Proposing a Code Reviewer pass \(style, performance, security, best-practice\) before final delivery/i],
  ];
  lines.push('');
  for (const [k, re] of CONTRACT) lines.push(`CONTRACT ${k} ${re.test(artefact) ? 'present' : 'ABSENT'}`);
  writeFileSync(join(outDir, `${label}.structure.txt`), `${lines.join('\n')}\n`);

  // Sub-agent tool evidence: what the dispatched agent read.
  const reads = [];
  let inAgent = false;
  for (const e of events) {
    const content = e?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task')) inAgent = true;
      if (c.type === 'tool_use' && c.name === 'Read') reads.push(`${inAgent ? 'sub-agent' : 'main'}: ${c.input?.file_path ?? ''}`);
    }
  }
  writeFileSync(join(outDir, `${label}.reads.txt`), `${reads.join('\n')}\n`);

  console.log(`t01 ${label}: tree ${head.slice(0, 7)}, artefact ${artefact.length} chars, ${reads.length} Read call(s)`);
  console.log(readFileSync(join(outDir, `${label}.structure.txt`), 'utf8'));
} finally { rmSync(dir, { recursive: true, force: true }); }
