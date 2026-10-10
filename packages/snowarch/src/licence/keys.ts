/**
 * ARC-11-C1 — the public keys this server trusts to sign a licence or a revocation list.
 *
 * The CLI's `tools/snowarch/lib/licence/keys.mjs` is the other copy; this package imports nothing
 * from outside itself, so the list is written twice and `tools/snowarch/tests/licence-parity.test.mjs`
 * holds the two equal. Two keys by fingerprint, PRIMARY and RECOVERY (ruling R3), public halves only:
 * `tools/snowarch/tests/licence-keys-guard.test.mjs` fails on any private-key armour in this file,
 * its build or the CLI's copy.
 *
 * EMPTY UNTIL THE OWNER'S KEYGEN: the two public keys are committed here as ARC-11-C1's last code
 * commit. Until then every licence is `invalid` or `missing`, and the default is warn-only.
 */
import type { ProductKey } from './core.js';

export const PRODUCT_KEYS: readonly ProductKey[] = Object.freeze([]);
