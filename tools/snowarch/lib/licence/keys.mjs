/**
 * ARC-11-C1 — the public keys this product trusts to sign a licence or a revocation list.
 *
 * TWO KEYS, by fingerprint (ruling R3): the PRIMARY signs day to day, and the RECOVERY key, kept
 * offline, signs when the primary is lost — so the creator always has a way back in. Each entry is
 * `{ role, fingerprint, publicKey }`; `fingerprint` is `sha256:` and the hex digest of the key's DER
 * SubjectPublicKeyInfo, which is what `./snowarch licence show` prints and the owner reads aloud.
 *
 * EMPTY UNTIL THE OWNER'S KEYGEN. The owner runs `./snowarch licence keygen` outside the checkout and
 * relays the two PUBLIC keys; they are committed here and in the server's copy as ARC-11-C1's last
 * code commit. Until then every licence is `invalid` or `missing` and the default is warn-only, so
 * nothing is refused anywhere.
 *
 * PUBLIC KEYS ONLY. A private key never enters this repository; `tools/snowarch/tests/licence-keys-guard.test.mjs`
 * fails on any private-key armour here and holds the count to the two keys. The server's copy is
 * `packages/snowarch/src/licence/keys.ts`, held equal to this one by `tools/snowarch/tests/licence-parity.test.mjs`.
 */
export const PRODUCT_KEYS = Object.freeze([]);
