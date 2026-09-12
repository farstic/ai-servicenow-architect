// ARC-02-S13 / ARC-10 acceptance (B02-06) — `tests/VALIDATION-TESTS.md` → the prompts a run needs.
//
// THE SPEC IS THE SOURCE. A harness that carried its own copy of eighteen prompts would be a second
// definition of the tests, and the first thing a second definition does is stop matching the file
// the reviewer judges against. This reads the fenced blocks under each `### Prompt`, so a test with
// two turns yields two prompts and a scripted run makes both.
//
// Usage: node scripts/validation/extract-validation-prompts.mjs tests/VALIDATION-TESTS.md <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [,, src, out] = process.argv;
const text = readFileSync(src, 'utf8');
const sections = text.split(/\n(?=## T-\d\d )/).filter((s) => /^## T-\d\d /.test(s));
const tests = [];
for (const sec of sections) {
  const id = sec.match(/^## (T-\d\d)/)[1];
  if (Number(id.slice(2)) > 18) continue;
  const title = sec.match(/^## T-\d\d — (.+)$/m)?.[1]?.trim() ?? '';
  const modes = sec.match(/^\*\*Modes:\*\* (.+)$/m)?.[1]?.trim() ?? '';
  const sub = (name) => {
    const m = sec.match(new RegExp(`\\n### ${name}\\n([\\s\\S]*?)(?=\\n### |\\n---|$)`));
    return m ? m[1].trim() : '';
  };
  const promptBlock = sub('Prompt');
  const prompts = [...promptBlock.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  tests.push({ id, title, modes, setup: sub('Setup'), prompt: prompts[0] ?? '', prompts,
    expected: sub('Expected behaviour'), pass: sub('Pass criteria'), fail: sub('Fail signals'),
    dormant: sub('Dormant variant \\(design-only\\)') });
}
writeFileSync(out, JSON.stringify(tests, null, 2));
console.log(`${tests.length} tests; prompts per test: ${tests.map((t) => `${t.id}:${t.prompts.length}`).join(' ')}`);
