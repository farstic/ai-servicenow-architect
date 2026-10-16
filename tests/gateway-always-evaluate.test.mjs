// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C161 — Part 2's breadth on a financial or audit request: the baseline constructs that come closest are named
// and weighed every time, before Part 3 decides.
//
// The owner's rc.3 sitting, T-02 (a per-account service credit ledger for SLA breaches): the CSM gateway weighed the
// SLA, account, contract and entitlement tables and gave Verdict C, but never named the AR invoice tables — the
// baseline record of money against an account — or the journal and audit history, which T-02 expects rejected with a
// reason. Each of CSM and ITSM now carries a short list that Part 2 always evaluates for such a request, each entry with
// a citation that resolves in the bundled corpus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'vendor/ServiceNowDocs');

/** The `## Part 2 — Data Model Alignment` section of a gateway's skill, to the next `## `. */
function part2(dir) {
  const text = readFileSync(join(ROOT, '.claude/skills', dir, 'SKILL.md'), 'utf8');
  const from = text.indexOf('\n## Part 2 — Data Model Alignment');
  assert.ok(from > 0, `${dir}: no Part 2`);
  return text.slice(from, text.indexOf('\n## ', from + 1));
}

const LISTS = {
  'csm-specialist': {
    lead: '**Always evaluate, for a request about money against an account or an audit trail (ARC-09-C161).**',
    names: ['task_sla', 'contract_sla', 'sn_otc_invoice', 'sn_otc_invoice_line', 'ast_contract', 'service_entitlement',
      'sys_journal_field', 'sys_audit', 'sys_history_set'],
  },
  'itsm-specialist': {
    lead: '**Always evaluate, for a request about an audit trail or an escalation record (ARC-09-C161).**',
    names: ['sys_journal_field', 'sys_audit', 'sys_history_set', 'sys_history_line', 'task_sla', 'contract_sla', 'cmn_rota',
      'cmn_rota_member'],
  },
};

for (const [dir, { lead, names }] of Object.entries(LISTS)) {
  test(`ARC-09-C161 — ${dir}'s Part 2 always evaluates the closest baseline constructs, each cited`, (t) => {
    const section = part2(dir);
    const at = section.indexOf(lead);
    assert.ok(at > 0, `${dir}: Part 2 has no always-evaluate list`);
    const list = section.slice(at, section.indexOf('\n\n', section.indexOf('\n- ', at)) === -1 ? undefined
      : section.indexOf('\n\n', section.indexOf('\n- ', at)));
    assert.match(list, /names each of these, says what it records, and says whether it serves the need and why, before Part 3 decides/);
    for (const name of names) assert.ok(list.includes(`\`${name}\``), `${dir}: the list does not name ${name}`);
    const cited = [...list.matchAll(/`(markdown\/[^`]+\.md)`/g)].map((m) => m[1]);
    const bullets = list.split('\n').filter((l) => l.startsWith('- '));
    assert.ok(bullets.length >= 4, `${dir}: ${bullets.length} entries`);
    for (const b of bullets) assert.match(b, /\*\(citation: `markdown\//, `${dir}: an entry with no citation: ${b.slice(0, 60)}`);
    if (!existsSync(join(CORPUS, 'markdown'))) { t.skip('no corpus in this checkout to resolve the citations against'); return; }
    for (const path of cited) assert.ok(existsSync(join(CORPUS, path)), `${dir}: ${path} does not resolve`);
  });
}
