import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { collectToolCatalog, routeToolInvocation, ROLE_BUNDLE_MAP } from '../../src/tools/index.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

// ARC-04-S07 raised this from 397 to 398: snow_us_capture_target_set. ARC-04-S08 takes it
// back to 397 by removing snow_rpt_report_generate (D-03 item 4) while KEEPING the two retired
// script-exec tools registered as [Unsupported] stubs. `contract.toolCount` is DERIVED from the
// catalogue, never a literal, so the contract cannot disagree with the code even when this
// constant lags.
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
    'snow_us_capture_target_set',   // ARC-04-S07
  ];

  /**
   * Renamed, then RETIRED. The map is history and is not rewritten: `generate_report` really
   * was renamed to `snow_rpt_report_generate`, and an old client that still calls the old name
   * deserves the same answer it always got about where the name went. What changed in
   * ARC-04-S08 is that the destination no longer exists (D-03 item 4 — it POSTed to a
   * report-generation endpoint that is not part of the REST API).
   *
   * Deleting the map entry instead would have made the arithmetic below balance while quietly
   * erasing the rename, and nothing would have failed. Declaring it keeps the count honest AND
   * keeps the removal visible in the one place that counts tools.
   */
  const RETIRED_TOOLS = [
    'snow_rpt_report_generate',     // ARC-04-S08
  ];

  it('3. rename map is a total bijection over the renamed tools', () => {
    const oldKeys = Object.keys(renameMap);
    const newVals = Object.values(renameMap);
    const renamedCount = EXPECTED - POST_RENAME_TOOLS.length + RETIRED_TOOLS.length;
    expect(oldKeys.length).toBe(renamedCount);
    expect(new Set(oldKeys).size).toBe(renamedCount);
    expect(new Set(newVals).size).toBe(renamedCount);

    const catalog = new Set(collectToolCatalog().map(t => t.name));
    const mapped = new Set(newVals);
    // Every mapped name must still exist, unless it is declared retired above — this is the
    // half that catches a rename drifting.
    expect([...mapped].filter(n => !catalog.has(n) && !RETIRED_TOOLS.includes(n))).toEqual([]);
    // And every catalogue tool is either mapped or declared post-rename above, so a new tool
    // cannot be added silently without someone recording which it is.
    expect([...catalog].filter(n => !mapped.has(n) && !POST_RENAME_TOOLS.includes(n))).toEqual([]);
  });

  it('3b-retired. a retired tool is gone from the catalogue but still in the map', () => {
    // Both halves matter: a name left in the catalogue would mean the removal did not happen,
    // and a name missing from the map would mean the history was rewritten to make the count
    // work. Either one alone still balances the arithmetic in test 3.
    const catalog = new Set(collectToolCatalog().map((t) => t.name));
    const mapped = new Set(Object.values(renameMap));
    for (const n of RETIRED_TOOLS) {
      expect(catalog.has(n), `${n} is still registered`).toBe(false);
      expect(mapped.has(n), `${n} was deleted from the rename map`).toBe(true);
    }
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
