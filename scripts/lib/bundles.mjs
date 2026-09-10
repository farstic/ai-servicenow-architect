/**
 * `ROLE_BUNDLE_MAP`, read from the BUILT module as data rather than imported as code.
 *
 * Importing `packages/snowarch/dist/tools/index.js` loads the whole tool tree and, with it, the
 * server's runtime dependencies — so `node scripts/gen-readme-tables.mjs` died with
 * `ERR_MODULE_NOT_FOUND` on any clone where `npm ci` had not run, which is every fresh clone and
 * every design-only install. A generator that cannot run on a fresh clone cannot be part of
 * `npm run lint` there, and the doctor's E-21 reported the crash as "the README differs".
 *
 * The bundle map is a literal of string arrays. Reading it as text needs no dependency at all, and
 * the risk it carries — a build whose formatting changes silently breaks the parse — is answered
 * two ways: an unparsable file THROWS with the file named rather than returning an empty map, and
 * `tests/gen-readme-tables.test.mjs` compares this reading against the imported module wherever the
 * dependencies are installed. So CI, which has them, is what notices a drift.
 *
 * The contract would be the better home for this, and `dist/contract.json` does not carry it today
 * — adding it moves the contract sha, which is a deliberate pin bump and a maintainer's decision,
 * not a fix's.
 */
import { readFileSync } from 'node:fs';

const OPEN = 'export const ROLE_BUNDLE_MAP';

export class BundleMapError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BundleMapError';
  }
}

/**
 * The `{ name: [tool, …] }` literal, from the text of the built module.
 *
 * Scans from the declaration to its matching `}` by counting braces — a regex for the whole
 * literal would stop at the first `}` inside it — and then normalises the JavaScript that JSON
 * does not accept: single quotes, unquoted keys and trailing commas. Nothing else is allowed
 * through: anything the normaliser does not recognise fails the `JSON.parse` below, loudly.
 */
export function parseBundleMap(text, where = '<inline>') {
  const start = text.indexOf(OPEN);
  if (start === -1) throw new BundleMapError(`${where}: no "${OPEN}" declaration`);
  const open = text.indexOf('{', start);
  if (open === -1) throw new BundleMapError(`${where}: ROLE_BUNDLE_MAP has no object literal`);

  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    } else if (ch === "'" || ch === '"') {
      // Skip the string, so a brace inside a tool name could never close the literal.
      const quote = ch;
      i += 1;
      while (i < text.length && text[i] !== quote) i += (text[i] === '\\' ? 2 : 1);
    }
  }
  if (end === -1) throw new BundleMapError(`${where}: ROLE_BUNDLE_MAP literal is not closed`);

  const literal = text.slice(open, end + 1)
    .replace(/\/\/[^\n]*/g, '')             // line comments
    .replace(/'([^'\\]*)'/g, '"$1"')        // single-quoted strings
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')   // unquoted keys
    .replace(/,(\s*[}\]])/g, '$1');         // trailing commas

  let parsed;
  try {
    parsed = JSON.parse(literal);
  } catch (e) {
    throw new BundleMapError(`${where}: ROLE_BUNDLE_MAP did not parse as data — ${e.message}. `
      + 'The built module\'s shape changed; see scripts/lib/bundles.mjs.');
  }
  for (const [name, list] of Object.entries(parsed)) {
    if (!Array.isArray(list) || list.some((t) => typeof t !== 'string')) {
      throw new BundleMapError(`${where}: bundle "${name}" is not a list of tool names`);
    }
  }
  return parsed;
}

/** The map from a file path. */
export const readBundleMap = (file) => parseBundleMap(readFileSync(file, 'utf8'), file);
