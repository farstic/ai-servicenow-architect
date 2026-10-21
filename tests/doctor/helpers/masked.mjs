// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C208 — the masked-token pattern, defined once for every test that reads a report for one. Its self-test stays
// in printed-keys.test.mjs. It imports nothing, so CI's no-install step can load every file that uses it.

/** A masked dotted token as `redact` prints one. Not `\b…\b`: after `***` there is no word boundary to match. */
export const MASKED = /\b[A-Za-z]\*{3}\.[A-Za-z]\*{3}(?![\w*])/;
