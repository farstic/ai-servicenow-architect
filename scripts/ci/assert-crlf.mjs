#!/usr/bin/env node
/**
 * Every line of the named files ends CRLF, in the BYTES on disk.
 *
 * ARC-09-S09. `.gitattributes` says `*.ps1` and `*.cmd` are `eol=crlf`, and `git ls-files --eol`
 * reports what git BELIEVES about the working tree. That is one layer short of the claim: what
 * `cmd.exe` parses is the bytes a checkout actually wrote, and the interesting condition —
 * `core.autocrlf=true`, a consultant's Git-for-Windows default — is precisely the one where a
 * developer's own machine does not reproduce what the user's machine gets. So this reads the file
 * and counts the bytes, on the runner, after the clone.
 *
 * A bare `\n` is the failure; `\r\n` is not. The message names the file, the 1-based line and the
 * byte offset, because "a file has a wrong line ending somewhere" is not something anyone can act
 * on, and an editor's go-to-offset is.
 *
 * If a launcher fails this, the fix is `scripts/gen-launcher-text.mjs` — the generator is the one
 * definition of those bytes (ARC-06-S10/S11/S13). Editing the file by hand puts the two out of
 * step and the next `npm run gen` silently reverts the repair.
 *
 * Usage: node scripts/ci/assert-crlf.mjs <file>…
 * Exit 0 every line CRLF · 1 a bare LF (or a missing file) · 2 no files named.
 */
import { readFileSync, writeSync } from 'node:fs';

const MAX_PER_FILE = 5;
const files = process.argv.slice(2);
if (files.length === 0) {
  writeSync(2, 'assert-crlf: name at least one file\n');
  process.exitCode = 2;
} else {
  const bad = [];
  for (const file of files) {
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch (e) {
      bad.push(`${file}: cannot read it — ${e.code ?? e.message}`);
      continue;
    }
    let line = 1;
    let lastEnd = -1;
    let bare = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] !== 0x0a) continue;
      // 0x0a with no 0x0d in front of it is a bare LF. At offset 0 there is no byte in front.
      if (i === 0 || bytes[i - 1] !== 0x0d) {
        bare += 1;
        // An LF-only file has one of these PER LINE, and a 236-line report is a CI log nobody
        // reads to the end. The first few locate it; the count says how big it is.
        if (bare <= MAX_PER_FILE) {
          bad.push(`${file}:${line}: bare LF at byte ${i} — the file must be CRLF throughout`);
        }
      }
      line += 1;
      lastEnd = i;
    }
    if (bare > MAX_PER_FILE) {
      bad.push(`${file}: …and ${bare - MAX_PER_FILE} more bare LF(s) — the whole file is LF`);
    }
    // A last line with no terminator at all is not a CRLF file either, and it is the shape a
    // hand-edit leaves behind. Only worth saying when the file has content.
    if (bytes.length > 0 && lastEnd !== bytes.length - 1) {
      bad.push(`${file}:${line}: the last line has no CRLF terminator (${bytes.length} bytes)`);
    }
  }
  if (bad.length > 0) {
    writeSync(2, `assert-crlf: ${bad.length} problem(s)\n${bad.map((b) => `  ${b}\n`).join('')}`);
    writeSync(2, '  the launchers are GENERATED — fix scripts/gen-launcher-text.mjs, not the file\n');
    process.exitCode = 1;
  } else {
    writeSync(1, `assert-crlf: ${files.length} file(s) are CRLF throughout\n`);
  }
}
