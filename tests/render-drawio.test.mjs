// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C273 — scripts/render-drawio.sh finds draw.io Desktop where Windows puts it.
 *
 * The script looked for `drawio` on PATH, two /Applications paths and /usr/bin/drawio, so in Git Bash a real `draw.io.exe` was
 * "not found" and the remedy said brew. A person making a Word document with a diagram wrote a `drawio` shim by hand to get past it.
 * It now looks, after PATH under the three names draw.io goes by (`drawio`, `draw.io`, `draw.io.exe`), in the places each platform's
 * install lands — on Windows the zip and the per-user installer under %LOCALAPPDATA%\Programs, and Program Files — and its error gives
 * the install line of the platform it ran on, with brew for macOS only.
 *
 * NO CASE HERE STARTS A RENDERER THAT IS NOT A STUB. draw.io Desktop is installed on machines that run this suite, and an earlier
 * version of this file started the real one — about ten times, from /Applications, under a temporary HOME — and macOS asked for a
 * keychain ("Keychain Not Found … 'draw.io Key'"). On macOS a temporary HOME does not even isolate it: Electron keeps its data in the
 * account's real home, and wrote there. So:
 *   - a lookup case SOURCES the script, which defines `find_drawio` and runs nothing, and calls it: it only looks, and the case reads
 *     the path it chose. The directory handed to the sourced file is empty, so even a script that ran its main part when sourced would
 *     have nothing to render;
 *   - a case that runs the script for real first asks that lookup, in the same environment, what it would run, and refuses to start
 *     anything unless the answer is its own stub;
 *   - the platform is a `uname` stub on PATH, so a draw.io on THIS machine cannot be found by a case that pretends to be another
 *     platform, and no case sets HOME.
 * The stubs are shell scripts, so the cases run on macOS and Linux; the step in ci.yml runs the same script in Git Bash against a
 * compiled draw.io.exe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'render-drawio.sh');
const skip = process.platform === 'win32'
  ? 'the stubs are shell scripts; the step in ci.yml runs this script in Git Bash against a compiled draw.io.exe' : false;

/** A "not found" case runs with /usr/bin and /bin on PATH, so a draw.io there on THIS machine is found whatever platform the case pretends to be. */
const onHostPath = ['/usr/bin', '/bin'].flatMap((d) => ['drawio', 'draw.io', 'draw.io.exe'].map((n) => join(d, n))).find((p) => existsSync(p));
const hostSkip = skip || (onHostPath && `draw.io is on this machine's PATH (${onHostPath}), which a "not found" case would find`);
const hostApp = ['/Applications/draw.io.app/Contents/MacOS/draw.io', '/Applications/drawio.app/Contents/MacOS/drawio'].find((p) => existsSync(p));

const GIT_BASH = 'MINGW64_NT-10.0-26200';
const RELEASES = 'https://github.com/jgraph/drawio-desktop/releases';

/** A draw.io stand-in: records how it was called, writes the file named after -o, succeeds. */
const DRAWIO_STUB = ['#!/bin/sh',
  'echo "$0 $*" >> "$STUB_LOG"',
  'out=""; while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out="$2"; shift; done',
  '[ -n "$out" ] && echo stub > "$out"',
  'exit 0', ''].join('\n');

/** A scratch world: a bin folder that heads PATH, a folder holding one diagram, an empty folder, and the log the draw.io stub writes. */
function world(t) {
  const base = tempDir('render-drawio-', t);
  const w = { base, bin: join(base, 'bin'), diagrams: join(base, 'diagrams'), empty: join(base, 'empty'), log: join(base, 'stub.log') };
  for (const d of [w.bin, w.diagrams, w.empty]) mkdirSync(d, { recursive: true });
  writeFileSync(join(w.diagrams, 'a.drawio'), '<mxfile/>');
  writeFileSync(w.log, '');
  return w;
}
const executable = (path, body) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); chmodSync(path, 0o755); return path; };
const drawioAt = (path) => executable(path, DRAWIO_STUB);
/** The platform the script believes it is on. */
const unameIs = (w, value) => executable(join(w.bin, 'uname'), `#!/bin/sh\necho '${value}'\n`);
/** No HOME is set: nothing here reads it, and a fake one is the thing that must never reach a real app. */
const environment = (w, env = {}) => ({ PATH: `${w.bin}:/usr/bin:/bin`, STUB_LOG: w.log, ...env });

/** What the script would run, asked of its own lookup. Nothing is started: the file is sourced and find_drawio only looks. */
function lookup(w, env = {}) {
  const r = spawnSync('bash', ['-c', 'source "$1" "$2"; find_drawio; code=$?; printf "%s\\n" "${DRAWIO:-}"; exit "$code"', 'lookup', script, w.empty],
    { encoding: 'utf8', env: environment(w, env) });
  return { code: r.status, found: r.stdout.trim(), stderr: r.stderr };
}

/** Run the script for real, but only once its lookup has said it would run `stub` and nothing else. */
function render(w, stub, env = {}, dir = w.diagrams) {
  const asked = lookup(w, env);
  assert.equal(asked.found, stub, `the lookup would run ${asked.found || 'nothing'}, not the stub: nothing was started`);
  return spawnSync('bash', [script, dir], { encoding: 'utf8', env: environment(w, env) });
}
const calls = (w) => readFileSync(w.log, 'utf8').trim().split('\n').filter(Boolean);

test('ARC-09-C273 — sourcing the script defines the lookup and runs nothing', { skip }, (t) => {
  const w = world(t);
  // The one case that hands a sourced file a folder WITH a diagram in it, to see that nothing is rendered — so its renderer is a stub, found
  // first on PATH: a script that did run its main part when sourced would call the stub, and this case would fail, with nothing real started.
  const stub = drawioAt(join(w.bin, 'drawio'));
  const r = spawnSync('bash', ['-c', 'source "$1" "$2"; type -t find_drawio', 'lookup', script, w.diagrams], { encoding: 'utf8', env: environment(w) });
  assert.equal(r.status, 0, r.stderr);
  // Nothing on stdout but the answer to `type -t`: no "rendering …", no "done: …".
  assert.equal(r.stdout, 'function\n');
  assert.equal(existsSync(join(w.diagrams, 'a.png')), false);
  assert.deepEqual(calls(w), [], `the stub ${stub} was called`);
});

test('ARC-09-C273 — on PATH under any of the three names draw.io goes by', { skip }, (t) => {
  for (const name of ['drawio', 'draw.io', 'draw.io.exe']) {
    const w = world(t);
    const stub = drawioAt(join(w.bin, name));
    assert.deepEqual(lookup(w), { code: 0, found: stub, stderr: '' }, name);
  }
});

test('ARC-09-C273 — Windows: the zip, the per-user installer and Program Files are found where the variables say', { skip }, (t) => {
  const cases = [
    ['the zip', 'LOCALAPPDATA', 'Programs/drawio/draw.io.exe'],
    ['the per-user installer', 'LOCALAPPDATA', 'Programs/draw.io/draw.io.exe'],
    ['Program Files', 'PROGRAMFILES', 'draw.io/draw.io.exe'],
  ];
  for (const [what, variable, rel] of cases) {
    const w = world(t);
    unameIs(w, GIT_BASH);
    // A space in the folder, as "Program Files" and many user names have.
    const folder = join(w.base, variable === 'PROGRAMFILES' ? 'Program Files' : 'Local App Data');
    const stub = drawioAt(join(folder, ...rel.split('/')));
    assert.deepEqual(lookup(w, { [variable]: folder }), { code: 0, found: stub, stderr: '' }, what);
  }
});

test('ARC-09-C273 — Windows: Git Bash hands over C:\\ paths, and the place that is tested is the converted one', { skip }, (t) => {
  const w = world(t);
  unameIs(w, GIT_BASH);
  // cygpath is Git Bash's own; this one maps C:\… to a folder of the scratch world and does nothing else cygpath does.
  executable(join(w.bin, 'cygpath'), `#!/bin/sh\n[ "$1" = "-u" ] && shift\nprintf '%s\\n' "$1" | sed -e 's|\\\\|/|g' -e 's|^C:|${w.base}/c|'\n`);
  const stub = drawioAt(join(w.base, 'c', 'Users', 'Test User', 'AppData', 'Local', 'Programs', 'drawio', 'draw.io.exe'));
  assert.deepEqual(lookup(w, { LOCALAPPDATA: 'C:\\Users\\Test User\\AppData\\Local' }), { code: 0, found: stub, stderr: '' });
});

test('ARC-09-C273 — Windows: PATH wins over the places, as it does on the other platforms', { skip }, (t) => {
  const w = world(t);
  unameIs(w, GIT_BASH);
  const onPath = drawioAt(join(w.bin, 'draw.io.exe'));
  const folder = join(w.base, 'local');
  drawioAt(join(folder, 'Programs', 'drawio', 'draw.io.exe'));
  assert.equal(lookup(w, { LOCALAPPDATA: folder }).found, onPath);
});

test('ARC-09-C273 — Windows: variables unset, empty or naming a folder with no draw.io find nothing, and a file that cannot be run is not taken', { skip: hostSkip }, (t) => {
  const withNothing = (name, env) => {
    const w = world(t);
    unameIs(w, GIT_BASH);
    const r = lookup(w, env(w));
    assert.equal(r.code, 3, `${name}: ${r.stderr}`);
    assert.equal(r.found, '', name);
    assert.match(r.stderr, /^ERROR: draw\.io Desktop not found\. Without administrator rights/, name);
  };
  withNothing('unset', () => ({}));
  withNothing('empty', () => ({ LOCALAPPDATA: '', PROGRAMFILES: '' }));
  withNothing('a folder with no draw.io', (w) => ({ LOCALAPPDATA: w.empty, PROGRAMFILES: w.empty }));
  withNothing('a file that is not executable', (w) => {
    const file = join(w.base, 'local', 'Programs', 'drawio', 'draw.io.exe');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, DRAWIO_STUB);
    chmodSync(file, 0o644);
    return { LOCALAPPDATA: join(w.base, 'local') };
  });
});

/** Not found, on a platform that says `uname`: what the lookup printed to stderr. */
function notFound(t, uname) {
  const w = world(t);
  unameIs(w, uname);
  const r = lookup(w);
  assert.equal(r.code, 3, `${uname}: ${r.found}${r.stderr}`);
  assert.equal(r.found, '', uname);
  return r.stderr;
}

test('ARC-09-C273 — not found on Windows: the zip, the page it comes from and where to put it; no brew, no Linux packages', { skip: hostSkip }, (t) => {
  const messages = ['MINGW64_NT-10.0-26200', 'MSYS_NT-10.0-22631', 'CYGWIN_NT-10.0-22631'].map((u) => notFound(t, u));
  for (const m of messages) {
    assert.match(m, /^ERROR: draw\.io Desktop not found\. Without administrator rights: download the zip whose name ends in -windows\.zip from /);
    assert.ok(m.includes(`${RELEASES} and unpack it into %LOCALAPPDATA%\\Programs\\drawio, so that draw.io.exe is in that folder.`), m);
    assert.match(m, /\(The installer on the same page needs administrator rights\.\)\n$/);
    assert.doesNotMatch(m, /brew|\.deb|\.rpm|AppImage/);
  }
  assert.equal(new Set(messages).size, 1, 'Git Bash, MSYS2 and Cygwin are one Windows');
});

test('ARC-09-C273 — not found on Linux: the packages on the releases page; no brew, nothing of Windows', { skip: hostSkip }, (t) => {
  const m = notFound(t, 'Linux');
  assert.equal(m, `ERROR: draw.io Desktop not found. Install the .deb or .rpm from ${RELEASES}, or put its AppImage on PATH under the name drawio.\n`);
  assert.doesNotMatch(m, /brew|LOCALAPPDATA|zip/);
});

test('ARC-09-C273 — not found on macOS: the sentence it always had, byte for byte',
  { skip: hostSkip || (hostApp && `draw.io Desktop is installed here (${hostApp}), which a macOS lookup finds; the macOS cell of CI has none`) }, (t) => {
    assert.equal(notFound(t, 'Darwin'), 'ERROR: draw.io Desktop not found. Install it: brew install --cask drawio\n');
  });

test('ARC-09-C273 — the macOS sentence is in the script as it was, on a machine where the case above cannot run', { skip }, () => {
  assert.ok(readFileSync(script, 'utf8').includes("mac) how='Install it: brew install --cask drawio' ;;"));
});

test('ARC-09-C273 — a render calls the renderer the way it always did', { skip }, (t) => {
  const w = world(t);
  const stub = drawioAt(join(w.bin, 'drawio'));
  const r = render(w, stub);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /rendering a\.drawio -> a\.png\n/);
  assert.match(r.stdout, /done: 1 rendered, 0 failed/);
  assert.deepEqual(calls(w), [`${stub} -x -f png -o ${join(w.diagrams, 'a.png')} -b 8 --no-sandbox -s 3 ${join(w.diagrams, 'a.drawio')}`]);
  assert.ok(existsSync(join(w.diagrams, 'a.png')), 'nothing was rendered');
});

test('ARC-09-C273 — a render through a Windows place whose folder has a space in it', { skip }, (t) => {
  const w = world(t);
  unameIs(w, GIT_BASH);
  const folder = join(w.base, 'Program Files');
  const stub = drawioAt(join(folder, 'draw.io', 'draw.io.exe'));
  const r = render(w, stub, { PROGRAMFILES: folder });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /done: 1 rendered, 0 failed/);
  assert.equal(calls(w).length, 1);
  assert.ok(calls(w)[0].startsWith(`${stub} -x -f png`), calls(w)[0]);
});

test('ARC-09-C273 — a folder with no diagrams ends the way it did', { skip }, (t) => {
  const w = world(t);
  const stub = drawioAt(join(w.bin, 'drawio'));
  const r = render(w, stub, {}, w.empty);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No \.drawio files under /);
  assert.deepEqual(calls(w), []);
});
