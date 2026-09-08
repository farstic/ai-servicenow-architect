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
   * `snow_core_instance_switch` is named in S-23 and is NOT `mutates: true`.
   *
   * It changes no ServiceNow record, so declaring it would break contract test (c) unless it
   * also gained a write gate — and gating it would stop a read-only session from switching
   * instances to READ another one. Overloading `mutates` to also mean "changes session state"
   * would make one field carry two meanings and quietly change what (c) enforces.
   *
   * So it is listed here as a declared exception rather than forced either way, and the real
   * gap — S-23 requires it to prompt, and the ask-list is generated from `mutates` alone —
   * is escalated to the architect for ARC-05-S07 to resolve with a second source. The
   * exception is written down so the hole cannot be mistaken for completeness.
   */
  const ASK_LIST_GAP = ['snow_core_instance_switch'];

  it('the 14 tools named in 03 S-23 are mutates: true, except the one declared gap', () => {
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
    expect(S23.filter((n) => !ASK_LIST_GAP.includes(n) && DECLARED.get(n) !== true)).toEqual([]);
  });

  it('the declared gap is exactly that, and no wider', () => {
    // Both halves: every name in the exception list is really in S-23 (so the list cannot be
    // used to excuse an unrelated tool), and every one of them is really still `false` (so a
    // later fix does not leave a stale exception standing).
    for (const n of ASK_LIST_GAP) {
      expect(DECLARED.has(n), `${n} is not in the catalogue`).toBe(true);
      expect(DECLARED.get(n), `${n} is no longer a gap — remove it from ASK_LIST_GAP`).toBe(false);
    }
  });
});
