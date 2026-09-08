// ARC-01-S04 — engine.config.json is the single home of the product's constants.
// Three kinds of check, deliberately separated:
//   1. shape      — the file matches its own JSON Schema (Ajv 2020, strict)
//   2. reality    — the values agree with what is actually on disk
//   3. negatives  — the schema REJECTS the mistakes it exists to catch, exercised on
//                   in-memory mutated copies so they run in CI and not only by hand
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const config = read('engine.config.json');
const schema = read('engine.config.schema.json');

const ajv = new Ajv({ strict: true, allErrors: true });
const validate = ajv.compile(schema);
const errorsFor = (obj) => (validate(obj) ? [] : validate.errors);
const paths = (errs) => errs.map((e) => e.instancePath || '/');

// ---------- 1. shape ----------
test('engine.config.json validates against its schema', () => {
  const errs = errorsFor(config);
  assert.deepEqual(errs, [], `Ajv: ${JSON.stringify(errs, null, 2)}`);
});

test('every constant 01 section 3 names for this file resolves to a key', () => {
  // Read from the object, never from prose -- criterion 5.
  const required = {
    'product name': config.product,
    'server key': config.mcp?.serverKey,
    'floor: claude': config.floors?.claudeCode,
    'floor: node': config.floors?.node,
    'floor: git': config.floors?.git,
    'docs family': config.docs?.family,
    'docs pin': config.docs?.pin,
    'roster skills': config.roster?.skills,
    'roster agents': config.roster?.agents,
  };
  for (const [name, value] of Object.entries(required)) {
    assert.ok(value !== undefined && value !== null && value !== '', `${name} is missing`);
  }
});

test('no retired name survives in the config', () => {
  assert.equal(readFileSync(join(root, 'engine.config.json'), 'utf8').includes('snow-mcp'), false);
});

// ---------- 2. reality ----------
test('mcp.packageDir exists and its package.json name equals mcp.package', () => {
  const dir = config.mcp.packageDir;
  assert.ok(existsSync(join(root, dir)), `${dir} does not exist`);
  assert.equal(read(`${dir}/package.json`).name, config.mcp.package);
});

test('roster counts equal the files on disk', () => {
  // `roster.skills` counts PERSONAS. A utility skill — `/snowarch`, which is tooling rather than a
  // specialist — is a directory on disk and not a roster row, so it is excluded here exactly as it
  // is excluded by the skills lint and by the roster generator. One source: `roster.utility`.
  const utility = new Set(config.roster.utility ?? []);
  const skillDirs = readdirSync(join(root, '.claude/skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, '.claude/skills', e.name, 'SKILL.md')))
    .map((e) => e.name);
  const skills = skillDirs.filter((d) => !utility.has(d)).length;
  const agents = readdirSync(join(root, '.claude/agents'))
    .filter((f) => f.endsWith('.md')).length;
  assert.equal(skills, config.roster.skills, 'roster.skills disagrees with .claude/skills/*/SKILL.md');
  assert.equal(agents, config.roster.agents, 'roster.agents disagrees with .claude/agents/*.md');

  // The negative: a utility name with no directory would silently lower the persona count, which
  // is the one way this exclusion can be used to hide a missing skill rather than to classify one.
  for (const name of utility) {
    assert.ok(skillDirs.includes(name),
      `roster.utility names "${name}", which is not a skill directory — it excludes nothing and lowers nothing`);
  }
});

test('docs.pin equals the vendor/ServiceNowDocs gitlink', (t) => {
  // ARC-03 creates the gitlink. Until then this is reported as skipped WITH THE REASON, rather
  // than silently passing -- a check that passes because its subject is absent is not a check.
  let line = '';
  try {
    line = execFileSync('git', ['ls-files', '-s', 'vendor/ServiceNowDocs'], { cwd: root, encoding: 'utf8' }).trim();
  } catch { /* not a git checkout; treated the same as "no gitlink" */ }
  if (!line) return t.skip('no gitlink yet (ARC-03 creates vendor/ServiceNowDocs)');
  const sha = line.split(/\s+/)[1];
  assert.equal(sha, config.docs.pin, 'the committed gitlink and docs.pin disagree');
});

// ---------- 3. negatives: the schema must REJECT these ----------
const mutate = (fn) => { const c = structuredClone(config); fn(c); return c; };

test('a server key with a space is rejected, and the error names /mcp/serverKey', () => {
  const errs = errorsFor(mutate((c) => { c.mcp.serverKey = 'service now'; }));
  assert.notEqual(errs.length, 0, 'a space in serverKey was accepted');
  assert.ok(paths(errs).includes('/mcp/serverKey'), `expected /mcp/serverKey, got ${paths(errs)}`);
});

test('a short docs pin is rejected, and the error names /docs/pin', () => {
  const errs = errorsFor(mutate((c) => { c.docs.pin = 'ba513f2'; }));
  assert.notEqual(errs.length, 0, 'a 7-character pin was accepted');
  assert.ok(paths(errs).includes('/docs/pin'), `expected /docs/pin, got ${paths(errs)}`);
});

test('an unknown top-level key is rejected', () => {
  const errs = errorsFor(mutate((c) => { c.tier = 2; }));
  assert.notEqual(errs.length, 0, 'an unknown top-level key was accepted');
  assert.ok(errs.some((e) => e.keyword === 'additionalProperties'), 'not rejected by additionalProperties');
});

test('additionalProperties is enforced at every level, not only the top', () => {
  for (const [path, fn] of [
    ['/mcp',    (c) => { c.mcp.extra = 1; }],
    ['/floors', (c) => { c.floors.extra = 1; }],
    ['/docs',   (c) => { c.docs.extra = 1; }],
    ['/roster', (c) => { c.roster.extra = 1; }],
  ]) {
    const errs = errorsFor(mutate(fn));
    assert.ok(errs.some((e) => e.keyword === 'additionalProperties' && e.instancePath === path),
      `${path} accepted an unknown key`);
  }
});

test('a floor that is not x.y.z is rejected', () => {
  for (const bad of ['2.1', 'v2.1.214', '2.1.214-beta']) {
    const errs = errorsFor(mutate((c) => { c.floors.claudeCode = bad; }));
    assert.notEqual(errs.length, 0, `floor "${bad}" was accepted`);
  }
});

test('a docs family outside the release-family enum is rejected', () => {
  const errs = errorsFor(mutate((c) => { c.docs.family = 'main'; }));
  assert.notEqual(errs.length, 0, '"main" was accepted as a release family');
  assert.ok(paths(errs).includes('/docs/family'));
});

test('a missing required key is rejected', () => {
  const errs = errorsFor(mutate((c) => { delete c.floors.git; }));
  assert.ok(errs.some((e) => e.keyword === 'required'), 'a missing floor was accepted');
});
