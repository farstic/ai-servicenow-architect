// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * scripts/render-pdf.sh — what it does with LibreOffice (ARC-09-C301).
 *
 * The cases of the first group pin the script as it was before it learned to look in a Mac user's own Applications folder: where it finds
 * the converter on PATH, how it calls it, what it prints, and the sentence and the exit code when there is none. They pass on both sides of
 * that change, which is what makes it safe to make.
 *
 * NO CASE HERE STARTS A REAL LIBREOFFICE, for the reason tests/render-drawio.test.mjs gives: a converter is installed on machines that run
 * this suite, and a case that let the script reach it would start it. So the converter a case runs is a stub that heads PATH, and a case
 * that must see "not found" is skipped on a machine that has one of the places the script falls back on.
 * The stubs are shell scripts, so the cases run on macOS and Linux; the script is for those two (Windows has render-pdf-pages.ps1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'render-pdf.sh');
const skip = process.platform === 'win32' ? 'the stubs are shell scripts; render-pdf.sh is for macOS and Linux (Windows has render-pdf-pages.ps1)' : false;

/** Where a LibreOffice of THIS machine would be found by the script: on the PATH a case gives it, or in the places it falls back on. */
const SOFFICE_RELATIVE = 'Applications/LibreOffice.app/Contents/MacOS/soffice';
const hostPlaces = ['/usr/bin/soffice', '/bin/soffice', `/${SOFFICE_RELATIVE}`, ...(process.env.HOME ? [join(process.env.HOME, SOFFICE_RELATIVE)] : [])];
const onHost = hostPlaces.find((p) => existsSync(p));
const hostSkip = skip || (onHost && `LibreOffice is on this machine (${onHost}), which a "not found" case would find and start`);

/** The shell is the system's, not whichever `bash` a PATH names first. */
const BASH = '/bin/bash';

/** A converter stand-in: records how it was called, and writes <outdir>/<name of the source>.pdf, as `soffice --convert-to pdf` does. */
const SOFFICE_STUB = ['#!/bin/sh',
  'echo "$0 $*" >> "$STUB_LOG"',
  'outdir=""; src=""',
  'while [ $# -gt 0 ]; do',
  '  case "$1" in --outdir) outdir="$2"; shift ;; *) src="$1" ;; esac',
  '  shift',
  'done',
  'name=$(basename "$src")',
  'printf \'%%PDF-stub\\n\' > "$outdir/${name%.*}.pdf"',
  'exit 0', ''].join('\n');

/** A scratch world: a bin folder that heads PATH, a folder holding one document, an output folder, and the log the stub writes. */
function world(t) {
  const base = tempDir('render-pdf-', t);
  const w = { base, bin: join(base, 'bin'), docs: join(base, 'docs'), out: join(base, 'out'), log: join(base, 'stub.log') };
  for (const d of [w.bin, w.docs]) mkdirSync(d, { recursive: true });
  writeFileSync(join(w.docs, 'Design.docx'), 'not a real document');
  writeFileSync(w.log, '');
  return w;
}
const executable = (path, body) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); chmodSync(path, 0o755); return path; };
const sofficeAt = (path) => executable(path, SOFFICE_STUB);
/** HOME is the real one when there is one and is never made up: a made-up one is the thing that must never reach a real app. */
const environment = (w, env = {}) => ({ PATH: `${w.bin}:/usr/bin:/bin`, STUB_LOG: w.log, ...(process.env.HOME ? { HOME: process.env.HOME } : {}), ...env });
const calls = (w) => readFileSync(w.log, 'utf8').trim().split('\n').filter(Boolean);
const run = (w, args, env = {}) => spawnSync(BASH, [script, ...args], { encoding: 'utf8', env: environment(w, env) });

test('ARC-09-C301 — a conversion calls the converter on PATH the way it always did, and says where the PDF is', { skip }, (t) => {
  const w = world(t);
  const stub = sofficeAt(join(w.bin, 'soffice'));
  const doc = join(w.docs, 'Design.docx');
  const r = run(w, [doc, w.out]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, `OK: wrote ${join(w.out, 'Design.pdf')} (${'%PDF-stub\n'.length} bytes)\n`);
  const made = calls(w);
  assert.equal(made.length, 1, made.join('\n'));
  // The call: headless, a profile of its own so that a LibreOffice already running does not take the job, then the conversion.
  const call = made[0].match(/^(\S+) --headless -env:UserInstallation=file:\/\/(\S+) --convert-to pdf --outdir (\S+) (\S+)$/);
  assert.ok(call, made[0]);
  assert.deepEqual([call[1], call[3], call[4]], [stub, w.out, doc]);
  // The profile is a folder the script made for this one call and took away again.
  assert.equal(existsSync(call[2]), false, `the profile ${call[2]} was left behind`);
  assert.ok(existsSync(join(w.out, 'Design.pdf')));
});

test('ARC-09-C301 — with no output folder given the PDF is written beside the document', { skip }, (t) => {
  const w = world(t);
  sofficeAt(join(w.bin, 'soffice'));
  const r = run(w, [join(w.docs, 'Design.docx')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, `OK: wrote ${join(w.docs, 'Design.pdf')} (${'%PDF-stub\n'.length} bytes)\n`);
  assert.ok(existsSync(join(w.docs, 'Design.pdf')));
});

test('ARC-09-C301 — no document given is a usage error, and the converter is not reached', { skip }, (t) => {
  const w = world(t);
  sofficeAt(join(w.bin, 'soffice'));
  const r = run(w, []);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: render-pdf\.sh <file\.docx\|file\.md> \[outdir\]/);
  assert.deepEqual(calls(w), []);
});

test('ARC-09-C301 — with no LibreOffice the script says so and exits 3, without making the output folder', { skip: hostSkip }, (t) => {
  const w = world(t);
  const r = run(w, [join(w.docs, 'Design.docx'), w.out]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  const lines = r.stderr.split('\n').filter((l) => l.startsWith('ERROR: '));
  assert.deepEqual(lines, ['ERROR: LibreOffice (soffice) not found. Install it (brew install --cask libreoffice) to render PDFs on Mac.']);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(w.out), false, 'the output folder was made before the converter was found');
  assert.deepEqual(calls(w), []);
});
