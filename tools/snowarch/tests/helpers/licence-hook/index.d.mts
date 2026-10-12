// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The types of `index.mjs`, for the package's TypeScript tests (ARC-11-C6 step 1): a server test starts the
 * server through `licensedEnv()` as an engine test does, from the one helper rather than a copy of it.
 */
export interface FixtureKeysHook {
  keysUrl: string;
  registerUrl: string;
  importArgs: string[];
  nodeOptions: string;
}

export interface ProductKey {
  role: string;
  fingerprint: string;
  publicKey: string;
}

export interface LicenceFixture {
  primary: { publicKey: string; privateKey: string };
  keys: ProductKey[];
  hook: FixtureKeysHook;
}

export interface LicensedEnvOptions {
  /** A root the child reads `.local/licence.json` from, beside SNOWARCH_STATE_ROOT and CLAUDE_PROJECT_DIR. */
  root?: string;
  /** `false` writes no licence; an object replaces fields of the fixture's. */
  licence?: false | Record<string, string | undefined>;
}

export declare const FIXTURE_LICENCE: Readonly<Record<string, string>>;

export declare function fixtureKeysHook(dir: string, keys: readonly ProductKey[]): FixtureKeysHook;

export declare function licenceFixture(): LicenceFixture;

export declare function fixtureLicenceText(over?: Record<string, string | undefined>): string;

export declare function licensedEnv(
  env?: Record<string, string | undefined>,
  options?: LicensedEnvOptions,
): Record<string, string>;
