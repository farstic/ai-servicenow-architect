// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6, the spike — the module hook that gives a SPAWNED process a fixture key, and nothing else.
 *
 * A spawned server or CLI trusts only the two keys its build ships (`PRODUCT_KEYS`), whose private
 * halves are on the owner's machine, so a test that spawns one cannot hand it a valid licence. Shape A
 * (the architect's ruling, 2026-10-12) keeps every shipped module free of a seam: this file, loaded
 * through Node's `--import` by the helper beside it, resolves the two keys modules to a fixture module
 * written for the run. Nothing under `packages/snowarch/dist/`, `tools/snowarch/lib/` or the hooks
 * reads a key from the environment, argv, `NODE_OPTIONS` or a path; the keys modules import nothing.
 *
 * It lives under the test helpers and nowhere else. A user can hook a client they run, as anyone can
 * patch one; the product offers no switch for it (C7's stated bound).
 */
let keysUrl = null;

/** The fixture keys module's URL, from the `register()` call the helper writes. */
export async function initialize(data) {
  keysUrl = data?.keysUrl ?? null;
}

/** The two keys modules, by the URL they resolve to: the server's build and the CLI's library. */
const KEYS_MODULES = [/\/packages\/snowarch\/dist\/licence\/keys\.js$/, /\/tools\/snowarch\/lib\/licence\/keys\.mjs$/];

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (keysUrl !== null && KEYS_MODULES.some((re) => re.test(resolved.url))) {
    return { url: keysUrl, format: 'module', shortCircuit: true };
  }
  return resolved;
}

/**
 * The same rule through `module.registerHooks()` (ARC-09-C271).
 *
 * Node 26 deprecates `module.register()` (DEP0205) and prints a warning on stderr at the call, in every process the hook is loaded into;
 * seven cases that read a child's stderr or its JSON failed on it on the first run of this suite under Node 26. `registerHooks` runs its hooks
 * in the same thread and synchronously, exists from Node 22.15 and 23.5, and prints nothing, so the helper uses it where it is there and keeps
 * `register()` for Node 20 and earlier 22s. The rule is one: resolve the two keys modules to the fixture module and nothing else.
 */
export function install(registerHooks, fixtureKeysUrl) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (KEYS_MODULES.some((re) => re.test(resolved.url))) return { url: fixtureKeysUrl, format: 'module', shortCircuit: true };
      return resolved;
    },
  });
}

/**
 * Which of the two APIs, chosen by what the module HAS and not by which Node it is: `registerHooks` when it is a function, `register()` only when
 * it is absent. A version test would be wrong on the next backport, and Node's own deprecation notice names the replacement, not a version.
 * `nodeModule` is `node:module`'s namespace, a parameter so a case can hand in one that has the function and one that has not.
 */
export function installHook(nodeModule, hooksUrl, fixtureKeysUrl) {
  if (typeof nodeModule.registerHooks === 'function') install(nodeModule.registerHooks, fixtureKeysUrl);
  else nodeModule.register(hooksUrl, { data: { keysUrl: fixtureKeysUrl } });
}
