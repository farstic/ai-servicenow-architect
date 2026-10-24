#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C231 — the PostToolUse citation check: a file the Architect writes under `clients/` has its citations
// resolved after the write, and a dead path goes back to the model before the file is presented. An Envelope is
// written at Phase 1 Step 5, before any Phase 2 exists, so the check rides on the write itself.
//
// THREE PROMISES, after session-start.mjs's.
//
//   IT NEVER FAILS A TOOL CALL ON ITS OWN ACCOUNT. Any exception exits 0 with nothing on stderr. Only a dead
//   citation exits 2: Claude Code shows a PostToolUse hook's stderr to the model then, after the tool has run.
//
//   IT IS FAST. Outside `clients/` it exits before importing anything else; the resolver is imported only for a
//   file it checks (about 30 ms either way, measured, most of it Node's own start).
//
//   IT RESOLVES AS THE GATE DOES. The resolver is the shipped citation gate's, `tools/snowarch/lib/docs/verify.mjs`,
//   given the written file as its one root: no second reading of what a citation is, and none of what makes one dead.
//
// The root comes from this file's own location, never from `cwd` and never from `CLAUDE_PROJECT_DIR`, for
// session-start.mjs's reason: inside a session that variable is the SESSION's project.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** What a dead citation asks of the model, said after the paths. */
export const CORRECT = 'Correct each path before presenting the file.';

/** The written file's path below `root`, `/`-separated, when it is under `clients/`; otherwise `null`. */
export function clientsPath(root, filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  const rel = relative(root, isAbsolute(filePath) ? filePath : resolve(root, filePath)).split(sep).join('/');
  return rel.startsWith('clients/') ? rel : null;
}

/**
 * What the hook says for one PostToolUse input: `{ code, stderr }`. Exit 2 with the dead paths, each with its line,
 * or 0 and nothing: outside `clients/`, with no corpus to resolve against (the doctor reports that), or with every
 * path alive.
 */
export async function report(input, { root = ROOT } = {}) {
  const rel = clientsPath(root, input?.tool_input?.file_path);
  if (!rel) return { code: 0, stderr: '' };
  const { verifyCitations } = await import('../lib/docs/verify.mjs');
  const r = verifyCitations({ root, roots: [rel] });
  if (r.status !== 'fail') return { code: 0, stderr: '' };
  const n = r.dead.length;
  const paths = r.dead.map((d) => `${d.path} (line ${d.line})`).join('; ');
  return { code: 2, stderr: `${n} dead citation${n === 1 ? '' : 's'} in ${rel}: ${paths}. ${CORRECT}\n` };
}

const samePath = (a, b) => {
  const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
  return real(a) === real(b);
};
const isMain = process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  let out = { code: 0, stderr: '' };
  try {
    out = await report(JSON.parse(readFileSync(0, 'utf8')));
  } catch {
    // Its own failure is never the model's business: no finding, and nothing on stderr.
    out = { code: 0, stderr: '' };
  }
  if (out.stderr) process.stderr.write(out.stderr);
  process.exitCode = out.code;
}
