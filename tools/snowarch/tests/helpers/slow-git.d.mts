// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The types of `slow-git.mjs`, for the package's TypeScript tests (ARC-09-C133, ARC-11-C11): the server's
 * refresh cases use the same slowed git as the CLI's, from the one helper rather than a copy of it.
 */
export interface SlowGitOptions {
  /** A directory the caller owns and removes; the wrapper is written into it as `git`. */
  dir: string;
  /** The git subcommand that sleeps: `ls-remote`, `clone` or `show`. */
  subcommand: string;
  /** How long it sleeps, in seconds. */
  seconds: number;
  env?: Record<string, string | undefined>;
  platform?: string;
}

/** The PATH value with the slow wrapper first, or `null` on Windows, where a script cannot stand in for git. */
export declare function slowGitPath(options: SlowGitOptions): string | null;

/** Why a slow-git case cannot run here, for the skip message. */
export declare const SLOW_GIT_SKIP: string;
