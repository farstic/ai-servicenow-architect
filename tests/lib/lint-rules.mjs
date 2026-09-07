// ARC-02-S02 — the rules themselves, as pure functions over a directory.
//
// They live here rather than inside the test bodies for one reason: the negative cases must run the
// SAME code as the real-tree checks. A negative case that re-implements the rule proves only that the
// re-implementation works. Each function returns an array of failure strings, each beginning with its
// rule id — the ARC-08 doctor quotes those ids.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseFrontmatter, asList } from './frontmatter.mjs';

export const MAX_DESCRIPTION = 500;
export const ALLOWED_TOP_LEVEL = new Set(['name', 'description', 'allowed-tools', 'argument-hint',
  'disable-model-invocation', 'user-invocable', 'license', 'compatibility', 'metadata', 'version']);

const skillDirs = (skillsRoot) => readdirSync(skillsRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(skillsRoot, e.name, 'SKILL.md')))
  .map((e) => e.name).sort();

export function lintSkills({ root, skillsRoot = join(root, '.claude/skills'),
                             lengthAllow = new Set(), versionAllow = new Set(),
                             builtins = new Set(), roster = null, utility = new Set() } = {}) {
  const fail = [];
  const dirs = skillDirs(skillsRoot);
  for (const d of dirs) {
    const rel = `.claude/skills/${d}/SKILL.md`;
    const { data, quoted } = parseFrontmatter(readFileSync(join(skillsRoot, d, 'SKILL.md'), 'utf8'), rel);
    if (data.name !== d) fail.push(`SK-01 ${rel}: name "${data.name}" != directory "${d}"`);
    else if (!/^[a-z0-9-]+$/.test(String(data.name))) fail.push(`SK-01 ${rel}: name is not a slug`);
    if (!data.description || !String(data.description).trim()) fail.push(`SK-02 ${rel}: description missing`);
    else {
      const n = [...data.description].length;
      if (n > MAX_DESCRIPTION && !lengthAllow.has(d)) fail.push(`SK-02 ${rel}: description ${n} chars > ${MAX_DESCRIPTION}`);
    }
    for (const k of ['name', 'description']) {
      if (data[k] && String(data[k]).includes(': ') && !quoted[k]) {
        fail.push(`SK-03 ${rel}: unquoted ": " in ${k} — quote the scalar`);
      }
    }
    if ('version' in data && !versionAllow.has(d)) fail.push(`SK-04 ${rel}: move version under metadata.version`);
    if (data.metadata?.version && !/^\d+\.\d+\.\d+$/.test(data.metadata.version)) {
      fail.push(`SK-04 ${rel}: metadata.version "${data.metadata.version}" is not semver`);
    }
    for (const k of Object.keys(data)) {
      if (!ALLOWED_TOP_LEVEL.has(k)) fail.push(`SK-05 ${rel}: unknown frontmatter key "${k}"`);
    }
    if (!utility.has(d) && !existsSync(join(skillsRoot, d, 'EXAMPLES.md'))) {
      fail.push(`SK-06 .claude/skills/${d}: EXAMPLES.md missing`);
    }
    if (builtins.has(d)) {
      fail.push(`SK-08 .claude/skills/${d}: name "${d}" collides with a Claude Code built-in command — the built-in wins and the skill is unreachable (R-17)`);
    }
  }
  if (roster !== null) {
    const n = dirs.filter((d) => !utility.has(d)).length;
    if (n !== roster) fail.push(`SK-07 roster: ${n} skill directories, engine.config.json says ${roster}`);
  }
  return fail;
}

const PATH_TOKEN = /`((?:\.claude\/(?:skills|agents)|governance|templates|docs)\/[A-Za-z0-9_./-]+)`/g;

// Vocabulary retired by the v3 rebuild. The tokens themselves live in a fixture rather than here:
// a file that spells a forbidden string is a detector, and no-legacy-names.test.mjs has to exempt it.
// Exempting one small data file is honest; exempting this whole module would blind that ratchet to
// every other line in it.
export const RETIRED = JSON.parse(
  readFileSync(new URL('../fixtures/retired-vocabulary.json', import.meta.url), 'utf8'),
).tokens.map(({ pattern, why }) => [new RegExp(pattern, 'g'), why]);

export function lintVocabulary({ root, files, allow = [] }) {
  const fail = [];
  for (const rel of files) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      // An exemption must name both the file and a substring of the line, so it cannot drift onto a
      // different line the way a bare line number would.
      if (allow.some((a) => a.file === rel && line.includes(a.context))) return;
      for (const [re, why] of RETIRED) {
        for (const m of line.matchAll(re)) fail.push(`SK-09 ${rel}:${i + 1}: "${m[0]}" — ${why}`);
      }
    });
  }
  return fail;
}

export function lintPaths({ root, files }) {
  const fail = [];
  for (const rel of files) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(PATH_TOKEN)) {
        if (!existsSync(join(root, m[1]))) fail.push(`SK-10 ${rel}:${i + 1}: dead path ${m[1]}`);
      }
    });
  }
  return fail;
}

export function lintAgents({ root, agentsRoot = join(root, '.claude/agents'),
                             skillsRoot = join(root, '.claude/skills'), enforceS04 = false } = {}) {
  const fail = [];
  const files = readdirSync(agentsRoot).filter((f) => f.endsWith('.md')).sort();
  let chars = 0;
  for (const f of files) {
    const rel = `.claude/agents/${f}`;
    const { data, quoted } = parseFrontmatter(readFileSync(join(agentsRoot, f), 'utf8'), rel);
    if (data.name !== basename(f, '.md')) fail.push(`AG-01 ${rel}: name "${data.name}" != file stem`);
    if (!data.description || !String(data.description).trim()) fail.push(`AG-02 ${rel}: description missing`);
    else {
      chars += [...data.description].length;
      if (String(data.description).includes(': ') && !quoted.description) {
        fail.push(`AG-02 ${rel}: unquoted ": " in description — quote the scalar`);
      }
    }
    if (!('tools' in data)) {
      fail.push(`AG-03 ${rel}: no tools key — an agent without one inherits EVERYTHING, including MCP tools (principle 8)`);
    } else {
      const tools = asList(data.tools);
      if (!tools.length) fail.push(`AG-03 ${rel}: tools is empty`);
      for (const t of tools) {
        if (t.startsWith('mcp__')) fail.push(`AG-03 ${rel}: MCP tool "${t}" — sub-agents must not carry instance access (principle 8, DR-13)`);
        if (['Agent', 'Task'].includes(t)) fail.push(`AG-03 ${rel}: "${t}" would let a sub-agent dispatch sub-agents`);
      }
    }
    if (enforceS04) {
      if (data.model !== 'inherit') fail.push(`AG-04 ${rel}: model "${data.model}" — a pinned model id rots (P-10)`);
      const skills = asList(data.skills);
      if (!skills.length) fail.push(`AG-05 ${rel}: no skills preload`);
      for (const s of skills) if (!existsSync(join(skillsRoot, s))) fail.push(`AG-05 ${rel}: skill "${s}" does not exist`);
    }
  }
  if (chars / 4 > 12000) fail.push(`AG-06 roster: ~${Math.round(chars / 4)} estimated tokens of agent descriptions > 12000`);
  return { fail, chars, files: files.length };
}
