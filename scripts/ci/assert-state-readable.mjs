// ARC-07-C35 — the assertion two `ci.yml` steps used to make inline, moved where the instruments are.
//
// `ci.yml` had this as a `node --input-type=module -e "…"` block in two steps: *"The state it wrote is
// the one Node reads"* (after `bootstrap.sh`) and *"The state it wrote says powershell, and Node reads
// it"* (after `bootstrap.ps1`). Both imported `loadState` from the product and called it.
//
// WHY IT MOVED. ARC-07-C31 made `loadState`'s spelling required and those two steps were the TWELFTH
// caller — found by CI, twenty minutes and three red `launcher` cells later, because **a script that
// lives in YAML is covered by no local instrument at all**: not `lint`, not `type-check`, not the
// suite, not `gen:check`, and not a grep of `tools/`, `scripts/` or `packages/snowarch/src`. Its first
// reader is always CI. Here it is linted, swept by `tests/windows-spellings.test.mjs`, held by
// `tests/scripts-are-importable.test.mjs`, and — the part that matters — DRIVEN by a test, so the
// assertion CI makes can fail on a laptop.
//
// The assertions are the two the steps made: the state names the writer it should, and it survives
// `assertStorable`. The success line is unified to the form that already carried the writer, so the
// PowerShell step's output gains the writer rather than losing anything; nothing greps either line.
//
// Usage: node scripts/ci/assert-state-readable.mjs --writer bash|powershell [--root <dir>]
// Exit 0 when the state is the writer's and storable · 1 when it is not.
import { writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertStorable, loadState } from '../../tools/snowarch/lib/state.mjs';
import { spellings } from '../../tools/snowarch/lib/launcher-spelling.mjs';

/**
 * The check, as a function, which is the whole reason this file exists rather than a YAML block.
 *
 * `spell` is a PARAMETER: `loadState` renders its refusals for whoever is reading, and on these steps
 * that is the runner's own shell — which is exactly what the PowerShell step is asserting about. A test
 * drives it with a pinned spelling instead.
 *
 * It RETURNS rather than exits, so a case can assert on the outcome without spawning a process and
 * without a `process.exit` deciding the test runner's fate.
 */
export function checkState(root, { writer, spell = spellings(), read = loadState } = {}) {
  const state = read(root, spell);
  if (!state) return { ok: false, error: `no state at ${root} — nothing wrote .local/bootstrap-state.json` };
  if (state.writer !== writer) return { ok: false, error: `writer is ${state.writer}` };
  // Throws on a state this build could not store again — the second assertion, unchanged.
  assertStorable(state);
  return { ok: true,
    line: `state ok: ${state.version} ${state.writer} ${Object.keys(state.steps).length} steps` };
}

/** Run only when this file IS the command — ARC-08-C20's rule, so the export above is importable. */
const INVOKED_DIRECTLY = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (INVOKED_DIRECTLY) {
  const argv = process.argv.slice(2);
  const valueOf = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const writer = valueOf('--writer');
  if (!writer) {
    writeSync(2, 'assert-state-readable: --writer <bash|powershell> is required\n');
    process.exitCode = 1;
  } else {
    const r = checkState(valueOf('--root') ?? process.cwd(), { writer });
    if (r.ok) writeSync(1, `${r.line}\n`);
    else {
      writeSync(2, `${r.error}\n`);
      process.exitCode = 1;
    }
  }
}
