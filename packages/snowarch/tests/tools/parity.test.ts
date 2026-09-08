import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { collectToolCatalog, routeToolInvocation, ROLE_BUNDLE_MAP } from '../../src/tools/index.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

// ARC-04-S04 raised this from 394 to 397: three core tools that need no instance
// (snow_core_status_read, snow_core_capabilities_read, snow_core_instances_reload).
// ARC-04-S06 owns the arithmetic from here — its EXPECTED is 397 minus the one removal
// (snow_rpt_report_generate, ARC-04-S08) plus whatever it adds.
const EXPECTED = 397;

// canonical old -> new map produced by scripts/build-rename-map.mjs
const renameMap: Record<string, string> = JSON.parse(
  readFileSync(new URL('../../tool-rename-map.json', import.meta.url), 'utf8')
);

// every client method call throws — so a *recognised* tool body either validates/permission-throws
// or hits the client and throws; only an *unrecognised* name produces UNKNOWN_TOOL.
const throwingClient = new Proxy(
  {},
  { get: () => (..._args: unknown[]) => { throw new Error('MOCK_CLIENT_CALL'); } }
) as unknown as ServiceNowClient;

describe('tool catalog parity (migration guard)', () => {
  let prevPackage: string | undefined;
  beforeEach(() => {
    prevPackage = process.env.MCP_TOOL_PACKAGE;
    delete process.env.MCP_TOOL_PACKAGE;
  });
  afterEach(() => {
    if (prevPackage === undefined) delete process.env.MCP_TOOL_PACKAGE;
    else process.env.MCP_TOOL_PACKAGE = prevPackage;
  });

  it('1. exposes exactly EXPECTED tools (count parity)', () => {
    expect(collectToolCatalog().length).toBe(EXPECTED);
  });

  it('2. all tool names are unique and namespaced (snow_)', () => {
    const names = collectToolCatalog().map(t => t.name);
    expect(new Set(names).size).toBe(EXPECTED);
    expect(names.every(n => n.startsWith('snow_'))).toBe(true);
  });

  // Tools introduced AFTER the v1 rename have no old name, so they are not in the map. The
  // map is a migration artefact — "what was this called before" — and a tool that never had
  // a before cannot be in it. Listing them here keeps the bijection meaningful for
  // everything that WAS renamed, instead of weakening it to a subset check for all 397.
  const POST_RENAME_TOOLS = [
    'snow_core_status_read',        // ARC-04-S04
    'snow_core_capabilities_read',  // ARC-04-S04
    'snow_core_instances_reload',   // ARC-04-S04
  ];

  it('3. rename map is a total bijection over the renamed tools', () => {
    const oldKeys = Object.keys(renameMap);
    const newVals = Object.values(renameMap);
    const renamedCount = EXPECTED - POST_RENAME_TOOLS.length;
    expect(oldKeys.length).toBe(renamedCount);
    expect(new Set(oldKeys).size).toBe(renamedCount);
    expect(new Set(newVals).size).toBe(renamedCount);

    const catalog = new Set(collectToolCatalog().map(t => t.name));
    const mapped = new Set(newVals);
    // Every mapped name must still exist — this is the half that catches a rename drifting.
    expect([...mapped].filter(n => !catalog.has(n))).toEqual([]);
    // And every catalogue tool is either mapped or declared post-rename above, so a new tool
    // cannot be added silently without someone recording which it is.
    expect([...catalog].filter(n => !mapped.has(n) && !POST_RENAME_TOOLS.includes(n))).toEqual([]);
  });

  it('3b. every post-rename tool really is absent from the map', () => {
    // If one of these ever gains an entry, the list above is stale and the bijection count
    // is wrong by one — silently, since both sides would move together.
    const mapped = new Set(Object.values(renameMap));
    expect(POST_RENAME_TOOLS.filter((n) => mapped.has(n))).toEqual([]);
  });

  it('4. every catalog tool is reachable by the dispatcher (no UNKNOWN_TOOL)', async () => {
    const orphans: string[] = [];
    for (const { name } of collectToolCatalog()) {
      try {
        await routeToolInvocation(throwingClient, name, {});
      } catch (e) {
        if ((e as { code?: string }).code === 'UNKNOWN_TOOL') orphans.push(name);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('5. every role bundle references only live tool names', () => {
    const catalog = new Set(collectToolCatalog().map(t => t.name));
    const dead: Record<string, string[]> = {};
    for (const [bundle, names] of Object.entries(ROLE_BUNDLE_MAP)) {
      const missing = names.filter(n => !catalog.has(n));
      if (missing.length) dead[bundle] = missing;
    }
    expect(dead).toEqual({});
  });
});
