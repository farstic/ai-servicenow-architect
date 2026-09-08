import { describe, it, expect, vi } from 'vitest';
import { collectToolCatalog, selectPackage, ROLE_BUNDLE_MAP } from '../../src/tools/index.js';

/**
 * The bundles are asserted through `selectPackage`, not by setting MCP_TOOL_PACKAGE and calling
 * `collectToolCatalog()` again.
 *
 * That is what this suite used to do, and ARC-04-S08 made it meaningless: the catalogue is now
 * computed ONCE at module load, so a mid-process env change is exactly the thing that must no
 * longer have an effect. Left as it was, these tests would have failed for the right reason and
 * been "fixed" by making the catalogue dynamic again. The last case below asserts the new
 * guarantee directly.
 */
const ALL = collectToolCatalog();

describe('selectPackage — the role bundles', () => {
  it('service_desk is a subset: incident and request tools, no scripting', () => {
    const names = selectPackage(ALL, 'service_desk').map((t) => t.name);
    expect(names).toContain('snow_inc_incident_add');
    expect(names).toContain('snow_inc_incident_read');
    expect(names).toContain('snow_cat_request_approve');
    expect(names).not.toContain('snow_scr_business_rule_add');
    expect(names).not.toContain('snow_scr_changeset_commit');
    expect(names.length).toBeLessThan(ALL.length);
  });

  it('platform_developer carries scripting and ATF, not the ITSM desk tools', () => {
    const names = selectPackage(ALL, 'platform_developer').map((t) => t.name);
    expect(names).toContain('snow_scr_business_rules_index');
    expect(names).toContain('snow_atf_atf_suite_exec');
    expect(names).toContain('snow_atf_atf_failure_insight_read');
    expect(names).not.toContain('snow_inc_incident_add');
  });

  it('an unknown name falls back to the full set, and says so', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(selectPackage(ALL, 'nonexistent_package')).toBe(ALL);
    expect(warn.mock.calls[0][0]).toContain('nonexistent_package');
    warn.mockRestore();
  });

  it('"full" and an empty name both return the whole catalogue, by identity', () => {
    expect(selectPackage(ALL, 'full')).toBe(ALL);
    expect(selectPackage(ALL, '')).toBe(ALL);
  });

  it('every bundle is non-empty and a strict subset', () => {
    for (const [name, allowed] of Object.entries(ROLE_BUNDLE_MAP)) {
      const got = selectPackage(ALL, name);
      expect(got.length, name).toBeGreaterThan(0);
      expect(got.length, name).toBeLessThanOrEqual(allowed.length);
    }
  });
});

describe('the catalogue is fixed for the life of the process', () => {
  it('the same array comes back every time — not a fresh copy, the same one', () => {
    // Identity, because `tools/list` and `collectToolCatalog()` must be answering from one
    // source. Two equal arrays would satisfy a deep-equality check while still being rebuilt.
    expect(collectToolCatalog()).toBe(collectToolCatalog());
  });

  it('changing MCP_TOOL_PACKAGE mid-process changes nothing', () => {
    const before = collectToolCatalog().map((t) => t.name);
    vi.stubEnv('MCP_TOOL_PACKAGE', 'service_desk');
    expect(collectToolCatalog().map((t) => t.name)).toEqual(before);
    vi.unstubAllEnvs();
  });
});

describe('collectToolCatalog – package system', () => {
  it('ai_developer package includes Now Assist tools', () => {
    const names = selectPackage(ALL, 'ai_developer').map((t) => t.name);
    expect(names).toContain('snow_na_nlq_query');
    expect(names).toContain('snow_na_summary_generate');
    expect(names).toContain('snow_na_agentic_playbook_trigger');
    expect(names).toContain('snow_na_ms_copilot_topics_read');
  });

  it('no duplicate tool names in full package', () => {
    const tools = collectToolCatalog();
    const names = tools.map(t => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every tool has required MCP fields', () => {
    collectToolCatalog().forEach(tool => {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    });
  });
});
