#!/usr/bin/env node
/**
 * Nothing published carries a credential.
 *
 * ARC-09-S03, criterion 2. The release assets are doctor reports, and a doctor report is the single
 * most-pasted artefact this product makes — except that these are not pasted into a support thread,
 * they are attached to a public Release where they stay. The engine redacts on the way out
 * (ARC-08-S01, one chokepoint in the runner); this reads the finished files, on the way in to
 * somewhere permanent, because the cost of being wrong here does not decay.
 *
 * Also asserts what each report must SAY, since the files are being read anyway: schema 1,
 * design-only, and no FAIL. A release whose own doctor reports a failure is a release that should
 * not have a Release.
 *
 * Usage: node scripts/ci/assert-assets.mjs <file…>
 * Exit 0 · 1 something is wrong with an asset · 2 cannot run.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  process.stderr.write('assert-assets: usage: node scripts/ci/assert-assets.mjs <file…>\n');
  process.exit(2);
}

/**
 * The shapes a credential takes in this product's own output.
 *
 * An e-mail address is the one that matters: the store's `username` is usually one, and the masked
 * form is `s***@host`. `@` after at least one character that is not `*` is the tell. The others are
 * the env var names the old installers left in `~/.claude.json`.
 */
const FORBIDDEN = [
  [/[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'an unmasked e-mail address'],
  [/"password"\s*:\s*"(?!\s*")[^"]{3,}"/, 'a password field with a value'],
  [/\b(SERVICENOW_PASSWORD|SERVICENOW_CLIENT_SECRET|SNOW_PASSWORD)\b\s*[:=]\s*"?[^"\s,}]{3,}/, 'a credential variable with a value'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
];

const problems = [];

for (const file of files) {
  const path = resolve(file);
  if (!existsSync(path)) { problems.push(`${file}: not there`); continue; }
  const text = readFileSync(path, 'utf8');

  for (const [pattern, what] of FORBIDDEN) {
    const hit = pattern.exec(text);
    // The MATCH is never printed — printing the secret to prove it was found would publish it in
    // the job log, which is the same mistake one layer down.
    if (hit) problems.push(`${file}: ${what}, at offset ${hit.index}`);
  }

  if (!basename(file).startsWith('doctor-')) continue;
  let report;
  try { report = JSON.parse(text); } catch (e) { problems.push(`${file}: not JSON — ${e.message}`); continue; }
  if (report.schema !== 1) problems.push(`${file}: schema ${report.schema}, expected 1`);
  if (report.mode !== 'design-only') problems.push(`${file}: mode "${report.mode}", expected design-only`);
  const failing = (report.checks ?? []).filter((c) => c.status === 'fail').map((c) => c.id);
  if (failing.length) problems.push(`${file}: ${failing.length} FAIL (${failing.join(', ')})`);
}

if (problems.length) {
  process.stderr.write('assert-assets: these must not be published\n');
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.exit(1);
}
process.stdout.write(`assert-assets: ${files.length} asset(s) clean\n`);
