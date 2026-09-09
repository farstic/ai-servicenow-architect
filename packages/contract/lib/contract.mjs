/**
 * The contract, as an API for engine tooling.
 *
 * Everything outside `packages/snowarch` that needs to know a flag name, a preset's contents, a
 * tool's gate or an error code's remedy reads it here. The alternative is what this file exists to
 * end: a list of six flag names typed into a wizard, a set of preset names typed into a doctor, a
 * remedy typed into a message — each true when written and none of them noticed when the server
 * changes. `tests/contract/no-literals.test.mjs` is the other half of that rule.
 *
 * **Stdlib only, zero dependencies, importable before `npm ci`.** ARC-06's bootstrap and ARC-08's
 * doctor both run in a checkout that has not installed anything yet: a loader that needed a package
 * would be a loader they could not call at the moment they most need it.
 *
 * `loadContract` is the only function that touches the filesystem. Everything else is a pure
 * function of the object it returns, so a caller can hold one contract and ask it many questions,
 * and a test can pass a fixture without writing a file.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const selfRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const CONTRACT_PATH = 'packages/snowarch/dist/contract.json';
export const PIN_PATH = 'packages/contract/required-tools.json';

/** The pin and the contract disagree. Carries both shas, because "mismatch" alone is not actionable. */
export class ContractPinMismatch extends Error {
  constructor(pinned, actual) {
    super(`contract sha mismatch: pinned ${pinned.slice(0, 12)}… committed ${actual.slice(0, 12)}… `
      + '— run node packages/contract/pin.mjs and review the proposal');
    this.name = 'ContractPinMismatch';
    this.pinned = pinned;
    this.actual = actual;
  }
}

/**
 * Read and parse the contract.
 *
 * `verifyPin` defaults to true: a caller reading the contract is almost always about to act on it,
 * and acting on a contract the engine has not accepted is the drift this whole ARC exists to stop.
 * Pass `false` deliberately — `pin.mjs` itself must read a contract that does not match yet.
 */
export function loadContract({ root = selfRoot, verifyPin = true } = {}) {
  const text = readFileSync(join(root, CONTRACT_PATH), 'utf8');
  const contract = JSON.parse(text);
  if (verifyPin) {
    const pin = JSON.parse(readFileSync(join(root, PIN_PATH), 'utf8'));
    const actual = createHash('sha256').update(text).digest('hex');
    if (actual !== pin.contractSha256) throw new ContractPinMismatch(pin.contractSha256, actual);
  }
  return contract;
}

export const flags = (c) => c.flags;
export const flagNames = (c) => c.flags.map((f) => f.name);
export const presets = (c) => c.presets;
export const presetNames = (c) => Object.keys(c.presets);

/**
 * A preset's six flags, or a `custom` set built from overrides.
 *
 * The dependency rule is enforced here rather than left to the server, because a caller that builds
 * a flag set — the wizard's review screen — has to know it is impossible BEFORE it writes the store.
 * The error names the pair, since "invalid flags" sends the reader to look at all six.
 */
export function expandPreset(c, name, custom = {}) {
  const names = flagNames(c);
  const base = name === 'custom'
    ? Object.fromEntries(names.map((f) => [f, custom[f] === 'true' ? 'true' : 'false']))
    : c.presets[name];
  if (!base) throw new Error(`unknown preset "${name}" — the contract declares ${presetNames(c).join(', ')}`);
  for (const f of c.flags) {
    if (base[f.name] !== 'true') continue;
    for (const need of f.requires) {
      if (base[need] !== 'true') throw new Error(`${f.name} requires ${need}`);
    }
  }
  return { ...base };
}

export const tools = (c) => c.tools;

/**
 * Tool names, optionally filtered by whether they mutate.
 *
 * `toolNames(c, { mutates: true })` is the instance-writing set. It is NOT the set that must be
 * approved — see `askList`, which is the one a permission block or a doctor should use.
 */
export function toolNames(c, { mutates } = {}) {
  const list = mutates === undefined ? c.tools : c.tools.filter((t) => Boolean(t.mutates) === mutates);
  return list.map((t) => t.name);
}

/**
 * The tools a session must be asked about: `mutates` OR `sessionMutates`.
 *
 * One definition, because there are three callers and they must agree — the generated
 * `permissions.ask` block, the rule file's count, and ARC-08's doctor. `snow_core_instance_switch`
 * changes no record and decides where every later write lands; a caller that filtered on `mutates`
 * alone would leave that one action unprompted and then prompt every write that followed it.
 */
export const askList = (c) => c.tools.filter((t) => t.mutates === true || t.sessionMutates === true);

/** Registered tools that always refuse: no REST endpoint backs them (`UNSUPPORTED_ON_THIS_INSTANCE`). */
export const unsupportedTools = (c) => c.tools.filter((t) => t.unsupported === true).map((t) => t.name);

/** The second gate a tool enforces after its first, for the six that have one. */
export const alsoRequires = (c, name) => c.tools.find((t) => t.name === name)?.alsoRequires;

export const errorCodes = (c) => c.errorCodes;

/** The registry entry for a code — meaning, remedy, and a command when one exists. */
export const remedyFor = (c, code) => c.errorCodes.find((e) => e.code === code);

/**
 * The tool-name prefix, from `engine.config.json`.
 *
 * Takes the config rather than reading it, so the one place that decides the server key stays
 * `engine.config.json` and this function cannot become a second answer to the same question.
 */
export function prefix(config) {
  const key = config?.mcp?.serverKey;
  if (!key) throw new Error('engine.config.json has no mcp.serverKey — the tool prefix has no source');
  return `mcp__${key}__`;
}

/** The four calls of §2.2, in order. `<write>` is the caller's own write, not a tool. */
export const updateSetCaptureSequence = (c) => [...c.protocols.updateSetCapture];
