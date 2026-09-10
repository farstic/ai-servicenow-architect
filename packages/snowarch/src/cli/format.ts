/**
 * ARC-07-S06 — the serializer: the ONE place a store entry becomes something a user can see.
 *
 * Masking happens HERE, in the shape, and not in the printer. A printer that masked would be one
 * of several printers — `list`, `list --json`, `test --json`, S07's `--all`, S08's import summary —
 * and the day a sixth is written is the day one of them forgets. Nothing in this module can emit
 * a password: `maskedInstance()` does not carry one, so a caller has nothing to leak.
 *
 * `maskUsername` and `maskPath` are ARC-04-S02's. There were briefly two username maskers — S05
 * wrote a second one that dropped the domain (`c***` where the store's own says `c***@corp.com`) —
 * which is exactly the drift this file exists to prevent, and it is deleted.
 */
import { maskPath, maskUsername } from '../store/paths.js';
import { completeFlags, type Store, type StoreInstance } from '../store/schema.js';
import type { LastProbe } from '../servicenow/probes.js';
import type { Flags } from '../utils/permissions.js';

/**
 * A secret, described rather than shown: `set (len 12)`.
 *
 * The LENGTH is the useful part — "did the client secret arrive whole" is the question a support
 * conversation actually asks — and it is not the secret. `not set` for an absent one, because an
 * empty field and a missing field are different states to a reader debugging an OAuth entry.
 */
export const secretNote = (secret: string | undefined): string =>
  (secret === undefined || secret === '' ? 'not set' : `set (len ${secret.length})`);

export interface MaskedInstance {
  label: string;
  url: string;
  environment: StoreInstance['environment'];
  auth: { method: StoreInstance['auth']['method']; username: string; secret: string };
  preset: StoreInstance['preset'];
  flags: Flags;
  prodWriteAck: boolean;
  lastProbe: LastProbe | null;
}

export function maskedInstance(label: string, entry: StoreInstance): MaskedInstance {
  return {
    label,
    url: entry.url,
    environment: entry.environment,
    auth: {
      method: entry.auth.method,
      username: maskUsername(entry.auth.username),
      secret: secretNote(entry.auth.password),
    },
    preset: entry.preset,
    flags: completeFlags(entry.flags),
    prodWriteAck: entry.prodWriteAck,
    lastProbe: (entry.lastProbe as LastProbe | undefined) ?? null,
  };
}

export interface ListJson {
  store: string;
  defaultInstance: string | null;
  instances: MaskedInstance[];
}

/** `list --json`. The store path is masked too: an absolute path carries the account name. */
export function listJson(storePath: string, store: Store): ListJson {
  return {
    store: maskPath(storePath),
    defaultInstance: store.defaultInstance ?? null,
    instances: Object.entries(store.instances).map(([label, entry]) => maskedInstance(label, entry)),
  };
}

export const NO_INSTANCES =
  'No instances configured. Add one with: ./snowarch instance add <label> --url https://<host>';

/** One probe as the table shows it: `auth ok · write ok · …`, or a dash when none has run. */
export function probeCell(probe: LastProbe | null): string {
  if (!probe) return '—';
  return [`auth ${probe.auth}`, `write ${probe.write}`, `scripting ${probe.scripting}`,
    `cmdb ${probe.cmdb}`, `atf ${probe.atf}`].join(' · ');
}

const HEADERS = ['LABEL', 'ENV', 'AUTH', 'PRESET', 'DEFAULT', 'USER'] as const;

/**
 * The table. Columns are as wide as their widest cell, never wider.
 *
 * The `LAST PROBE` header carries the time of the most RECENT probe in the store, because every
 * row's own time would repeat a 20-character timestamp per line to say what one header says once,
 * and a table nobody can read across is a table nobody reads.
 */
export function listTable(list: ListJson): string {
  if (list.instances.length === 0) return NO_INSTANCES;

  const rows = list.instances.map((i) => [
    i.label, i.environment, i.auth.method, i.preset,
    list.defaultInstance === i.label ? '*' : '', i.auth.username,
  ]);
  const latest = list.instances
    .map((i) => i.lastProbe?.at)
    .filter((at): at is string => typeof at === 'string')
    .sort()
    .at(-1);
  const probeHeader = latest ? `LAST PROBE (${latest})` : 'LAST PROBE';

  const width = HEADERS.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]?.length ?? 0)));
  const line = (cells: readonly string[], last: string): string =>
    `${cells.map((cell, c) => cell.padEnd(width[c] as number)).join('  ')}  ${last}`.trimEnd();

  return [line(HEADERS, probeHeader),
    ...rows.map((r, n) => line(r, probeCell(list.instances[n]?.lastProbe ?? null)))].join('\n');
}

export interface ProbesJson {
  store: string;
  instances: Record<string, LastProbe>;
}

/**
 * `test --json` and `test --all --json` — ONE envelope, whether it holds one instance or five.
 *
 * The story specifies the shape for `--all`; giving the single form a different one would make
 * ARC-06-S08's merge (`probes[label] = JSON.parse(stdout)`) depend on which flag produced the
 * output, and a consumer that has to ask "how many did I request?" before reading a result is a
 * consumer that will get it wrong once.
 */
export function probesJson(storePath: string, probes: Record<string, LastProbe>): ProbesJson {
  return { store: maskPath(storePath), instances: probes };
}
