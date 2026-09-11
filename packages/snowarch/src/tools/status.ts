/**
 * The three tools that describe the SERVER rather than a ServiceNow instance.
 *
 * They exist because an unconfigured checkout used to show a crashed MCP server: the
 * process called `process.exit(1)` when it found no instance, so the one moment a user most
 * needs the server to explain itself was the moment it was not running (P-21). These need
 * no instance, so they stay callable in that state.
 *
 * Nothing here returns a credential. `snow_core_capabilities_read` in particular is what the
 * ARC-08 doctor diffs against the store, so it names each field explicitly rather than
 * spreading an object that happens to carry an auth block.
 */
import { instanceManager } from '../servicenow/instances.js';
import { existsSync } from 'node:fs';
import {
  envPath, globalStorePath, maskPath, projectStorePath, resolveStorePath,
} from '../store/index.js';
import { getPackageVersion } from '../utils/version.js';
import type { ErrorCodeName } from '../errors/codes.js';

/** The five tools a session has when nothing is configured. `instance_switch` is NOT among
 *  them: there is nothing to switch to, and offering it would invite an error instead of a
 *  remedy. */
export const CORE_TOOLS_UNCONFIGURED = [
  'snow_core_instances_index',
  'snow_core_instances_reload',
  'snow_core_current_instance_read',
  'snow_core_capabilities_read',
  'snow_core_status_read',
] as const;

export const NO_INSTANCE_MESSAGE =
  'No ServiceNow instance is configured for this checkout. Inside Claude Code run '
  + '/snowarch setup-instance; in a terminal run ./snowarch instance add <label>.';

/**
 * Why an instance tool is refusing, in the words of the ACTUAL reason.
 *
 * ARC-09-S06. "No instance is configured" is true whenever nothing loaded, and for a store whose
 * schema this build does not read it is the least useful true thing that can be said: the user has
 * instances, they are in the file, and the remedy is one command that the generic sentence does not
 * name. A schema `configError` therefore speaks for itself — its own code, its own message — and
 * everything else keeps the sentence it always had.
 */
export const SCHEMA_CONFIG_ERRORS = ['STORE_SCHEMA_OUTDATED', 'STORE_SCHEMA_NEWER'] as const;

export function unconfiguredRefusal(configErrors: readonly { code: string; message: string }[]):
{ code: ErrorCodeName; message: string } {
  const schema = configErrors.find((e) =>
    (SCHEMA_CONFIG_ERRORS as readonly string[]).includes(e.code));
  return schema
    ? { code: schema.code as ErrorCodeName, message: schema.message }
    : { code: 'NO_INSTANCE_CONFIGURED', message: NO_INSTANCE_MESSAGE };
}

/** Set by the server so the status tool can report the real number without importing it. */
let advertisedCount: number = CORE_TOOLS_UNCONFIGURED.length;
export function setAdvertisedCount(n: number): void { advertisedCount = n; }
export function getAdvertisedCount(): number { return advertisedCount; }

/** Set by the server; called after a reload changes the advertised set. */
let notifyToolListChanged: (() => void) | null = null;
export function setToolListChangedNotifier(fn: (() => void) | null): void { notifyToolListChanged = fn; }

/** The precedence as a reader needs to see it: the override, then the two file locations. */
export function storeCandidates(): Array<{ source: string; path: string | null; exists: boolean }> {
  const override = envPath('SNOW_STORE');
  const resolved = resolveStorePath();
  const files = override
    // With SNOW_STORE set, resolveStorePath reports only it — the other two are still the
    // places that would have been tried, so they are named here.
    ? [{ path: projectStorePath(), exists: existsSync(projectStorePath()) },
       { path: globalStorePath(), exists: existsSync(globalStorePath()) }]
    : resolved.candidates;
  return [
    { source: 'env', path: override ? maskPath(override) : null, exists: override ? existsSync(override) : false },
    { source: 'project', path: maskPath(files[0].path), exists: files[0].exists },
    { source: 'global', path: maskPath(files[1].path), exists: files[1].exists },
  ];
}

export function serverStatus(): Record<string, unknown> {
  const report = instanceManager.getReport();
  const configured = instanceManager.loadedCount() > 0;
  return {
    product: 'snowarch',
    version: getPackageVersion(),
    mode: configured ? 'configured' : 'unconfigured',
    store: {
      source: report.source,
      path: report.path,
      // All THREE places, always — including SNOW_STORE when it is unset. `resolveStorePath`
      // reports only the paths it actually probes, which is right for resolution and wrong
      // for a status read: a reader looking at "none of these exist" needs to see the whole
      // precedence, not the part of it that happened to have a path today.
      candidates: storeCandidates(),
    },
    instances: {
      loaded: report.loaded,
      notLoaded: report.notLoaded.map((n) => ({ label: n.label, code: n.code, message: n.message })),
    },
    configErrors: report.configErrors.map((e) => ({ code: e.code, message: e.message })),
    configWarnings: report.warnings,
    toolsAdvertised: advertisedCount,
    node: process.version,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    // ARC-04-S10 introduces the audit writer; until then there is no file to name, and
    // reporting a path that does not exist would be worse than reporting none.
    auditFile: null,
  };
}

export function currentCapabilities(): Record<string, unknown> {
  const report = instanceManager.getReport();
  if (instanceManager.loadedCount() === 0) {
    return {
      instance: null,
      mode: 'unconfigured',
      remedy: '/snowarch setup-instance',
      storePath: report.path,
      configErrors: report.configErrors.map((e) => ({ code: e.code, message: e.message })),
    };
  }
  const rt = instanceManager.current();
  // Field by field, deliberately. The runtime holds a constructed client, and a spread here
  // would be one refactor away from carrying the config that built it.
  return {
    instance: rt.label,
    url: rt.url,
    environment: rt.environment,
    preset: rt.preset,
    flags: { ...rt.flags },
    effectiveFlags: { ...rt.effectiveFlags },
    toolPackage: rt.toolPackage,
    maxRecords: rt.maxRecords,
    prodWriteAck: rt.prodWriteAck,
    storePath: report.path,
    configError: report.configErrors[0]
      ? { code: report.configErrors[0].code, message: report.configErrors[0].message }
      : null,
    configWarnings: rt.warnings,
  };
}

/**
 * Re-read the store. The path is RE-RESOLVED, not remembered: the common case is a user who
 * ran `./snowarch instance add` in another terminal, so the store often did not exist when
 * the server started.
 *
 * `list_changed` is sent only when the advertised SET changed size (5 ↔ full). Sending it on
 * every reload would make a client re-fetch the catalogue for nothing.
 */
export function reloadInstances(): Record<string, unknown> {
  const before = advertisedCount;
  const previousLabel = instanceManager.getCurrentName();

  const report = instanceManager.reload();
  // Keep the caller where they were if that instance still exists; otherwise the store's
  // own default, which `load()` has already applied.
  if (report.loaded.includes(previousLabel)) instanceManager.switch(previousLabel);

  const after = instanceManager.loadedCount() === 0
    ? CORE_TOOLS_UNCONFIGURED.length
    : fullCatalogueSize();
  setAdvertisedCount(after);

  let listChangedSent = false;
  if (before !== after && notifyToolListChanged) {
    notifyToolListChanged();
    listChangedSent = true;
  }

  return {
    action: 'reloaded',
    source: report.source,
    path: report.path,
    loaded: report.loaded,
    notLoaded: report.notLoaded.map((n) => ({ label: n.label, code: n.code, message: n.message })),
    configErrors: report.configErrors.map((e) => ({ code: e.code, message: e.message })),
    configWarnings: report.warnings,
    toolsAdvertised: after,
    listChangedSent,
  };
}

/** Injected by the server to avoid a cycle: tools/index.ts imports this module. */
let fullSize = 0;
export function setFullCatalogueSize(n: number): void { fullSize = n; }
export function fullCatalogueSize(): number { return fullSize; }
