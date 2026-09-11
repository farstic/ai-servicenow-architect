#!/usr/bin/env node
// ARC-03-S03 → ARC-06-S02: a shim, not a second implementation.
//
// The dispatch moved to `tools/snowarch/lib/docs/cli.mjs` when the `snowarch` CLI mounted `docs`.
// This file keeps its name and its exit codes because CI, the npm scripts and the two workflows
// call it by path — and `./snowarch docs …` now runs exactly the same function. A test asserts the
// two entry points agree, so they cannot drift into two behaviours with one name.
import { runDocs } from '../tools/snowarch/lib/docs/cli.mjs';

process.exit(runDocs(process.argv.slice(2)));
