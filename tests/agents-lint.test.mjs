// ARC-02-S02 — the agent roster, checked against the rules in tests/lib/lint-rules.mjs.
// ARC-02-S04 made the content change AG-04/AG-05 required and flipped ENFORCE_S04 to true, so every
// rule is now live. The companion test that used to assert the known-bad state is gone with it — its
// job was to make the gap visible while it existed, not to outlive the fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { lintAgents } from './lib/lint-rules.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENFORCE_S04 = true;    // flipped by ARC-02-S04, which set model: inherit and added skills:

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

test('AG-04 every agent inherits the session model — no pinned model id', () => report('AG-04'));
test('AG-05 every agent preloads a persona skill that exists', () => {
  report('AG-05');
  const files = readdirSync(join(root, '.claude/agents')).filter((f) => f.endsWith('.md')).sort();
  const total = files.reduce((n, f) => {
    const d = parseFrontmatter(readFileSync(join(root, '.claude/agents', f), 'utf8'), f).data;
    return n + (Array.isArray(d.skills) ? d.skills.length : 1);
  }, 0);
  console.log(`    AG-05: ${files.length} agents preload ${total} skill entries`);
});

test('the preloaded skill is the agent of the same name, and the body no longer loads it by path', () => {
  // The preload replaces a file read. If a body still says "read SKILL.md", the coupling this story
  // removes is back and the sub-agent spends a turn re-reading what it was already given.
  for (const f of readdirSync(join(root, '.claude/agents')).filter((x) => x.endsWith('.md')).sort()) {
    const name = f.replace(/\.md$/, '');
    const text = readFileSync(join(root, '.claude/agents', f), 'utf8');
    const { data } = parseFrontmatter(text, f);
    const skills = Array.isArray(data.skills) ? data.skills : [data.skills];
    assert.equal(skills[0], name, `${f}: first preloaded skill is "${skills[0]}", not the agent's own persona`);
    assert.ok(!new RegExp(`skills/${name}/SKILL\\.md`).test(text),
      `${f}: still loads its own SKILL.md by path — it is preloaded`);
    // EXAMPLES.md is NOT preloaded, so the explicit read must survive.
    assert.ok(new RegExp(`skills/${name}/EXAMPLES\\.md`).test(text),
      `${f}: no longer reads EXAMPLES.md, which the preload does not cover`);
  }
});
