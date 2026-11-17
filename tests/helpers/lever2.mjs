// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the fixtures the Stop hook's cases share: an install with a few corpus pages on disk, a session file written from rows, and the
 * hook run on it as the Stop event does. Used by tests/hook/stop-lever2.test.mjs and tests/hook/stop-lever2-review.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { report } from '../../tools/snowarch/hooks/stop-citations.mjs';

export const PIN = 'd'.repeat(40);
export const PAGE = {
  alpha: 'markdown/it-service-management/c_Alpha.md',
  beta: 'markdown/it-service-management/c_Beta.md',
  gamma: 'markdown/customer-service-management/c_Gamma.md',
  delta: 'markdown/hr-service-delivery/c_Delta.md',
};
// Built, not spelled whole: engine lint L02 holds every literal `mcp__<server>__` under tests/ to the product's own server key.
export const CTX_FILE = ['mcp', 'context-mode', 'ctx_execute_file'].join('__');
export const CTX_BATCH = ['mcp', 'context-mode', 'ctx_batch_execute'].join('__');

// ---- an install, a session and its rows ---------------------------------------------------------------------------------------
/** A checkout with the docs pin, a roster and the pages on disk (so no path is a dead one: C254 has nothing to say). */
export function install(t) {
  const root = tempDir('lever2-', t);
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({ docs: { pin: PIN } })}\n`);
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(root, '.claude', 'agents', 'story-writer.md'), '# story-writer\n');
  mkdirSync(join(root, '.claude', 'skills', 'csm-specialist'), { recursive: true });
  writeFileSync(join(root, 'CLAUDE.md'), '# CLAUDE\n');
  for (const rel of Object.values(PAGE)) {
    mkdirSync(dirname(join(root, 'vendor', 'ServiceNowDocs', rel)), { recursive: true });
    writeFileSync(join(root, 'vendor', 'ServiceNowDocs', rel), 'The sn\\_example table.\n');
  }
  const corpus = join(root, 'vendor', 'ServiceNowDocs');
  // Forward slashes on every platform: a Bash command reads a back-slash as an escape, and a Read or a PowerShell command takes either.
  const fwd = (p) => p.replaceAll('\\', '/');
  return { root, corpus: fwd(corpus), abs: (rel) => fwd(join(corpus, rel)), folder: (rel) => fwd(dirname(join(corpus, rel))) };
}
export const A = (blocks, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', content: blocks }, ...extra });
export const U = (content, extra = {}) => ({ type: 'user', message: { role: 'user', content }, ...extra });
export const use = (id, name, input, extra = {}) => A([{ type: 'tool_use', id, name, input }], extra);
export const res = (id, content, extra = {}) => U([{ type: 'tool_result', tool_use_id: id, content, ...(extra.is_error ? { is_error: true } : {}) }]);
// A shell call that ran and failed says "Exit code N" and holds the lines it printed before it failed (a page counts only if the result holds a line of it: tests/lever2-replay.test.mjs).
// A search counts a page only if its result holds a line of it too (B8: tests/lever2-search-evidence.test.mjs), so a call that succeeded prints the fixture page's line as well.
const PRINTED = '1\tThe sn\\_example table.';
export const bash = (id, command, { error = false, extra = {} } = {}) => [use(id, 'Bash', { command, description: 'x' }, extra), res(id, error ? `Exit code 1\n${PRINTED}\ncat: missing.md: No such file or directory` : PRINTED, { is_error: error })];
export const powershell = (id, command, extra = {}, { error = false } = {}) => [use(id, 'PowerShell', { command, description: 'x' }, extra), res(id, error ? `Exit code 1\n${PRINTED}\nGet-Content : Cannot find path` : PRINTED, { is_error: error })];
export const readPage = (id, file, extra = {}) => [use(id, 'Read', { file_path: file }, extra), res(id, '1\tThe sn\\_example table.')];
export const compaction = () => [{ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted' },
  U('This session is being continued from a previous conversation that ran out of context. Summary: ...', { isCompactSummary: true })];

/** Writes the rows as the session file (and the sub-agents' as files beside it) and runs the hook as the Stop event does. */
export async function stop(t, { rows, side = {}, message, prompt = 'how does a case escalate?', input = {}, cwd = true, seams = {}, shipped = false }) {
  const { root } = t.env;
  const dir = join(root, 'sessions');
  t.env.n = (t.env.n ?? 0) + 1;
  const session = `s${t.env.n}`;                 // one session per call: the sub-agents' files of an earlier call are not this one's
  mkdirSync(join(dir, session, 'subagents'), { recursive: true });
  const stamp = (r) => (cwd && r.type === 'assistant' && r.cwd === undefined ? { ...r, cwd: root } : r);
  const body = [U(prompt), ...rows].map(stamp).map((r) => JSON.stringify(r)).join('\n');
  writeFileSync(join(dir, `${session}.jsonl`), `${body}\n`);
  // A sub-agent's file is its rows, or a string written as it is (a file with a line that does not parse).
  for (const [name, subRows] of Object.entries(side)) writeFileSync(join(dir, session, 'subagents', `agent-${name}.jsonl`), typeof subRows === 'string' ? subRows : `${subRows.map((r) => JSON.stringify({ isSidechain: true, ...r })).join('\n')}\n`);
  const stdin = { hook_event_name: 'Stop', last_assistant_message: message, transcript_path: join(dir, `${session}.jsonl`), stop_hook_active: false, ...input };
  const out = await report(stdin, { root, seams: shipped ? seams : { ...seams, options: { blocking: ['citedUnread'], ...seams.options } } });
  return out.stdout ? JSON.parse(out.stdout) : null;
}
/** A test body that has an install: `t.env` is it. */
export const withInstall = (name, fn) => test(name, async (t) => { t.env = install(t); await fn(t, t.env); });
export const cite = (page) => `The rule is in (citation: ${page}).`;
export const asked = (d, ...pages) => {
  assert.ok(d && d.decision === 'block', `no ask: ${JSON.stringify(d)}`);
  for (const p of pages) assert.ok(d.reason.includes(p), `the ask does not name ${p}: ${d.reason}`);
};
export const silent = (d, why) => assert.equal(d, null, `${why}: the hook asked: ${d && d.reason}`);
