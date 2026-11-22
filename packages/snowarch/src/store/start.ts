// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Which instance a new session starts on (ARC-09-C308): ONE rule, so that what the server does and what the product says it does cannot differ.
 *
 * The rule is the loader's, from ARC-04-S02: the store's default instance when it is one that loads; otherwise the FIRST instance, in the order the
 * store holds them, that loads; otherwise nothing, and the server starts unconfigured. It was written inside `load()`, and two messages said something
 * else: `instance remove` of the default said the server "will start unconfigured until you run set-default" (true only when no instance is left, and then
 * set-default cannot help), and `instance set-default` said the running server picks the new default up after a reload (a reload keeps an open session
 * where it is, ARC-09-C245). The architect's ruling (2026-11-22): the behaviour stays, the messages say it, and the rule has one home that the loader, the
 * commands and the Mode line of the doctor (C309) all ask.
 *
 * NO ZOD, for the reason `label.ts` gives: the Mode line is built where nothing was installed. This module reads the permission rules only.
 *
 * "Loads" is the loader's refusal: a production instance raised above read-only without the acknowledgement does not load (`checkProdPosture`). The one
 * way an instance can fail to load that this cannot see is a client that will not build, which a store the schema accepted does not do; the test that holds
 * this module to the loader (`tests/store/start-instance.test.ts`) runs both over every shape of store it can generate.
 */
import { cliSpelling } from '../cli/tty.js';
import { applyDependencyRule, checkProdPosture, expandPreset, type Flags, type PresetName } from '../utils/permissions.js';

export interface StartCandidate {
  label: string;
  /** Whether the loader registers it. */
  loads: boolean;
}

/**
 * The label a new session starts on, from the store's default and its instances in store order; `null` when nothing loads. A default that is not in the
 * store, or does not load, is no default.
 */
export function startInstance(defaultInstance: string | null | undefined, entries: readonly StartCandidate[]): string | null {
  if (defaultInstance && entries.some((e) => e.label === defaultInstance && e.loads)) return defaultInstance;
  return entries.find((e) => e.loads)?.label ?? null;
}

/** What the loader reads of a store entry to decide whether it loads. */
export interface LoadableEntry {
  environment: string;
  preset: string;
  flags?: Partial<Record<string, string>>;
  prodWriteAck?: boolean;
}

/** The loader's refusal, asked without building a client: the same three steps `registerClient` takes (expand the preset, apply the dependency rule, check the production posture). */
export function entryLoads(label: string, entry: LoadableEntry): boolean {
  const declared = expandPreset(entry.preset as PresetName, entry.flags as Partial<Flags> | undefined);
  const { effective } = applyDependencyRule(declared, label);
  return checkProdPosture({
    label, environment: entry.environment, preset: entry.preset, effectiveFlags: effective, prodWriteAck: entry.prodWriteAck === true,
  }, cliSpelling()).ok;
}

export interface StartsOn {
  label: string;
  environment: string;
}

/** What a new session starts on for a whole store, with the environment a message names it by; `null` when nothing loads or nothing is there. */
export function startOfStore(store: { defaultInstance?: string | null; instances: Readonly<Record<string, LoadableEntry>> }): StartsOn | null {
  const entries = Object.entries(store.instances).map(([label, entry]) => ({ label, loads: entryLoads(label, entry) }));
  const label = startInstance(store.defaultInstance, entries);
  return label === null ? null : { label, environment: store.instances[label]!.environment };
}
