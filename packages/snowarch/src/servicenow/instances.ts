/**
 * The instance manager: one store, one precedence, and a report of what happened.
 *
 * Before ARC-04-S02 there were four configuration sources and the legacy wizard store
 * returned EARLY, overriding env-defined instances — the override was documented by a
 * test rather than intended (P-21). Now there is one store module, one precedence, and
 * `load()` returns a LoadReport so the caller can say what was loaded, what was refused
 * and why, instead of the server guessing from an empty instance map.
 *
 * Flag SEMANTICS — how a flag gates a tool — are ARC-04-S03. This module only loads.
 */
import { ServiceNowClient } from './client.js';
import type { ServiceNowConfig } from './types.js';
import {
  completeFlags, loadStore, maskPath, resolveStorePath,
  type FlagName, type StoreError, type StoreInstance, type StoreSource,
} from '../store/index.js';

export interface InstanceEntry {
  name: string;
  url: string;
  group: string;
  environment: string;
  preset: string;
  flags: Record<FlagName, 'true' | 'false'>;
  maxRecords: number;
  prodWriteAck: boolean;
  client: ServiceNowClient;
}

export interface LoadReport {
  /** Where the configuration came from. `env-instances` means the SERVICENOW_ and SN_INSTANCE_
   *  variables, which is a different thing from SNOW_STORE (that is `source: 'env'`). */
  source: StoreSource | 'env-instances';
  /** Masked — this string goes to a log. */
  path: string | null;
  loaded: string[];
  notLoaded: Array<{ label: string; code: string; message: string }>;
  configErrors: StoreError[];
  /** Non-fatal: the store loaded, but something about it is worth saying out loud. */
  warnings: string[];
  notes: string[];
}

const ENV_FLAGS: FlagName[] = [
  'WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED',
  'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED',
];

/** Byte-exact "true". Anything else — including "TRUE", "1", "yes" — is false, as it always was. */
function envFlag(name: string): 'true' | 'false' {
  return process.env[name] === 'true' ? 'true' : 'false';
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

class InstanceManager {
  private instances: Map<string, InstanceEntry> = new Map();
  private currentName = 'default';
  private report: LoadReport = { source: 'none', path: null, loaded: [], notLoaded: [], configErrors: [], warnings: [], notes: [] };

  constructor() {
    this.load();
  }

  /** Idempotent: clears and reloads. Returns the report rather than logging it, so the
   *  caller decides what reaches stdout — this process shares stdout with JSON-RPC. */
  load(): LoadReport {
    this.instances.clear();
    this.currentName = 'default';
    this.report = { source: 'none', path: null, loaded: [], notLoaded: [], configErrors: [], warnings: [], notes: [] };

    // Env-defined instances win outright and the store is not read. This is the CI and
    // automation path; a user who has both is told which one is in effect.
    const envLabels = this.envInstanceLabels();
    if (envLabels.length > 0) {
      const resolved = resolveStorePath();
      this.report.source = 'env-instances';
      this.report.path = resolved.path ? maskPath(resolved.path) : null;
      for (const label of envLabels) this.registerFromEnv(label);
      if (resolved.path) {
        this.report.notes.push(
          `instance source: env (SERVICENOW_*/SN_INSTANCE_*); store ignored: ${maskPath(resolved.path)}`);
      } else {
        this.report.notes.push('instance source: env (SERVICENOW_*/SN_INSTANCE_*); no store present');
      }
      return this.report;
    }

    const resolved = resolveStorePath();
    this.report.source = resolved.source;
    this.report.path = resolved.path ? maskPath(resolved.path) : null;

    if (resolved.source === 'none') {
      this.report.notes.push(
        `store: none (${resolved.candidates.map((c) => `${maskPath(c.path)} missing`).join('; ')})`);
      return this.report;
    }

    const result = loadStore(resolved.path as string);
    if ('error' in result) {
      // SNOW_STORE is explicit: a missing file is an error, never a reason to try the
      // next candidate — otherwise a typo in the override silently loads another instance.
      //
      // The message arrives already masked. It used to be masked HERE, with maskPath over
      // the whole sentence — which masks a leading path and nothing else, so the remedy
      // after `Run:` kept the raw home directory all the way into the log.
      this.report.configErrors.push(result.error);
      return this.report;
    }
    if (result.warning) this.report.warnings.push(result.warning);

    for (const [label, inst] of Object.entries(result.store.instances)) {
      try {
        this.register(label, inst);
        this.report.loaded.push(label);
      } catch (e) {
        this.report.notLoaded.push({ label, code: 'INSTANCE_UNUSABLE', message: (e as Error).message });
      }
    }
    const preferred = result.store.defaultInstance;
    if (preferred && this.instances.has(preferred)) this.currentName = preferred;
    else if (this.report.loaded.length > 0) this.currentName = this.report.loaded[0];
    return this.report;
  }

  getReport(): LoadReport {
    return this.report;
  }

  private envInstanceLabels(): string[] {
    const named = Object.keys(process.env)
      .filter((k) => /^SN_INSTANCE_[A-Z0-9_]+_URL$/.test(k) && process.env[k])
      .map((k) => k.replace(/^SN_INSTANCE_/, '').replace(/_URL$/, '').toLowerCase());
    if (process.env.SERVICENOW_INSTANCE_URL) named.push('default');
    return [...new Set(named)];
  }

  private registerFromEnv(label: string): void {
    const upper = label.toUpperCase();
    const isLegacy = label === 'default' && !process.env[`SN_INSTANCE_${upper}_URL`];
    const g = (suffix: string, legacy: string): string | undefined =>
      (isLegacy ? process.env[legacy] : process.env[`SN_INSTANCE_${upper}_${suffix}`]);

    const url = isLegacy ? process.env.SERVICENOW_INSTANCE_URL : process.env[`SN_INSTANCE_${upper}_URL`];
    if (!url) return;
    const method = (g('AUTH', 'SERVICENOW_AUTH_METHOD') || 'basic') === 'oauth' ? 'oauth' : 'basic';

    const flags = {} as Record<FlagName, 'true' | 'false'>;
    for (const f of ENV_FLAGS) flags[f] = envFlag(f);

    this.registerClient(label, {
      instanceUrl: url,
      authMethod: method,
      basic: {
        username: g('USERNAME', 'SERVICENOW_BASIC_USERNAME'),
        password: g('PASSWORD', 'SERVICENOW_BASIC_PASSWORD'),
      },
      oauth: {
        clientId: g('CLIENT_ID', 'SERVICENOW_OAUTH_CLIENT_ID'),
        clientSecret: g('CLIENT_SECRET', 'SERVICENOW_OAUTH_CLIENT_SECRET'),
        username: g('USERNAME', 'SERVICENOW_OAUTH_USERNAME'),
        password: g('PASSWORD', 'SERVICENOW_OAUTH_PASSWORD'),
      },
      maxRetries: envInt('MAX_RETRIES', 3),
      retryDelayMs: envInt('RETRY_DELAY_MS', 1000),
      requestTimeoutMs: envInt('REQUEST_TIMEOUT_MS', 30000),
    }, {
      environment: process.env[`SN_INSTANCE_${upper}_ENVIRONMENT`] ?? 'dev',
      preset: 'custom',
      flags,
      maxRecords: envInt('MAX_RECORDS', 100),
      prodWriteAck: process.env[`SN_INSTANCE_${upper}_PROD_WRITE_ACK`] === 'true',
    });
    this.report.loaded.push(label);
    if (this.instances.size === 1) this.currentName = label;
  }

  private register(label: string, inst: StoreInstance): void {
    this.registerClient(label, {
      instanceUrl: inst.url,
      authMethod: inst.auth.method === 'oauth_ropc' ? 'oauth' : 'basic',
      basic: inst.auth.method === 'basic'
        ? { username: inst.auth.username, password: inst.auth.password }
        : { username: undefined, password: undefined },
      oauth: inst.auth.method === 'oauth_ropc'
        ? { clientId: inst.auth.clientId, clientSecret: inst.auth.clientSecret,
            username: inst.auth.username, password: inst.auth.password }
        : { clientId: undefined, clientSecret: undefined, username: undefined, password: undefined },
      maxRetries: envInt('MAX_RETRIES', 3),
      retryDelayMs: envInt('RETRY_DELAY_MS', 1000),
      requestTimeoutMs: envInt('REQUEST_TIMEOUT_MS', 30000),
    }, {
      environment: inst.environment,
      preset: inst.preset,
      flags: completeFlags(inst.flags),
      maxRecords: inst.maxRecords,
      prodWriteAck: inst.prodWriteAck,
    });
  }

  private registerClient(
    name: string,
    config: ServiceNowConfig,
    meta: { environment: string; preset: string; flags: Record<FlagName, 'true' | 'false'>; maxRecords: number; prodWriteAck: boolean },
  ): void {
    this.instances.set(name, {
      name,
      url: config.instanceUrl,
      group: 'Default',
      ...meta,
      client: new ServiceNowClient(config),
    });
  }

  /** Return client for named instance (or current instance if no name given). */
  getClient(name?: string): ServiceNowClient {
    const target = name ? name.toLowerCase() : this.currentName;
    const entry = this.instances.get(target);
    if (!entry) {
      const available = this.listNames();
      throw new Error(available.length === 0
        ? 'No ServiceNow instance is configured. Run: snowarch instance add <label>'
        : `Unknown instance "${target}". Available: ${available.join(', ')}`);
    }
    return entry.client;
  }

  /** Reload from disk — after the wizard or the doctor writes the store. */
  reload(): LoadReport {
    return this.load();
  }

  switch(name: string): void {
    const lower = name.toLowerCase();
    if (!this.instances.has(lower)) {
      throw new Error(`Unknown instance "${name}". Available: ${this.listNames().join(', ')}`);
    }
    this.currentName = lower;
  }

  getCurrentName(): string { return this.currentName; }
  getCurrentUrl(): string { return this.instances.get(this.currentName)?.url || ''; }
  getEntry(name?: string): InstanceEntry | undefined { return this.instances.get(name ?? this.currentName); }
  listNames(): string[] { return Array.from(this.instances.keys()); }

  listAll(): Array<{ name: string; url: string; active: boolean; group: string; environment: string }> {
    return Array.from(this.instances.values()).map((e) => ({
      name: e.name, url: e.url, active: e.name === this.currentName,
      group: e.group, environment: e.environment,
    }));
  }
}

export const instanceManager = new InstanceManager();
