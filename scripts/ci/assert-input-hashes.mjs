#!/usr/bin/env node
/**
 * The bootstrap input hashes are the same on every OS, for the same commit.
 *
 * ARC-09-S05, AC 4. The table hashes files as RAW BYTES with no line-ending normalisation, which
 * is what makes a hash comparable across machines — and what makes it fragile if a checkout ever
 * differs from the commit. On Windows, a file without `eol=lf` in `.gitattributes` arrives CRLF,
 * hashes differently, and every resume on that platform silently decides something different from
 * the other two. Nobody notices until a step is skipped that should have run.
 *
 * Rather than ship the three cells' answers somewhere to be compared — which needs a collector job,
 * and therefore a new required context on `main` — each cell proves the stronger thing locally:
 * **this checkout's bytes are the commit's bytes**. `git cat-file blob` reads the object database,
 * which is identical on every machine, with no smudge filter and no eol conversion. If the working
 * tree matches it here and on the other two runners, the three agree with each other — and they
 * agree for a reason a reader can check, rather than because three logs happened to match.
 *
 * The step hashes themselves are printed for the job summary. Two of their inputs are expected to
 * differ between cells and are named as such: the node major (B04, by design — a different major
 * is a different install) and nothing else.
 *
 * Usage: `node scripts/ci/assert-input-hashes.mjs` · exit 0 identical · 1 a difference · 2 usage.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INPUTS, STEP_IDS, hashFor } from '../../tools/snowarch/lib/inputs.mjs';
import { loadConfig } from '../../tools/snowarch/lib/config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const problems = [];
const rows = [];

/** Every file the table names, with the config's placeholder resolved to the real path. */
const config = loadConfig(root);
const files = [...new Set(STEP_IDS.flatMap((id) => INPUTS[id].inputs
  .filter((i) => i.kind === 'file')
  .map((i) => (i.ref.startsWith('<') ? config.docs.areasFile : i.ref))))];

if (files.length < 4) {
  writeSync(2, 'assert-input-hashes: the table named no files — nothing to compare\n');
  process.exit(2);
}

for (const path of files) {
  const onDisk = readFileSync(resolve(root, path));
  // `-p` prints the blob raw: no eol conversion, no clean/smudge filter, the committed bytes.
  const committed = execFileSync('git', ['cat-file', '-p', `HEAD:${path}`],
    { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  const a = sha256(onDisk);
  const b = sha256(committed);
  rows.push(`| \`${path}\` | \`${a.slice(0, 12)}\` | ${a === b ? 'same as commit' : '**DIFFERS**'} |`);
  if (a !== b) {
    const crlf = onDisk.includes('\r\n') && !committed.includes('\r\n');
    problems.push(`${path}: the checkout hashes ${a.slice(0, 12)}, the commit ${b.slice(0, 12)}`
      + (crlf ? ' — the checkout has CRLF line endings: add it to .gitattributes with eol=lf'
        : ' — the working tree differs from HEAD (uncommitted change, or a filter)'));
  }
}

// The step hashes, for the summary. A cell that disagreed with another on any row but B04 would
// have already failed above; printing them makes a disagreement readable rather than deduced.
const ctx = {
  root, env: process.env, config, mode: 'design-only', docs: 'sparse', instanceFile: null,
  node: { present: true, version: process.versions.node, major: Number(process.versions.node.split('.')[0]) },
  state: { hooksDisabledByBootstrap: false, registration: 'project' },
};
const steps = STEP_IDS.map((id) => `| \`${id}\` | \`${hashFor(id, ctx).replace('sha256:', '').slice(0, 16)}\` |`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    [`### Input hashes — ${process.platform}, node ${process.versions.node}`, '',
      '| File | sha256 (12) | vs HEAD |', '|---|---|---|', ...rows, '',
      '| Step | hash (16) |', '|---|---|', ...steps, '',
      '_B04 includes the node major and is expected to differ between node cells; every other row '
      + 'must match across all three._', ''].join('\n'));
}

writeSync(1, `assert-input-hashes: ${files.length} file(s) checked against HEAD\n`);
for (const line of steps) writeSync(1, `${line}\n`);
if (problems.length) {
  for (const p of problems) writeSync(2, `assert-input-hashes: ${p}\n`);
  process.exit(1);
}
writeSync(1, 'assert-input-hashes: the checkout matches the commit byte for byte\n');
