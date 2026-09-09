/**
 * The store's default-instance LABEL, and nothing else.
 *
 * `.local/config.json` mirrors the label so the doctor and the launchers can name the configured
 * instance without opening the credential store. Two constraints shaped this into its own module:
 *
 *   NO ZOD. `index.ts` validates through a schema, and the schema package only exists after B04's
 *   `npm ci`. B07 runs in a design-only checkout that never installs anything, so a reader that
 *   imported the validator could not run at all there.
 *
 *   NO SECRETS, BY CONSTRUCTION. This returns one string. It does not read, copy or return a URL,
 *   a username or a credential, and a test asserts the returned object has exactly one key — so a
 *   later "while we're here, also return the instance URL" has to argue with a test rather than
 *   slip in.
 *
 * The store remains authoritative: this is a mirror, and ARC-07's `set-default` re-mirrors it.
 */
import { readFileSync } from 'node:fs';

export interface DefaultLabel {
  label: string;
}

/**
 * `{ label }` when the store names a default, `null` otherwise — including when the file is
 * missing or malformed. A mirror that threw would make an unreadable store fail a step whose job
 * is unrelated to it; the store's own reader reports that, with its own diagnosis.
 */
export function readDefaultLabel(storePath: string): DefaultLabel | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(storePath, 'utf8'));
  } catch {
    return null;
  }
  const value = (parsed as { defaultInstance?: unknown } | null)?.defaultInstance;
  return typeof value === 'string' && value.length > 0 ? { label: value } : null;
}
