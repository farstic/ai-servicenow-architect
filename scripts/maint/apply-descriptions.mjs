#!/usr/bin/env node
// ARC-02-S03 — applies scripts/maint/descriptions.mjs to the 28 SKILL.md files.
//
// Three edits per file, all confined to the frontmatter and one new body section:
//   1. `description:` replaced with the rewritten text, quoted whenever it contains a `: ` or a `#`
//      (the SK-03 hazard: a YAML plain scalar ends at the first colon-space).
//   2. top-level `version: x.y.z` removed and re-added as `metadata:\n  version: x.y.z`, preserving
//      the value. operational-documentation has none today and receives 1.0.0.
//   3. a `## Triggers` section inserted directly after the H1, carrying the keyword list, the firing
//      statement and the boundary sentences moved out of the description — so nothing is lost.
//
// Deliberately NOT done: merging an existing `## When to use …` section into `## Triggers`. Those
// headings answer different questions ("when do I adopt this persona" vs "what fires it, and what is
// it not"), and rewriting body prose would break the story's own criterion 3 — bodies identical apart
// from the new section and the frontmatter. Flagged in the commit rather than done silently.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS } from './descriptions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKILLS_DIR = join(root, '.claude/skills');
const DEFAULT_VERSION = '1.0.0';
const check = process.argv.includes('--check');

const needsQuote = (v) => v.includes(': ') || v.includes(' #') || /^[-?:,[\]{}#&*!|>'"%@`]/.test(v);
const quote = (v) => (needsQuote(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v);

let changed = 0;
const report = [];

for (const dir of readdirSync(SKILLS_DIR).sort()) {
  const file = join(SKILLS_DIR, dir, 'SKILL.md');
  if (!existsSync(file)) continue;
  const spec = SKILLS[dir];
  if (!spec) throw new Error(`no rewritten description authored for ${dir}`);

  const raw = readFileSync(file, 'utf8');
  const nl = raw.includes('\r\n') ? '\r\n' : '\n';
  const end = raw.indexOf(`${nl}---`, 4);
  if (!raw.startsWith('---') || end === -1) throw new Error(`${dir}: no frontmatter`);
  const fmLines = raw.slice(4, end).split(nl);
  const body = raw.slice(end + nl.length + 4);

  const version = (fmLines.find((l) => l.startsWith('version:')) ?? `version: ${DEFAULT_VERSION}`)
    .slice('version:'.length).trim() || DEFAULT_VERSION;

  const kept = fmLines.filter((l) => !l.startsWith('version:') && !l.startsWith('description:'));
  const nameIdx = kept.findIndex((l) => l.startsWith('name:'));
  kept.splice(nameIdx + 1, 0, `description: ${quote(spec.description)}`);
  const fm = [...kept, 'metadata:', `  version: ${version}`].join(nl);

  // Insert `## Triggers` after the H1, before the first existing H2.
  const triggers = [
    '## Triggers',
    '',
    `**Keywords:** ${spec.keywords}`,
    '',
    `**Fires:** ${spec.fires}`,
    '',
    `**Not this skill:** ${spec.notThis}`,
    '',
  ].join(nl);

  let newBody = body;
  if (!/^## Triggers$/m.test(body)) {
    const h1 = body.match(new RegExp(`^# .*${nl === '\r\n' ? '\r?' : ''}$`, 'm'));
    if (!h1) throw new Error(`${dir}: no H1 to anchor the Triggers section`);
    const at = body.indexOf(h1[0]) + h1[0].length;
    const rest = body.slice(at).replace(/^(\r?\n)+/, '');
    newBody = `${body.slice(0, at)}${nl}${nl}${triggers}${nl}${rest}`;
  }

  const out = `---${nl}${fm}${nl}---${nl}${newBody}`;
  if (out !== raw) {
    changed += 1;
    report.push(`  ${dir}: description ${[...spec.description].length} chars${needsQuote(spec.description) ? ' (quoted)' : ''}, metadata.version ${version}, +## Triggers`);
    if (!check) writeFileSync(file, out);
  }
}

console.log(check ? `apply-descriptions --check: ${changed} file(s) would change` : `apply-descriptions: ${changed} file(s) written`);
report.forEach((r) => console.log(r));
