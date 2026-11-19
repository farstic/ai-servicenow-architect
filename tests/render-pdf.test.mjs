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
 *
 * The second group is the row itself. A Mac user without administrator rights copies LibreOffice into ~/Applications, and the script looked
 * only on PATH and in /Applications. It now looks in ~/Applications as well, LAST, so that a Mac which found LibreOffice before keeps finding
 * the same one. The lookup is one function, find_soffice, that only looks, as find_drawio is in scripts/render-drawio.sh, and the file stops
 * after defining it when it is sourced: a case can then ask where the script would look without starting anything. A case may source the
 * script only once the file says it stops there, because a script that did not would run its main part, and on a Mac with LibreOffice
 * installed that is the real one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { capabilityPacks, SOFFICE_CANDIDATES } from '../tools/snowarch/lib/doctor/checks/engine-prereqs.mjs';

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

// ARC-09-C301 — the lookup, and the user's own Applications folder.
const HOME_SOFFICE = 'Applications/LibreOffice.app/Contents/MacOS/soffice';
const SENTENCE = 'ERROR: LibreOffice (soffice) not found. Install it (brew install --cask libreoffice) to render PDFs on Mac.';
/** The line that makes a sourced script stop after its functions: render-drawio.sh has the same one. */
const STOPS_WHEN_SOURCED = '[[ "${BASH_SOURCE[0]:-}" != "$0" ]] && return 0';
const errorLines = (stderr) => stderr.split('\n').filter((l) => l.startsWith('ERROR: '));

/**
 * Source the script and run `snippet` after it: only once the file says it stops after defining its functions, so that nothing is started.
 * The snippet runs under the options the main part of the script runs under, because a sourced file sets none: an unbound HOME stops the
 * lookup only under `set -u`, and a lookup that failed would end it only under `set -e`.
 */
function sourced(w, snippet, env = {}) {
  assert.ok(readFileSync(script, 'utf8').includes(STOPS_WHEN_SOURCED), 'the script does not stop when it is sourced, so a case cannot ask it where it would look without running it');
  return spawnSync(BASH, ['-c', `source "$1" "$2"; set -euo pipefail; ${snippet}`, 'lookup', script, join(w.docs, 'Design.docx')], { encoding: 'utf8', env: environment(w, env) });
}
/** The places the lookup tries, in order, and nothing found or started: `pick` is replaced by a function that prints its candidate. */
function placesTried(w, env = {}) {
  const r = sourced(w, 'pick() { printf "%s\\n" "$1"; }; find_soffice || true', env);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /unbound variable/, 'a HOME that is not set stopped the lookup');
  return r.stdout.split('\n').filter(Boolean);
}
/**
 * The lookup as it is, except that the Mac's own /Applications is empty: a LibreOffice on THIS machine cannot answer. Nothing is started.
 * `pick` is wrapped and not replaced, so that what it tests (a file that can be run) is the script's own.
 */
function lookupHomeOnly(w, env = {}) {
  const r = sourced(w, 'eval "$(declare -f pick | sed \'1s/^pick /real_pick /\')"; pick() { case "$1" in /Applications/*) return 0 ;; esac; real_pick "$1"; }; code=0; find_soffice || code=$?; printf "%s\\n" "${SOFFICE:-}"; exit "$code"', env);
  return { code: r.status, found: r.stdout.trim(), stderr: r.stderr, errors: errorLines(r.stderr) };
}

test('ARC-09-C301 — sourcing the script defines the lookup and runs nothing', { skip }, (t) => {
  const w = world(t);
  // The stub heads PATH: a script that did run its main part when sourced would call it, and this case would fail, with nothing real started.
  const stub = sofficeAt(join(w.bin, 'soffice'));
  const r = sourced(w, 'type -t find_soffice');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'function\n');
  assert.deepEqual(calls(w), [], `the stub ${stub} was called`);
});

test('ARC-09-C301 — after PATH the lookup tries the Mac\'s own /Applications, and then the user\'s own Applications folder', { skip }, (t) => {
  const w = world(t);
  const home = '/Users/Test User';
  assert.deepEqual(placesTried(w, { HOME: home }), ['/Applications/LibreOffice.app/Contents/MacOS/soffice', `${home}/${HOME_SOFFICE}`]);
});

test('ARC-09-C301 — a HOME that is unset or empty adds no place, and never becomes a path at the root', { skip }, (t) => {
  const w = world(t);
  const fixed = ['/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  assert.deepEqual(placesTried(w, { HOME: undefined }), fixed);
  assert.deepEqual(placesTried(w, { HOME: '' }), fixed);
});

test('ARC-09-C301 — LibreOffice in the user\'s own Applications folder is found', { skip }, (t) => {
  const w = world(t);
  // A space in the folder, as many user names have.
  const home = join(w.base, 'home dir');
  const stub = sofficeAt(join(home, ...HOME_SOFFICE.split('/')));
  const r = lookupHomeOnly(w, { HOME: home });
  assert.deepEqual([r.code, r.found, r.errors], [0, stub, []], r.stderr);
});

test('ARC-09-C301 — PATH wins over the user\'s own Applications folder', { skip }, (t) => {
  const w = world(t);
  const onPath = sofficeAt(join(w.bin, 'soffice'));
  const home = join(w.base, 'home');
  sofficeAt(join(home, ...HOME_SOFFICE.split('/')));
  assert.equal(lookupHomeOnly(w, { HOME: home }).found, onPath);
});

test('ARC-09-C301 — a Mac that has LibreOffice in /Applications keeps finding that one when the user\'s folder has a copy too',
  { skip: skip || (!existsSync(`/${SOFFICE_RELATIVE}`) && 'there is no LibreOffice in /Applications on this machine; the order case above holds the same rule') }, (t) => {
    const w = world(t);
    const home = join(w.base, 'home');
    sofficeAt(join(home, ...HOME_SOFFICE.split('/')));
    // Not emptied: the lookup as it is, with the made-up HOME holding a stub and the machine's own /Applications holding the real one.
    const r = sourced(w, 'code=0; find_soffice || code=$?; printf "%s\\n" "${SOFFICE:-}"; exit "$code"', { HOME: home });
    assert.deepEqual([r.status, r.stdout.trim()], [0, `/${SOFFICE_RELATIVE}`], r.stderr);
  });

test('ARC-09-C301 — with LibreOffice in none of the places the lookup says so in the sentence it always had, and returns 3', { skip }, (t) => {
  const w = world(t);
  const home = join(w.base, 'home');
  mkdirSync(home, { recursive: true });
  const r = lookupHomeOnly(w, { HOME: home });
  assert.deepEqual([r.code, r.found, r.errors], [3, '', [SENTENCE]], r.stderr);
});

test('ARC-09-C301 — a conversion through a LibreOffice in the user\'s own Applications folder',
  { skip: hostSkip || (onHost && `LibreOffice is on this machine (${onHost}), which the script finds first`) }, (t) => {
    const w = world(t);
    const home = join(w.base, 'home');
    const stub = sofficeAt(join(home, ...HOME_SOFFICE.split('/')));
    // The script runs for real only once its own lookup, in this environment, has said it would run the stub.
    const asked = sourced(w, 'find_soffice || true; printf "%s\\n" "$SOFFICE"', { HOME: home });
    assert.equal(asked.stdout.trim(), stub, 'the lookup would run something else: nothing was started');
    const r = run(w, [join(w.docs, 'Design.docx'), w.out], { HOME: home });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(calls(w).length, 1);
    assert.ok(calls(w)[0].startsWith(`${stub} --headless`), calls(w)[0]);
    assert.ok(existsSync(join(w.out, 'Design.pdf')));
  });

test('ARC-09-C301 — the doctor and the script give the same answer for a LibreOffice in the user\'s own Applications folder', { skip }, (t) => {
  const w = world(t);
  const home = join(w.base, 'home');
  const stub = sofficeAt(join(home, ...HOME_SOFFICE.split('/')));
  const script = lookupHomeOnly(w, { HOME: home });
  // The doctor looks at its own PATH and its own candidates; the Mac's own /Applications is emptied here too, as it was for the script.
  const doctor = capabilityPacks({ env: { PATH: '', HOME: home }, platform: 'darwin', exists: (p) => !p.startsWith('/Applications/') && existsSync(p) });
  assert.deepEqual([script.found, doctor.pdf.how], [stub, stub]);
});

test('ARC-09-C301 — a file in the user\'s own Applications folder that cannot be run is not taken', { skip }, (t) => {
  const w = world(t);
  const home = join(w.base, 'home');
  const file = join(home, ...HOME_SOFFICE.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, SOFFICE_STUB);
  chmodSync(file, 0o644);
  const r = lookupHomeOnly(w, { HOME: home });
  assert.deepEqual([r.code, r.found, r.errors], [3, '', [SENTENCE]], r.stderr);
});

test('ARC-09-C301 — the places of the doctor are the places of the script: its first is the script\'s own, and the rest is /usr/bin, which PATH finds for the script', { skip }, (t) => {
  const w = world(t);
  const tried = placesTried(w, { HOME: undefined });
  assert.deepEqual(SOFFICE_CANDIDATES.slice(0, tried.length), tried, 'the doctor does not look first where the script looks');
  assert.deepEqual(SOFFICE_CANDIDATES.slice(tried.length), ['/usr/bin/soffice']);
});
