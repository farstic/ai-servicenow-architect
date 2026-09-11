import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG_NAMES } from '../../src/servicenow/context.js';

/**
 * `.env.example` and the code must agree in BOTH directions.
 *
 * P-30: the 1.x documentation described OIDC/SSO, `SNMCP_ORG_CONFIG`, `ALLOW_ANY_TABLE`, an
 * `/auth/login` endpoint and an 11-step wizard described as 5. Every one of those was true of an
 * intention and false of the code, and prose has no way to notice. Documenting a variable that
 * does nothing is the same class of defect as failing to document one that does: the first
 * wastes a reader's afternoon, the second hides a switch that changes what the server will do to
 * their instance.
 *
 * So this test reads the source rather than a list someone maintained by hand.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const ENV_EXAMPLE = resolve(HERE, '../../.env.example');

/**
 * Read by the process but not part of THIS package's contract, so not in `.env.example`.
 *
 * Each is here for a stated reason; an entry without one is how an allow-list becomes a way to
 * silence the test.
 */
const NOT_OURS = new Set([
  // Set by the operating system or the host, never by a user configuring this server.
  // `Path` and `PATHEXT` are Windows' own: `Path` is the casing Windows uses for `PATH`, and
  // `PATHEXT` is how it decides what counts as executable — both are read when locating `npm`
  // for the FLUENT check (ARC-07-S03), and documenting either in `.env.example` would invite a
  // reader to set an operating-system variable in a project file.
  //
  // `XDG_CONFIG_HOME` and the `OneDrive*` variables join them for ARC-07-S07: the first says where
  // THIS user keeps configuration on THIS machine — the global store follows it rather than
  // insisting on `~/.config` — and the OneDrive ones are set by the client when enterprise policy
  // has redirected `Documents` or `Desktop` into a synced folder, which is the only way to detect
  // that at all. Both are the operating system's to set, and a project `.env` telling a reader to
  // set either would be this package reaching outside its own contract.
  'HOME', 'USERPROFILE', 'APPDATA', 'PATH', 'Path', 'PATHEXT', 'NODE_ENV', 'NODE_EXTRA_CA_CERTS',
  'XDG_CONFIG_HOME', 'OneDrive', 'OneDriveCommercial', 'OneDriveConsumer',
  // Set by Claude Code for a project-scoped server.
  'CLAUDE_PROJECT_DIR',
  // Standard proxy variables. Documented in .env.example's prose (they are not `KEY=` lines
  // because writing `HTTPS_PROXY=` into a copied .env would SET it to the empty string, which
  // is the exact thing the sanitiser exists to undo).
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy',
  // The pre-2.0 spelling of SNOW_LOG_LEVEL, still read as a fallback so an existing environment
  // keeps working. Documented in CHANGELOG.md, deliberately not in .env.example: a new reader
  // should set SNOW_LOG_LEVEL.
  'LOG_LEVEL',
]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? walk(join(dir, e.name))
    : (e.name.endsWith('.ts') ? [join(dir, e.name)] : [])));
}

/**
 * Every environment key the source reads, however it reads it.
 *
 * Three shapes, and missing any one of them would make this test pass while the contract
 * drifted: a direct `process.env.X`, a `ProcessEnv` parameter (`env.X` — how the testable
 * helpers take it), and the `envPath('X')` / `envInt('X', …)` / `envFlag('X')` helpers, whose
 * keys are string literals the first two patterns cannot see.
 */
function keysReadBySource(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) found.add(m[1]!);
    for (const m of text.matchAll(/process\.env\[['"]([^'"]+)['"]\]/g)) found.add(m[1]!);
    for (const m of text.matchAll(/\benv\.([A-Za-z][A-Za-z0-9_]*)/g)) {
      if (/^[A-Z]/.test(m[1]!)) found.add(m[1]!);
    }
    for (const m of text.matchAll(/env(?:Path|Int|Flag)\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g)) found.add(m[1]!);
    // A fourth shape, and the one that caught two undocumented switches: the env-instance
    // loader reads its keys through a helper whose second argument is the legacy name —
    // `g('AUTH', 'SERVICENOW_AUTH_METHOD')`. No amount of `process.env.` matching sees that.
    // Any SERVICENOW_* or SN_INSTANCE_* literal in src/ is an environment key by convention
    // here, so the convention is what is scanned.
    for (const m of text.matchAll(/['"](SERVICENOW_[A-Z0-9_]+|SN_INSTANCE_[A-Z0-9_]+)['"]/g)) {
      found.add(m[1]!);
    }
  }
  // The six gates are read through `envFlag(f)` over FLAG_NAMES — a variable, not a literal, so
  // no regex can see them. Added from the exported constant, which is the same source the
  // runtime uses.
  for (const f of FLAG_NAMES) found.add(f);
  return found;
}

const documented = new Set(
  readFileSync(ENV_EXAMPLE, 'utf8')
    .split('\n')
    .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l.trim())?.[1])
    .filter((k): k is string => Boolean(k)),
);

const read = keysReadBySource();

describe('the scan itself works', () => {
  it('finds a plausible number of keys in the source', () => {
    // Without this, a regex that matched nothing would report a perfectly consistent contract.
    expect(read.size).toBeGreaterThan(15);
  });

  it('and .env.example is not empty', () => {
    expect(documented.size).toBeGreaterThan(15);
  });

  it('the six gates are among them', () => {
    for (const f of FLAG_NAMES) expect(read.has(f), `${f} not detected`).toBe(true);
  });
});

describe('every documented key is read by the code', () => {
  it('no .env.example entry does nothing', () => {
    // The P-30 direction. A key here that `src/` never reads is a promise the code does not
    // keep, and the reader has no way to find that out except by trying it.
    const dead = [...documented].filter((k) => !read.has(k)).sort();
    expect(dead, 'documented in .env.example but never read by src/').toEqual([]);
  });
});

describe('every key the code reads is documented', () => {
  it('no environment variable is undocumented', () => {
    // The other direction, and the more dangerous one: an undocumented switch that changes what
    // the server will do to an instance.
    const undocumented = [...read]
      .filter((k) => !documented.has(k) && !NOT_OURS.has(k))
      .sort();
    expect(undocumented, 'read by src/ but absent from .env.example').toEqual([]);
  });

  it('the allow-list is a decision, not a wildcard', () => {
    // What this does NOT do is assert that every allow-list entry is still read somewhere.
    //
    // That check was written, and it reported six false positives: `HOME` is reached through
    // `homedir()` rather than `process.env.HOME`; `NODE_EXTRA_CA_CERTS` and the lowercase proxy
    // names live in an array literal in `env-sanitise.ts`. The scan above is deliberately narrow
    // — it recognises four specific shapes — and a staleness check built on a narrow scan cries
    // wolf, which is how a test ends up silenced or deleted.
    //
    // So the property asserted instead is the one that can be: the list is short, explicit, and
    // every entry is spelled out above with the reason it is exempt. A wildcard would defeat
    // both directions of this suite at once.
    // A BRAKE, not a budget: the number is raised deliberately, in a commit that says which
    // entries were added and why, and never to make a red test green. ARC-07-S07 added four —
    // `XDG_CONFIG_HOME` and the three `OneDrive*` roots — each an operating-system variable this
    // package reads and must not tell a reader to set in a project `.env`.
    expect(NOT_OURS.size).toBeLessThan(24);
    for (const k of NOT_OURS) expect(k).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });
});

describe('the retired 1.x variables are gone', () => {
  it.each(['TRANSPORT', 'PORT', 'HOST', 'SNMCP_ORG_CONFIG', 'ALLOW_ANY_TABLE', 'AUDIT_ENABLED'])(
    '%s appears in neither .env.example nor src/', (key) => {
      // These described the HTTP transport, the org-config path and the audit switch of a
      // server that no longer exists (D-03). Asserted by name so a copy-paste from the old
      // documentation cannot quietly reintroduce one.
      expect(documented.has(key), `${key} is still in .env.example`).toBe(false);
      expect(read.has(key), `${key} is still read by src/`).toBe(false);
    });
});
