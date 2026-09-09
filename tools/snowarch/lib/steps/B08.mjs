// B08 verify — start the server the way Claude Code will, and check what it says against the pin.
//
// Everything before this step is preparation; this is the first moment the product is actually
// exercised. It matters that the server is SPAWNED rather than imported: the failures worth
// catching are the child's — a cold start slower than `MCP_TIMEOUT`, a `dist/` that does not match
// the contract, an `SNOW_STORE` in the operator's shell pointing somewhere else — and none of them
// reproduce in-process.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { contractSha, version as engineVersion } from '../config.mjs';
import { writeDoctorCache } from '../doctor-cache.mjs';
import { HandshakeError, handshake, serverCommand } from '../mcp-handshake.mjs';
import { TEXT } from './inputs.mjs';

export const id = 'B08';
export const title = 'verify';
export const needsNode = true;
export const runsWhen = (ctx) => ctx.mode === 'live';
export const skipReason = 'design-only';

export const NO_INSTANCE =
  'no instance configured — run ./snowarch instance add or /snowarch setup-instance';
export const PROBES_UNAVAILABLE = 'probes: not available in this build';

export function storeMtime(root) {
  const p = join(root, '.local', 'instances.json');
  return existsSync(p) ? String(statSync(p).mtimeMs) : 'none';
}

export const inputs = (ctx) => [
  TEXT(`contract=${contractSha(ctx.root) ?? 'not-built'}`),
  TEXT(`storeMtime=${storeMtime(ctx.root)}`),
  TEXT(`mode=${ctx.mode}`),
];

export const timeoutSentence = (ms) =>
  `server did not answer initialize within ${ms} ms — cold start too slow for MCP_TIMEOUT; `
  + 'see docs/TROUBLESHOOTING.md "MCP_TIMEOUT"';

export const differentStore = (masked) =>
  `server sees a different store than the bootstrap wrote (${masked}) — SNOW_STORE set in your shell?`;

/**
 * The three comparisons, as sentences.
 *
 * Subset both ways, and they catch opposite mistakes: a tool the server advertises that the
 * contract does not know means `dist/` is ahead of the pin; a pinned tool the server does not
 * advertise means the governance texts cite something nobody can call — so that one names the
 * `used_by` entries, because those are the files that will break.
 */
export function compareTools({ advertised, contract, pin, configured, coreTools }) {
  const known = new Set(contract.tools.map((t) => t.name));
  const problems = [];

  const unknown = advertised.filter((n) => !known.has(n));
  if (unknown.length > 0) {
    problems.push(`server advertises "${unknown[0]}" which is not in the pinned contract — `
      + 'dist/ and contract out of sync');
  }

  if (configured) {
    const have = new Set(advertised);
    const missing = (pin.tools ?? []).filter((t) => !have.has(t.name));
    if (missing.length > 0) {
      const first = missing[0];
      problems.push(`server does not advertise "${first.name}", which the engine pins for `
        + `${(first.used_by ?? []).join(', ') || 'an unrecorded consumer'}`);
    }
    if (advertised.length !== contract.tools.length) {
      problems.push(`server advertises ${advertised.length} tools, the contract has `
        + `${contract.tools.length} — dist/ and contract out of sync`);
    }
  } else if (coreTools) {
    // Unconfigured is a DIFFERENT expectation, not a relaxed one: S-17 says exactly the core set,
    // and a server advertising more without a store would be offering tools it cannot serve.
    const expected = [...coreTools].sort();
    const got = [...advertised].sort();
    if (expected.join() !== got.join()) {
      problems.push(`unconfigured server advertises ${got.length} tools, expected the `
        + `${expected.length} core tools`);
    }
  }
  return problems;
}

/** The capabilities tool's answer must describe the store the bootstrap just wrote. */
export function compareCapabilities(capabilities, entry, label) {
  if (!capabilities || !entry) return [];
  const problems = [];
  const seen = capabilities.instance ?? capabilities;
  if (seen.label !== undefined && seen.label !== label) {
    problems.push(`server reports instance "${seen.label}", the store's default is "${label}"`);
  }
  for (const key of ['environment', 'preset']) {
    if (seen[key] !== undefined && seen[key] !== entry[key]) {
      problems.push(`server reports ${key} "${seen[key]}", the store says "${entry[key]}"`);
    }
  }
  const flags = seen.flags ?? {};
  for (const [name, value] of Object.entries(entry.flags ?? {})) {
    if (flags[name] !== undefined && String(flags[name]) !== String(value)) {
      problems.push(`server reports ${name}=${flags[name]}, the store says ${value}`);
    }
  }
  return problems;
}

/** `instance list --json`, then `instance test <label> --json` — or the graceful absence. */
export function runProbes(root, { run = spawnSync } = {}) {
  const cli = join(root, 'packages', 'snowarch', 'dist', 'cli', 'index.js');
  if (!existsSync(cli)) return { status: 'unavailable', probes: null };

  const help = run(process.execPath, [cli, 'instance', '--help'],
    { encoding: 'utf8', stdio: 'pipe', cwd: root });
  // ARC-07-S06 adds `instance test`. Until it does, the cache records "unavailable" and the step
  // warns: a probe that does not exist yet is not a failed probe, and calling it a FAIL would stop
  // installations for a feature nobody has promised yet.
  if (!/\btest\b/.test(`${help.stdout ?? ''}${help.stderr ?? ''}`)) {
    return { status: 'unavailable', probes: null };
  }

  const list = run(process.execPath, [cli, 'instance', 'list', '--json'],
    { encoding: 'utf8', stdio: 'pipe', cwd: root });
  let labels = [];
  try { labels = (JSON.parse(list.stdout ?? '[]').instances ?? []).map((i) => i.label); } catch { /* none */ }

  const probes = {};
  for (const label of labels) {
    const out = run(process.execPath, [cli, 'instance', 'test', label, '--json'],
      { encoding: 'utf8', stdio: 'pipe', cwd: root });
    try { probes[label] = JSON.parse(out.stdout ?? '{}'); } catch { probes[label] = { error: 'unparsable' }; }
  }
  return { status: 'ok', probes };
}

export const run = async (ctx) => {
  const root = ctx.root;
  const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'));
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  const contract = JSON.parse(readFileSync(join(root, 'packages/snowarch/dist/contract.json'), 'utf8'));
  const pin = JSON.parse(readFileSync(join(root, 'packages/contract/required-tools.json'), 'utf8'));
  const timeoutMs = Number(settings.env?.MCP_TIMEOUT ?? 120_000);

  const cmd = serverCommand({ mcp, serverKey: ctx.config.mcp.serverKey, root, env: ctx.env });

  // The store, read through the module rather than parsed here — and only the label and the fields
  // the capabilities tool returns. No URL, no username, ever.
  let entry = null;
  let label = null;
  const storePath = join(root, '.local', 'instances.json');
  if (existsSync(storePath)) {
    const { loadStore } = await import('../../../../packages/snowarch/dist/store/index.js');
    const loaded = loadStore(storePath);
    const store = loaded?.store ?? loaded;
    label = store?.defaultInstance ?? Object.keys(store?.instances ?? {})[0] ?? null;
    entry = label ? store.instances[label] : null;
  }
  const configured = Boolean(entry);

  let result;
  try {
    result = await handshake({
      ...cmd, cwd: root, timeoutMs,
      protocolVersion: ctx.protocolVersion ?? await latestProtocolVersion(root),
      clientVersion: engineVersion(root),
      live: configured,
      capabilityTool: ctx.capabilityTool ?? 'snow_core_capabilities_read',
      onStderr: (line) => ctx.log?.debug?.(line.trimEnd()),
      ...(ctx.spawnFn ? { spawnFn: ctx.spawnFn } : {}),
    });
  } catch (e) {
    if (!(e instanceof HandshakeError)) throw e;
    return { status: 'fail', remedy: null,
      detail: e.phase === 'timeout' ? timeoutSentence(timeoutMs) : e.message };
  }

  const coreTools = configured ? null : await coreToolNames(root);
  const problems = compareTools({ advertised: result.tools, contract, pin, configured, coreTools });
  if (configured) {
    const capProblems = compareCapabilities(result.capabilities, entry, label);
    // A capabilities answer describing another store is the `SNOW_STORE` case, and it gets the
    // sentence that names the variable rather than a generic mismatch.
    if (capProblems.length > 0) {
      const masked = result.capabilities?.store?.path ?? result.capabilities?.storePath ?? 'a different path';
      problems.push(differentStore(masked));
    }
  }
  if (problems.length > 0) return { status: 'fail', detail: problems[0], remedy: null };

  const probes = runProbes(root, ctx.runCli ? { run: ctx.runCli } : {});
  const checks = [
    { id: 'B08-handshake', status: 'ok',
      detail: `${result.tools.length} tools, contract match` },
    { id: 'B08-capabilities', status: configured ? 'ok' : 'warn',
      detail: configured ? 'capabilities = store' : NO_INSTANCE },
    { id: 'B08-probes', status: probes.status === 'ok' ? 'ok' : 'warn',
      detail: probes.status === 'ok' ? 'probes ran' : PROBES_UNAVAILABLE },
  ];

  writeDoctorCache(root, {
    mode: ctx.mode,
    engineVersion: engineVersion(root),
    contractSha: contractSha(root)?.slice(0, 12) ?? null,
    ...(configured ? { instance: { label, environment: entry.environment, preset: entry.preset,
      flags: entry.flags, probes: probes.probes ?? 'unavailable' } } : {}),
    server: { initializeMs: result.initializeMs, toolCount: result.tools.length,
      protocolVersion: result.protocolVersion },
    checks,
  });

  const summary = `${result.tools.length} tools, contract match`
    + (configured ? ', capabilities = store' : '')
    + (probes.status === 'ok' ? ', probes ran' : '');

  if (!configured) {
    ctx.line?.(`WARN B08: ${NO_INSTANCE}`);
    return { status: 'warn', detail: summary,
      data: { toolCount: result.tools.length, initializeMs: result.initializeMs, configured: false } };
  }
  if (probes.status !== 'ok') ctx.line?.(`WARN B08: ${PROBES_UNAVAILABLE}`);
  return { status: probes.status === 'ok' ? 'ok' : 'warn', detail: summary,
    data: { toolCount: result.tools.length, initializeMs: result.initializeMs, configured: true } };
};

/**
 * The version the SERVER's own SDK negotiates — read, never typed.
 *
 * `pathToFileURL`, because a dynamic `import()` of an ABSOLUTE path is a URL: on Windows
 * `D:\\a\\repo\\node_modules\\…` is rejected with "Only URLs with a scheme in: file, data, and node
 * are supported". Relative specifiers are unaffected, which is why only the absolute ones here
 * needed it — and why it was invisible until three Windows cells said so.
 */
async function latestProtocolVersion(root) {
  const mod = await import(pathToFileURL(
    join(root, 'node_modules/@modelcontextprotocol/sdk/dist/esm/types.js')).href);
  return mod.LATEST_PROTOCOL_VERSION;
}

/** The unconfigured core set, from the server build that decides it. */
async function coreToolNames(root) {
  try {
    const mod = await import(pathToFileURL(join(root, 'packages/snowarch/dist/tools/status.js')).href);
    return mod.CORE_TOOLS_UNCONFIGURED;
  } catch { return null; }
}
