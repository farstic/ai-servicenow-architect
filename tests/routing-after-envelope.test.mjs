// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C151 — a gateway's Part 4 informs the Architect's routing, and never decides it.
//
// The owner's rc.3 sitting, T-03 ("a flow that sends a Slack message when a P1 incident is created"): the ITSM
// gateway gave Verdict A, and the Architect then dispatched the Flow Designer Specialist from its Part 4, with an
// Integration Specialist "consult". It never stated the Integration Specialist → Flow Designer Specialist sequence
// (CLAUDE.md §7) or flagged the Security & GRC consult (§8). Part 4 knew three outcomes, and the Architect took it
// as the routing, skipping its own Steps 6 to 8. CLAUDE.md now runs those steps after every Envelope, and each
// gateway's Part 4 lists the builders the request crosses for the Architect to sequence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const real = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const GATEWAYS = ['itsm-specialist', 'csm-specialist', 'hrsd-specialist', 'itom-discovery-specialist',
  'cmdb-csdm-specialist', 'fso-insurance-specialist'];

test('ARC-09-C151 — CLAUDE.md runs Steps 6 to 8 after every Envelope, and Step 8 proposes the §7 sequence', () => {
  const claude = real('CLAUDE.md');
  const step6 = /^6\. \*\*Resolve ambiguity\*\*[^\n]*$/m.exec(claude)?.[0] ?? '';
  assert.match(step6, /Steps 6–8 run after every Envelope; its Part 4 informs routing, never decides it\./);
  const step8 = /^8\. \*\*Propose the primary specialist\*\*[^\n]*$/m.exec(claude)?.[0] ?? '';
  assert.match(step8, /§7's builder sequence/);
});

test('ARC-09-C151 — every gateway\'s Part 4 lists the builders the request crosses, as an input to routing', () => {
  for (const g of GATEWAYS) {
    const text = real(`.claude/skills/${g}/SKILL.md`);
    const from = text.indexOf('## Part 4 — Routing Recommendation');
    assert.ok(from > 0, `${g}: no Part 4`);
    const part4 = text.slice(from, text.indexOf('## Part 5', from));
    assert.match(part4, /\*\*Builders the request crosses:\*\* the Integration Specialist[^\n]*the Flow Designer Specialist[^\n]*the Developer/,
      `${g}: Part 4 does not list the builders the request crosses`);
    assert.match(part4, /This Part 4 is an input to the Architect's routing, never the routing\./, `${g}: Part 4 reads as the routing`);
  }
});
