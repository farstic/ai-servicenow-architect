// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The types of `fixture-git.mjs`, for the package's TypeScript tests (ARC-09-C220): the server's fixtures make their
 * repositories with git's automatic maintenance and automatic gc off, from the one helper rather than a copy of it.
 */

/** The settings every fixture repository carries, as `[key, value]` pairs. */
export declare const FIXTURE_GIT_CONFIG: ReadonlyArray<readonly [string, string]>;

/** `git init <initArgs> <dir>` through `git(args)`, then the fixture settings in the new repository; returns `dir`. */
export declare function initFixtureRepo(git: (args: string[]) => unknown, dir: string, initArgs: string[]): string;
