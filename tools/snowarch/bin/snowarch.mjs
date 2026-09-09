#!/usr/bin/env node
// ARC-06-S02 — the entry point. Everything it does is in `lib/`; this file exists to be executable.
import { main } from '../lib/cli.mjs';

// `process.exitCode`, not `process.exit()`: an explicit exit truncates stdout when it is a pipe,
// which is how a `--json` object reaches a caller cut in half.
process.exitCode = await main(process.argv.slice(2));
