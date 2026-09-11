// ARC-06-S02 — where the repository is, and what it says about itself.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository root, from THIS FILE's location — never `process.cwd()`.
 *
 * A CLI invoked from a subdirectory must still find `engine.config.json`, the corpus and the
 * contract; resolving from the working directory would make every path depend on where the operator
 * happened to be standing. `cwd` is used for exactly one thing: telling them when it differs, so a
 * command that reports on "the repository" is not mistaken for one reporting on "here".
 */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The keys this ARC reads, validated on load so a typo fails at the edge rather than three calls in. */
const REQUIRED = [['docs', 'pin'], ['docs', 'family'], ['mcp', 'serverKey'], ['floors', 'node']];

export function loadConfig(from = root) {
  const p = join(from, 'engine.config.json');
  if (!existsSync(p)) {
    throw new Error(`engine.config.json not found at ${from} — is this a snowarch checkout?`);
  }
  const config = JSON.parse(readFileSync(p, 'utf8'));
  const missing = REQUIRED.filter(([a, b]) => config?.[a]?.[b] === undefined).map((k) => k.join('.'));
  if (missing.length > 0) {
    throw new Error(`engine.config.json is missing: ${missing.join(', ')}`);
  }
  return config;
}

/** The version of record: the root package.json, which the release script owns. */
export function version(from = root) {
  return JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')).version;
}

/**
 * The contract's sha256, computed — never stored twice.
 *
 * `dist/contract.json` is a build artefact, so a checkout that has not built has no sha and says so
 * rather than printing a stale one from somewhere else.
 */
export function contractSha(from = root) {
  const p = join(from, 'packages', 'snowarch', 'dist', 'contract.json');
  if (!existsSync(p)) return null;
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/** `undefined` when the caller is standing in the repository root; the note's text otherwise. */
export function cwdNote(cwd = process.cwd(), from = root) {
  if (resolve(cwd) === resolve(from)) return undefined;
  return `note: running against ${from} (you are in ${resolve(cwd)})`;
}
