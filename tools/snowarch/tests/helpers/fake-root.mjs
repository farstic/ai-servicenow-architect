// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C303 — a preload for a CHILD process in a test: `NODE_OPTIONS=--import=<this file>` and the process believes it runs as root.
//
// Only the two id questions change. Every file operation still runs as the real, unprivileged user, so a case that proves "root writes
// nothing" can never leave a root-owned file behind, and a guard that fails to hold costs a red case and not a stuck checkout. The product
// code has no seam for this: it asks `process.geteuid()`, as a real root process would be asked.
process.geteuid = () => 0;
process.getuid = () => 0;
