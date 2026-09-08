#!/usr/bin/env node
/**
 * Validate `required-tools.json` against its JSON Schema. `npm run lint:contract`.
 *
 * A hand-rolled validator for the subset of draft 2020-12 the schema uses — `type`, `enum`,
 * `pattern`, `required`, `additionalProperties: false`, `items`, `minItems`, `uniqueItems`,
 * `minimum`, `minLength`, `$ref` to `#/$defs/…`. Stdlib only, because this runs in CI before
 * anything is installed and because pulling a validator in would make the schema's own
 * correctness depend on a dependency this repository otherwise does not need.
 *
 * The unit test asserts the same properties directly. That overlap is deliberate: this proves
 * the SCHEMA describes the file, the test proves the FILE is sane. A schema nobody validates
 * against is decoration, and a file nobody tests is a schema's opinion.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, 'required-tools.json'), 'utf8'));
const schema = JSON.parse(readFileSync(join(here, 'required-tools.schema.json'), 'utf8'));

const errors = [];
const fail = (path, msg) => errors.push(`${path}: ${msg}`);

function deref(node) {
  if (!node || !node.$ref) return node;
  const parts = node.$ref.replace(/^#\//, '').split('/');
  return parts.reduce((acc, k) => acc[k], schema);
}

function validate(value, node, path) {
  const s = deref(node);
  if (!s) return;

  if (s.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fail(path, 'expected an object');
    }
    for (const key of s.required ?? []) {
      if (!(key in value)) fail(path, `missing required property "${key}"`);
    }
    if (s.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (s.properties ?? {}))) fail(`${path}.${key}`, 'is not allowed by the schema');
      }
    }
    for (const [key, sub] of Object.entries(s.properties ?? {})) {
      if (key in value) validate(value[key], sub, `${path}.${key}`);
    }
    return;
  }

  if (s.type === 'array') {
    if (!Array.isArray(value)) return fail(path, 'expected an array');
    if (s.minItems !== undefined && value.length < s.minItems) {
      fail(path, `expected at least ${s.minItems} item(s), got ${value.length}`);
    }
    if (s.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      fail(path, 'items are not unique');
    }
    value.forEach((v, i) => validate(v, s.items, `${path}[${i}]`));
    return;
  }

  if (s.enum) {
    if (!s.enum.includes(value)) fail(path, `${JSON.stringify(value)} is not one of ${s.enum.join(', ')}`);
    return;
  }

  if (s.type === 'string') {
    if (typeof value !== 'string') return fail(path, 'expected a string');
    if (s.pattern && !new RegExp(s.pattern).test(value)) {
      fail(path, `${JSON.stringify(value)} does not match ${s.pattern}`);
    }
    if (s.minLength !== undefined && value.length < s.minLength) fail(path, 'is too short');
    return;
  }

  if (s.type === 'integer') {
    if (!Number.isInteger(value)) return fail(path, 'expected an integer');
    if (s.minimum !== undefined && value < s.minimum) fail(path, `must be >= ${s.minimum}`);
    return;
  }

  if (s.type === 'boolean' && typeof value !== 'boolean') fail(path, 'expected a boolean');
}

validate(doc, schema, 'required-tools');

if (errors.length > 0) {
  process.stderr.write('lint:contract — required-tools.json does not match its schema:\n');
  for (const e of errors) process.stderr.write(`  ${e}\n`);
  process.exit(1);
}

process.stdout.write(
  `lint:contract — required-tools.json valid: ${doc.tools.length} tools, `
  + `serverKey ${doc.serverKey}, sha ${doc.contractSha256.slice(0, 12)}…\n`);
