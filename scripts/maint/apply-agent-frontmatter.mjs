#!/usr/bin/env node
// ARC-02-S04 — `model: inherit` + `skills:` preload across the nine sub-agents, and the body lines
// that used to load the persona by file path. Throwaway with the rest of scripts/maint/ (S01).
//
// `tools:` is not touched: the explicit list is the structural guarantee that a sub-agent cannot reach
// an MCP tool (principle 8, DR-13). The descriptions are not touched either, except that a value
// containing `: ` gets quoted — AG-02, the hazard that once stopped an agent registering at all.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const AGENTS = join(root, '.claude/agents');
const SKILLS = join(root, '.claude/skills');
const check = process.argv.includes('--check');

// Agent → the skill(s) preloaded into its context. now-assist-specialist takes a second entry: the
// reference companion its own body documents it as grounding on.
const PRELOAD = {
  'atf-author': ['atf-author'],
  developer: ['developer'],
  'diagramming-specialist': ['diagramming-specialist'],
  'flow-designer-specialist': ['flow-designer-specialist'],
  'hld-lld-writer': ['hld-lld-writer'],
  'integration-specialist': ['integration-specialist'],
  'now-assist-specialist': ['now-assist-specialist', 'now-assist-genai'],
  'story-writer': ['story-writer'],
  'technical-designer': ['technical-designer'],
};

const needsQuote = (v) => v.includes(': ') || v.includes(' #') || /^[-?:,[\]{}#&*!|>'"%@`]/.test(v);
const quote = (v) => (needsQuote(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v);

let changed = 0;
const report = [];

for (const file of readdirSync(AGENTS).filter((f) => f.endsWith('.md')).sort()) {
  const name = basename(file, '.md');
  const skills = PRELOAD[name];
  if (!skills) throw new Error(`no preload mapping for agent ${name}`);
  for (const s of skills) if (!existsSync(join(SKILLS, s))) throw new Error(`${name}: preload skill "${s}" does not exist`);

  const path = join(AGENTS, file);
  const raw = readFileSync(path, 'utf8');
  const nl = raw.includes('\r\n') ? '\r\n' : '\n';
  const end = raw.indexOf(`${nl}---`, 4);
  const fmLines = raw.slice(4, end).split(nl);
  let body = raw.slice(end + nl.length + 4);

  const desc = (fmLines.find((l) => l.startsWith('description:')) ?? '').slice('description:'.length).trim();
  const bare = desc.replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');
  const kept = fmLines.filter((l) => !l.startsWith('model:') && !l.startsWith('skills:')
    && !/^\s+-\s/.test(l) && !l.startsWith('description:'));
  const nameIdx = kept.findIndex((l) => l.startsWith('name:'));
  kept.splice(nameIdx + 1, 0, `description: ${quote(bare)}`);
  const fm = [...kept, 'model: inherit', 'skills:', ...skills.map((s) => `  - ${s}`)].join(nl);

  // The persona now arrives in context through `skills:`; re-reading it by path would both waste a
  // turn and re-open the coupling this story removes. EXAMPLES.md is NOT preloaded, so the explicit
  // read stays — that is the whole reason the story keeps it.
  const primary = skills[0];
  body = body.replace(
    new RegExp(`^Load and apply: \`\\.claude/skills/${primary}/SKILL\\.md\`\\. Read it before ([^.]*)\\. The SKILL is authoritative for (.*?)\\.( Read \`\\.claude/skills/${primary}/EXAMPLES\\.md\`[^\\n]*)?$`, 'm'),
    (_m, _before, authoritativeFor) =>
      `Your persona skill \`${primary}\` is preloaded into this context through the \`skills:\` frontmatter — apply it as authoritative for ${authoritativeFor}; do not re-read \`SKILL.md\`. Read \`.claude/skills/${primary}/EXAMPLES.md\` for the gold-standard reference before producing the artefact.`);
  body = body.replace(
    new RegExp(`^(\\d+)\\. \\*\\*Read the SKILL\\*\\* at \`\\.claude/skills/${primary}/SKILL\\.md\`\\.( The SKILL is| It is) authoritative\\.$`, 'm'),
    (_m, n) => `${n}. **Apply the preloaded SKILL** — it is already in this context and is authoritative.`);
  // Harness-neutral wording (00 §10).
  body = body.replace(/dispatched via the Task tool/g, 'dispatched by the Chief Architect');

  const out = `---${nl}${fm}${nl}---${nl}${body}`;
  if (out !== raw) {
    changed += 1;
    const stillPathLoads = (out.match(new RegExp(`skills/${primary}/SKILL\\.md`, 'g')) ?? []).length;
    report.push(`  ${name}: model inherit, skills [${skills.join(', ')}]${needsQuote(bare) ? ', description quoted' : ''}, SKILL.md path loads left: ${stillPathLoads}`);
    if (!check) writeFileSync(path, out);
  }
}

console.log(check ? `apply-agent-frontmatter --check: ${changed} file(s) would change` : `apply-agent-frontmatter: ${changed} file(s) written`);
report.forEach((r) => console.log(r));
