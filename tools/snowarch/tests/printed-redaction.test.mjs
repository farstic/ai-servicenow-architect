// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C208 — no product sentence is printed with a key masked as a first.last name.
 *
 * Found by ARC-09-C207: the upgrade's proxy remedy printed `h***.p***` for git's `http.proxy`, and a scan of the
 * engine's string literals through `redact` found the same in doctor details, the revocation-list line, lint
 * messages and a launcher error. The guard reads every literal (`helpers/printed-scan.mjs`), so a key written into a
 * new sentence fails here, where it is cheap, instead of on a user's screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { redact } from '../lib/redact.mjs';
import { scanPrintedText } from './helpers/printed-scan.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

test('ARC-09-C208 — no string in the engine is printed with a key masked as a first.last name', async () => {
  const { masked, files, parts } = await scanPrintedText({
    roots: ['lib', 'bin', 'hooks'].map((d) => join(ENGINE, d)) });
  // The floor the reader must clear, so a walk that read nothing cannot pass: measured at 109 files (7 of them JSON)
  // and 8,466 parts.
  assert.ok(files >= 100 && parts >= 7000, `the scan read ${files} file(s), ${parts} literal part(s)`);
  assert.deepEqual(masked, [], `${masked.length} literal(s) the redactor would change:\n  ${masked.join('\n  ')}`);
});

test('ARC-09-C208 — the reader sees a key in a quoted string, in a template\'s text, and never in its code', async () => {
  const { masked } = await scanPrintedText({ sources: {
    'plain.mjs': "log.fail('docs.pin is not a 40-character sha');",
    'template.mjs': 'log.step(`checked ${n} files; see docs.pin for the commit`);',
    'code.mjs': 'log.step(`the pin is ${config.docs.pin} today`);',
    'backticked.mjs': "log.fail('`docs.pin` is not a 40-character sha');",
    // A JSON value is read by its key path; an install command's package id is left alone by the redactor itself.
    'remedies.json': '{ "e06": { "default": "set docs.pin to a sha", "win32": "winget install Git.Git" } }',
  } });
  assert.deepEqual(masked.map((m) => m.split(/[: ]/)[0]), ['plain.mjs', 'template.mjs', 'remedies.json'],
    masked.join('\n'));
  assert.match(masked[2], /^remedies\.json e06\.default /, masked[2]);
});

test('ARC-09-C208 — a real first.last in a printed line is still masked', () => {
  // The guard is about our own keys; the rule it works around still does its job on a person's name.
  assert.equal(redact('signed in as john.smith on the instance'), 'signed in as j***.s*** on the instance');
});
