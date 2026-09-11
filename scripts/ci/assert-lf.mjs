#!/usr/bin/env node
/**
 * The named files contain NO carriage return at all, in the bytes on disk.
 *
 * ARC-09-S09, and the symptom it exists for has a name: `/bin/bash^M: bad interpreter`. A shell
 * script checked out CRLF does not fail at the line with the `\r` in it — it fails on line 1, at
 * the shebang, with an error naming an interpreter that plainly exists, and the `^M` is easy to
 * read straight past. `core.autocrlf=true` is the setting that produces it and the default on a
 * Git-for-Windows install, which is why this runs on BOTH runners: ubuntu proves the committed
 * bytes, Windows proves the checkout under the setting a consultant actually has.
 *
 * Not "the line endings are LF" — NO `\r` ANYWHERE, including inside a line. A lone `\r` in the
 * middle of a heredoc breaks the same script in a way the line-ending view of the file hides.
 *
 * Usage: node scripts/ci/assert-lf.mjs <file>…
 * Exit 0 no CR · 1 a CR was found (or a file is missing) · 2 no files named.
 */
import { readFileSync, writeSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  writeSync(2, 'assert-lf: name at least one file\n');
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
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] === 0x0a) { line += 1; continue; }
      if (bytes[i] !== 0x0d) continue;
      const what = bytes[i + 1] === 0x0a ? 'CRLF' : 'a lone CR';
      bad.push(`${file}:${line}: ${what} at byte ${i} — this file must be LF only`);
      // One per file is enough to act on; a CRLF file would otherwise print a line per line.
      break;
    }
  }
  if (bad.length > 0) {
    writeSync(2, `assert-lf: ${bad.length} problem(s)\n${bad.map((b) => `  ${b}\n`).join('')}`);
    writeSync(2, '  a CRLF bootstrap.sh is `/bin/bash^M: bad interpreter` on every Unix machine\n');
    process.exitCode = 1;
  } else {
    writeSync(1, `assert-lf: ${files.length} file(s) contain no CR\n`);
  }
}
