// ARC-02-S02 — the agent roster, checked against the rules in tests/lib/lint-rules.mjs.
// AG-04/AG-05 are written but switched off: ARC-02-S04 makes the content change they require and
// flips ENFORCE_S04. The "pending" test below asserts today's known-bad state so the gap stays visible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { lintAgents } from './lib/lint-rules.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENFORCE_S04 = false;   // flipped by ARC-02-S04

const run = () => lintAgents({ root, enforceS04: ENFORCE_S04 });
const report = (id) => { const f = run().fail.filter((x) => x.startsWith(id)); assert.equal(f.length, 0, `${f.length} failure(s):\n  ${f.join('\n  ')}`); };

test('AG-01 every agent name equals its file stem', () => report('AG-01'));
test('AG-02 every agent has a description with no unquoted ": "', () => report('AG-02'));
test('AG-03 every agent declares an explicit tools list with no MCP tool and no nested dispatch', () => report('AG-03'));
test('AG-06 the combined agent description budget stays under the sub-agent warning threshold', () => {
  const { fail, chars, files } = run();
  assert.equal(fail.filter((f) => f.startsWith('AG-06')).length, 0, fail.join('\n'));
  console.log(`    AG-06: ${chars} chars across ${files} agents ≈ ${Math.round(chars / 4)} tokens (budget 12000)`);
});

test('AG-04 model is inherit', { skip: ENFORCE_S04 ? false : 'enabled by ARC-02-S04, which sets it' }, () => report('AG-04'));
test('AG-05 skills preload names existing roster skills', { skip: ENFORCE_S04 ? false : 'enabled by ARC-02-S04, which adds it' }, () => report('AG-05'));

test('AG-04/AG-05 pending: the defect they will fix is still present, so the switch is still needed', () => {
  // Asserts the known-bad state on purpose. If someone fixes the agents early, this fails and points
  // at ENFORCE_S04 — better than a skipped rule silently passing over an already-clean tree.
  const files = readdirSync(join(root, '.claude/agents')).filter((f) => f.endsWith('.md')).sort();
  const data = files.map((f) => parseFrontmatter(readFileSync(join(root, '.claude/agents', f), 'utf8'), f).data);
  const pinned = data.filter((d) => d.model !== 'inherit').length;
  const noSkills = data.filter((d) => !('skills' in d)).length;
  assert.equal(pinned, files.length, `ENFORCE_S04 is off but ${files.length - pinned} agent(s) already say inherit — flip it in ARC-02-S04`);
  assert.equal(noSkills, files.length, `ENFORCE_S04 is off but ${files.length - noSkills} agent(s) already preload skills — flip it in ARC-02-S04`);
  console.log(`    pending for S04: ${pinned}/${files.length} pinned model ids (e.g. "${data[0].model}"), ${noSkills}/${files.length} with no skills preload`);
});
