import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectToolCatalog } from '../../src/tools/index.js';

/**
 * `mutates` is what the §2.1 ask-list is generated from (ARC-05-S07). A tool that writes to the
 * instance but declares `mutates: false` is therefore not a cosmetic error: it is a write that
 * never prompts.
 *
 * Five were found this way during ARC-04-S09, one of them `snow_cfg_set_properties_bulk` —
 * named in `03` S-23 as one of the 14 that MUST be in the ask-list, and silently absent from it.
 * The gate tests could not see them, because a gate and a declaration are different claims: all
 * five called `requireWrite()` correctly and refused correctly. What was wrong was the label the
 * contract generator reads.
 *
 * So this reads the SOURCE rather than exercising the tools. Driving 397 tools with empty
 * arguments would stop at each one's validation long before any client call, and a suite that
 * only observed the handful reachable with `{}` would report a clean sweep it never performed.
 */
const TOOLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/tools');
const WRITE_CALL = /\b(createRecord|updateRecord|deleteRecord)\s*\(/;

/** Each `case 'snow_x':` block, up to the next case label in the same file. */
function caseBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const file of readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(TOOLS_DIR, file), 'utf8');
    const parts = src.split(/case '(snow_[a-z0-9_]+)':/);
    for (let i = 1; i < parts.length; i += 2) {
      const body = (parts[i + 1] ?? '').split(/\n\s+case '/)[0];
      bodies.set(parts[i]!, body);
    }
  }
  return bodies;
}

const BODIES = caseBodies();
const DECLARED = new Map(collectToolCatalog().map((t) => [t.name, t.mutates]));
const SESSION = new Map(collectToolCatalog().map((t) => [t.name, t.sessionMutates ?? false]));

describe('the scan itself works', () => {
  it('finds a case body for most of the catalogue', () => {
    // Without this, a regex that matched nothing would report zero violations forever.
    const found = [...DECLARED.keys()].filter((n) => BODIES.has(n));
    expect(found.length).toBeGreaterThan(300);
  });

  it('and sees the write calls it is looking for', () => {
    const writers = [...BODIES.entries()].filter(([, b]) => WRITE_CALL.test(b));
    expect(writers.length).toBeGreaterThan(50);
  });
});

describe('every tool that writes declares mutates: true', () => {
  it('no tool calls create/update/deleteRecord while declaring mutates: false', () => {
    const violations = [...BODIES.entries()]
      .filter(([name, body]) => WRITE_CALL.test(body) && DECLARED.get(name) === false)
      .map(([name]) => name)
      .sort();
    // ARC-04-S09 found five here: snow_chg_change_for_approval_submit, snow_flow_flow_test,
    // snow_intg_event_register, snow_sec_vulnerabilities_scan, snow_cfg_set_properties_bulk.
    expect(violations).toEqual([]);
  });

  /**
   * What the §2.1 ask list is generated from: `mutates || sessionMutates` (ARC-05-S07).
   *
   * ARC-04-S09 left `snow_core_instance_switch` as a declared gap because it changes no
   * ServiceNow record — `mutates: true` would have failed contract test (c) unless it also
   * gained a write gate, and gating it would stop a read-only session switching instances to
   * READ another one. ARC-04-S10 resolved it with a second field rather than by overloading
   * the first, so the union below is the real predicate and the gap list is gone.
   */
  const asks = (name: string): boolean =>
    DECLARED.get(name) === true || SESSION.get(name) === true;

  it('the 14 tools named in 03 S-23 all reach the ask list', () => {
    // Stated here because the ask-list is generated from this field and S-23 named these
    // specifically as the ones a name-derived gate would miss.
    const S23 = [
      'snow_cat_request_approve', 'snow_cat_request_reject', 'snow_deploy_deployment_rollback',
      'snow_kb_knowledge_article_retire', 'snow_itam_asset_retire', 'snow_tsk_task_complete',
      'snow_scr_changeset_commit', 'snow_ntf_attachment_upload',
      'snow_ntf_emergency_broadcast_send', 'snow_intg_event_fire', 'snow_core_instance_switch',
      'snow_usr_user_group_unassign', 'snow_inc_work_note_annotate',
      'snow_cfg_set_properties_bulk',
    ];
    const missing = S23.filter((n) => !DECLARED.has(n));
    expect(missing, 'named in S-23 but not in the catalogue').toEqual([]);
    expect(S23.filter((n) => !asks(n)), 'these would not prompt').toEqual([]);
  });

  it('sessionMutates is exactly one tool, and it is not also mutates', () => {
    // Both halves. A second tool acquiring it silently would widen the ask list without anyone
    // deciding to; and a tool carrying both fields would mean the union is hiding a real
    // `mutates` declaration that contract test (c) should have been enforcing a gate on.
    const session = [...SESSION.entries()].filter(([, v]) => v).map(([n]) => n).sort();
    expect(session).toEqual(['snow_core_instance_switch']);
    expect(session.filter((n) => DECLARED.get(n) === true)).toEqual([]);
  });

  it('instances_reload stays out of the ask list', () => {
    // ARC-07's `--resume` depends on it not prompting. Asserted rather than left to a comment,
    // because the obvious next step after declaring one core tool is to declare its neighbour.
    expect(asks('snow_core_instances_reload')).toBe(false);
  });
});
