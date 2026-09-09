#!/usr/bin/env node
/**
 * Re-pin the engine against the server contract — proposing first, applying second.
 *
 * `required-tools.json` says what the engine's texts and skills depend on and what gate each
 * tool is *expected* to have. `dist/contract.json` says what the server actually declares. The
 * whole value of the pair is that a disagreement is loud: `execute_script` was renamed to
 * `snow_fluent_script_exec` AND re-gated in the same change, and nothing on the engine side
 * noticed (`00` §8). That is what this tool exists to make impossible to merge quietly.
 *
 * Principle 10 — propose, review, apply. Nothing is written until a human says so, and on a
 * non-TTY (CI, a hook, an agent) it refuses rather than deciding for them.
 *
 *   node packages/contract/pin.mjs                      propose, then ask
 *   node packages/contract/pin.mjs --yes                propose and apply
 *   node packages/contract/pin.mjs --accept-regate <t>… accept a changed gate for those tools
 *
 * Exit codes, which a caller can branch on:
 *   0  applied (or already current)
 *   1  refused — a REGATE or a MISSING the operator has not accepted
 *   2  cannot run: no contract to hash, or a non-TTY without `--yes`
 *   3  aborted at the prompt
 *
 * Stdlib only. This runs before anything is installed.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath`, never `new URL(...).pathname`: the latter is `/C:/…` on Windows, which is
// not a filesystem path.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

/**
 * Both paths are overridable, and the pin path had to become one.
 *
 * `SNOW_CONTRACT_PATH` lets a test point at a fixture contract — a renamed tool, a re-gated one.
 * Without a matching `SNOW_PIN_PATH` those runs write their conclusions into the COMMITTED pin:
 * demonstrating criterion 4 against a fixture that re-gates `snow_fluent_script_exec` to `write`
 * left the real file saying `write`, and the next honest run then refused because the real
 * contract says `scripting`. The tool was right both times; the harness was wrong. A fixture run
 * must not be able to edit the artefact it is pretending about.
 */
const PIN_PATH = process.env.SNOW_PIN_PATH
  ? resolve(process.env.SNOW_PIN_PATH)
  : join(here, 'required-tools.json');
const CONTRACT_PATH = process.env.SNOW_CONTRACT_PATH
  ? resolve(process.env.SNOW_CONTRACT_PATH)
  : join(root, 'packages', 'snowarch', 'dist', 'contract.json');

const EXIT = { applied: 0, refused: 1, cannotRun: 2, aborted: 3 };

const argv = process.argv.slice(2);
const yes = argv.includes('--yes');
/**
 * `--accept-regate a b c` — every argument after the flag until the next `--flag`.
 *
 * Variadic on purpose: a contract change usually re-gates a family at once, and forcing one
 * invocation per tool would make the commit message list what happened while the command
 * history did not.
 */
const acceptRegate = new Set((() => {
  const at = argv.indexOf('--accept-regate');
  if (at === -1) return [];
  const names = [];
  for (let i = at + 1; i < argv.length && !argv[i].startsWith('--'); i += 1) names.push(argv[i]);
  return names;
})());

const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);

if (!existsSync(CONTRACT_PATH)) {
  // Exit 2, not 1: "the contract is not there" is a different problem from "the contract
  // disagrees", and a caller scripting against this needs to tell them apart.
  err(`pin.mjs: ${CONTRACT_PATH} does not exist — nothing to pin against.`);
  err('The contract is a build artefact: run node scripts/build-dist.mjs');
  process.exit(EXIT.cannotRun);
}

const contractText = readFileSync(CONTRACT_PATH, 'utf8');
// The hash is of the BYTES, not of a re-serialised object: a consumer verifies it with
// `shasum -a 256` or `Get-FileHash`, and those hash the file.
const sha = createHash('sha256').update(contractText).digest('hex');
const contract = JSON.parse(contractText);
const declared = new Map(contract.tools.map((t) => [t.name, t]));

const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8'));

// ─── Build the proposal ──────────────────────────────────────────────────────

const missing = [];
const regates = [];
const carried = [];   // optional fields the contract now carries and the pin does not

for (const entry of pin.tools) {
  const server = declared.get(entry.name);
  if (!server) { missing.push(entry.name); continue; }

  if (server.gate !== entry.gate || server.mutates !== entry.mutates) {
    regates.push({
      name: entry.name,
      expected: `${entry.gate}/${entry.mutates}`,
      declares: `${server.gate}/${server.mutates}`,
      server,
    });
  }

  // The two newer contract fields. They are compared too, so ARC-05-S07's generator has one
  // source for `mutates || sessionMutates` and for the `alsoRequires` union — a pin that
  // ignored them would let either drift silently, which is the same defect one level down.
  for (const field of ['alsoRequires', 'sessionMutates']) {
    if (server[field] !== undefined && entry[field] !== server[field]) {
      carried.push({ name: entry.name, field, value: server[field], had: entry[field] });
    }
    if (server[field] === undefined && entry[field] !== undefined) {
      carried.push({ name: entry.name, field, value: undefined, had: entry[field] });
    }
  }
}

const shaChanged = pin.contractSha256 !== sha;
const blocking = regates.filter((r) => !acceptRegate.has(r.name));

out('Proposed pin');
out(`  contract file : ${CONTRACT_PATH.replace(root, '<repo>')}`);
out(`  current sha   : ${pin.contractSha256}`);
out(`  proposed sha  : ${sha}${shaChanged ? '' : '   (unchanged)'}`);
out(`  required tools: ${pin.tools.length}, contract declares ${contract.tools.length}`);

for (const name of missing) {
  out(`MISSING ${name} — not in ${CONTRACT_PATH.replace(root, '<repo>')}`);
}
for (const r of regates) {
  const accepted = acceptRegate.has(r.name) ? '   [accepted]' : '';
  out(`REGATE ${r.name}: expected ${r.expected}, server declares ${r.declares}${accepted}`);
}
for (const c of carried) {
  out(`FIELD ${c.name}.${c.field}: pin has ${JSON.stringify(c.had)}, server declares ${JSON.stringify(c.value)}`);
}
if (missing.length === 0 && regates.length === 0 && carried.length === 0) {
  out('  no differences beyond the sha');
}

// ─── Refuse, or ask, or apply ────────────────────────────────────────────────

if (missing.length > 0) {
  // Never auto-resolved. A tool the engine depends on that the server no longer has is a
  // decision about the engine's texts, not about this file.
  err('');
  err(`pin.mjs: ${missing.length} required tool(s) are absent from the contract. Nothing written.`);
  err('Either the tool was renamed (update required-tools.json and the texts that cite it)');
  err('or it was removed (decide what the engine does instead).');
  process.exit(EXIT.refused);
}

if (blocking.length > 0) {
  err('');
  err(`pin.mjs: ${blocking.length} gate/mutates disagreement(s) not accepted. Nothing written.`);
  err(`Re-run with: --accept-regate ${blocking.map((r) => r.name).join(' ')}`);
  err('Accepting one means the ENGINE now expects the server\'s declaration — check the texts');
  err('that cite it first; a re-gate can change what a user is asked to approve.');
  process.exit(EXIT.refused);
}

async function confirm() {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    err('');
    err('pin.mjs: stdin is not a terminal — pass --yes to apply the proposal above');
    process.exit(EXIT.cannotRun);
  }
  out('');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => {
    // `close` as well as an answer. Ctrl-D — or a harness whose stdin ends while the prompt is
    // open — otherwise leaves the promise unsettled, and Node exits with "Detected unsettled
    // top-level await" and a code nobody can interpret. Closing stdin is not consent, so it
    // resolves to the abort.
    rl.on('close', () => res('n'));
    rl.question('Enter = apply · n = abort  ', res);
  });
  rl.close();
  return answer.trim().toLowerCase() !== 'n';
}

if (!(await confirm())) {
  err('pin.mjs: aborted. Nothing written.');
  process.exit(EXIT.aborted);
}

// Apply: the sha, the accepted re-gates, and the carried fields.
pin.contractSha256 = sha;
for (const r of regates) {
  const entry = pin.tools.find((t) => t.name === r.name);
  entry.gate = r.server.gate;
  entry.mutates = r.server.mutates;
}
for (const c of carried) {
  const entry = pin.tools.find((t) => t.name === c.name);
  if (c.value === undefined) delete entry[c.field];
  else entry[c.field] = c.value;
}
pin.tools.sort((a, b) => a.name.localeCompare(b.name));

// 2-space indent, LF, trailing newline — the same shape the test asserts, so a pin run never
// produces a diff that is only whitespace.
writeFileSync(PIN_PATH, `${JSON.stringify(pin, null, 2)}\n`);

out('');
out(`pin.mjs: applied. contractSha256 = ${sha}`);
if (regates.length > 0) out(`pin.mjs: accepted ${regates.length} re-gate(s): ${regates.map((r) => r.name).join(', ')}`);
if (carried.length > 0) out(`pin.mjs: carried ${carried.length} contract field(s)`);
process.exit(EXIT.applied);
