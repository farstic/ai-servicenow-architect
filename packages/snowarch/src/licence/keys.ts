// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the public keys this server trusts to sign a licence or a revocation list.
 *
 * The CLI's `tools/snowarch/lib/licence/keys.mjs` is the other copy; this package imports nothing
 * from outside itself, so the list is written twice and `tools/snowarch/tests/licence-parity.test.mjs`
 * holds the two equal. Two keys by fingerprint, PRIMARY and RECOVERY (ruling R3), public halves only:
 * `tools/snowarch/tests/licence-keys-guard.test.mjs` fails on any private-key armour in this file,
 * its build or the CLI's copy.
 *
 * THE OWNER'S KEYS, from the owner's keygen, relayed on 2026-10-11 and committed here and in the CLI's copy as
 * ARC-11-C1's last code commit. A third key, or a replacement for either, is ARC-11-C3's key rotation.
 */
import type { ProductKey } from './core.js';

export const PRODUCT_KEYS: readonly ProductKey[] = Object.freeze([
  Object.freeze({
    role: 'primary',
    fingerprint: 'sha256:a2bffafd270c3f77b29447810dcea42933696264ddbd15f3bfeb004a81ba2e17',
    publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUYtVQBY2Mdj6Nh4R3TcznEC6tLE7HBRhkQLH6Iz+d/k=\n-----END PUBLIC KEY-----\n",
  }),
  Object.freeze({
    role: 'recovery',
    fingerprint: 'sha256:d591bb502f63090d98ec9f63c711b473210cf9c859ce9e46af642b812eaf9f3e',
    publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAP88ZSUDmY20J12+f6EfcBoU/jhJgrH4f8307TzJ6KAk=\n-----END PUBLIC KEY-----\n",
  }),
]);
