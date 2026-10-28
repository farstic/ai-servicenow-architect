// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { DEFAULT_MODEL, SETTING_SOURCES, header, policyFor } from '../scripts/validation/session-policy.mjs';
import { POSIX } from '../tools/snowarch/lib/launcher-spelling.mjs';
import { formatReport, reportTurn } from '../scripts/validation/turn-report.mjs';
import { initFixtureRepo } from '../tools/snowarch/tests/helpers/fixture-git.mjs';

/**
 * ARC-09-C87 — the validation harness runs every case, isolates the session it runs, and reports what a
 * reviewer used to measure by hand.
 *
 * `validation-run.sh` produces sessions; a person judges them. Three things were wrong with what it
 * produced. The extractor skipped every case above T-18, so T-19 to T-25 could not be run at all. Its
 * sessions inherited the machine's user-level settings and hooks, and `--allowedTools` grants permission
 * without confining the tool set, so the d01fbf9 sitting saw read-only Bash and an async sub-agent run
 * with no denial. And the runner reported none of what a reviewer then counts: the skills invoked, the
 * corpus pages read, and the cited pages that do not exist.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const SPEC = 'tests/VALIDATION-TESTS.md';

function extract(specText, t) {
  const dir = tempDir('c87-extract-', t);
  const src = join(dir, 'spec.md');
  const out = join(dir, 'out.json');
  writeFileSync(src, specText);
  execFileSync(process.execPath, [join(root, 'scripts/validation/extract-validation-prompts.mjs'), src, out], { stdio: 'pipe' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

// ── (a) the extractor reads every case ──────────────────────────────────────────────────────────

test('C87 (a) — the extractor reads every case in the spec: extracted count equals heading count', (t) => {
  const spec = read(SPEC);
  const headings = [...spec.matchAll(/^## (T-\d\d) /gm)].map((m) => m[1]);
  const tests = extract(spec, t);
  assert.deepEqual(tests.map((x) => x.id), headings, 'a case the extractor skips is a case no run can make');
  assert.ok(headings.length >= 25, `the spec has ${headings.length} cases`);
  // Each case that has a Prompt section gives the runner at least one prompt. The case's OWN section: this
  // sliced to the end of the file, so T-28, which has no Prompt, read T-29's below it and was called bare.
  const section = (id) => {
    const at = spec.indexOf(`## ${id} `);
    const next = spec.indexOf('\n## ', at + 1);
    return spec.slice(at, next < 0 ? undefined : next);
  };
  const bare = tests.filter((x) => /\n### Prompt\n/.test(section(x.id)) && x.prompts.length === 0).map((x) => x.id);
  assert.deepEqual(bare, [], 'a Prompt section with no fenced prompt');
});

test('C87 (a) — a case numbered above T-18 is extracted (the old cap would drop it)', (t) => {
  const cases = Array.from({ length: 21 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `## T-${n} — case ${n}\n\n**Modes:** design-only\n\n### Prompt\n\n\`\`\`\nask ${n}\n\`\`\`\n\n### Expected behaviour\n\nx\n\n---\n`;
  });
  const tests = extract(`# spec\n\n${cases.join('\n')}`, t);
  assert.equal(tests.length, 21);
  assert.deepEqual(tests.at(-1).prompts, ['ask 21']);
});

// ── (b) the session is isolated ─────────────────────────────────────────────────────────────────

test('C87 (b) — the policy: Sonnet 5.5 by default, the clone\'s own settings, and a tool set that is a set', () => {
  assert.equal(DEFAULT_MODEL, 'claude-sonnet-5-5');
  assert.equal(SETTING_SOURCES, 'project,local');
  const base = policyFor('T-01');
  assert.deepEqual(base.tools, ['Read', 'Grep', 'Glob', 'Skill']);
  assert.deepEqual(base.allowed, base.tools);
  const t07 = policyFor('T-07');
  assert.ok(t07.tools.includes('Bash'), 'T-07 runs the doctor');
  const { cli } = POSIX;
  assert.deepEqual(t07.allowed.filter((a) => a.startsWith('Bash')), [`Bash(${cli}:*)`, `Bash(${cli} doctor:*)`]);
  assert.ok(policyFor('T-13').tools.includes('Write'));
  // ARC-09-C243 — T-38 prints the status panel and may run the doctor, and nothing else of the launcher: a Bash grant for
  // those two commands, never for the whole CLI, and no Write.
  const t38 = policyFor('T-38');
  assert.ok(t38.tools.includes('Bash'), 'T-38 runs the status command');
  assert.deepEqual(t38.allowed.filter((a) => a.startsWith('Bash')), [`Bash(${cli} status:*)`, `Bash(${cli} doctor:*)`]);
  assert.ok(!t38.tools.includes('Write'), 'T-38 writes nothing');
  for (const id of ['T-01', 'T-07', 'T-13', 'T-25', 'T-38']) {
    const p = policyFor(id);
    assert.deepEqual(p.tools.filter((x) => ['Agent', 'Task', 'WebFetch', 'WebSearch', 'Edit'].includes(x)), [], `${id} has no sub-agent, web or edit tool`);
    // Every allowed pattern names a tool that exists: permission is never granted for a tool the session lacks.
    for (const a of p.allowed) assert.ok(p.tools.includes(a.replace(/\(.*$/, '')), `${id}: ${a} is allowed but not available`);
  }
});

test('C87 (b) — every claude invocation in the runner carries the policy flags', () => {
  const sh = read('scripts/validation/validation-run.sh');
  const calls = sh.split('\n').filter((l) => /^\s*claude -p "/.test(l));   // the invocations, not the prose about them
  assert.equal(calls.length, 2, 'a first turn and a resumed turn');
  for (const l of calls) {
    for (const flag of ['--model "$MODEL"', '--setting-sources "$SOURCES"', '--strict-mcp-config', '--tools "$TOOLS"', '--allowedTools "$ALLOWED"']) {
      assert.ok(l.includes(flag), `a claude call lacks ${flag}: ${l.trim().slice(0, 80)}`);
    }
  }
  assert.doesNotMatch(sh, /--allowedTools "\$TOOLS"/, 'permission without confinement is the old arrangement');
});

test('C87 (b) — the header names the sha, model, setting sources and tools', () => {
  const lines = header({ tag: 'v9.0.0', sha: 'abc1234', model: DEFAULT_MODEL, version: '2.1.289 (Claude Code)' }).join('\n');
  for (const want of ['v9.0.0', 'abc1234', 'claude-sonnet-5-5', 'setting sources: project,local', 'Read,Grep,Glob,Skill', 'T-07', 'Bash', 'T-13', 'Write', '2.1.289']) {
    assert.ok(lines.includes(want), `the header does not say ${want}:\n${lines}`);
  }
  assert.match(lines, /mcp: none/, 'a design-only run reaches no MCP server');
});

// ARC-11-C6 — the architect's sitting on 199e806 (2026-10-12) ran no SessionStart hook, so its sessions had no
// Licence line, and T-31 could not fire. The hook is registered in the clone's local settings, where the bootstrap
// writes it (ARC-06-S05: the committed file stays hook-free), and `project` alone does not load that file.
test('ARC-11-C6 — the sessions load the settings the SessionStart hook is in, so its Licence line reaches T-31', async () => {
  const { hookEntry, SETTINGS_LOCAL } = await import('../tools/snowarch/lib/settings-local.mjs');
  assert.ok(hookEntry().SessionStart, 'the bootstrap registers no SessionStart hook');
  assert.equal(SETTINGS_LOCAL.split('\\').join('/'), '.claude/settings.local.json');
  assert.equal(JSON.parse(read('.claude/settings.json')).hooks, undefined, 'the committed settings carry a hook');
  // So a session loads the local file as well as the project's, and still never the machine's own settings.
  const sources = SETTING_SOURCES.split(',');
  assert.ok(sources.includes('local'), `the sessions load ${SETTING_SOURCES}, which leaves the hook's file out`);
  assert.ok(sources.includes('project'));
  assert.equal(sources.includes('user'), false, 'the machine\'s own settings reach the session');
});

// ── (c) the turn report ─────────────────────────────────────────────────────────────────────────

function corpus(t) {
  const dir = tempDir('c87-corpus-', t);
  const md = join(dir, 'vendor', 'ServiceNowDocs', 'markdown');
  mkdirSync(join(md, 'it-service-management', 'incident'), { recursive: true });
  mkdirSync(join(md, 'customer-service-management'), { recursive: true });
  writeFileSync(join(md, 'it-service-management', 'incident', 'real-page.md'), 'x');
  writeFileSync(join(md, 'customer-service-management', 'twin.md'), 'x');
  writeFileSync(join(md, 'it-service-management', 'twin.md'), 'x');
  writeFileSync(join(md, 'customer-service-management', 'only-here.md'), 'x');
  initFixtureRepo((args) => execFileSync('git', args, { cwd: dir }), dir, ['-q', '-b', 'main']);
  writeFileSync(join(dir, 'CLAUDE.md'), 'x');
  execFileSync('git', ['add', 'CLAUDE.md'], { cwd: dir });
  return dir;
}

const stream = (events) => events.map((e) => JSON.stringify(e)).join('\n');
const assistant = (...content) => ({ type: 'assistant', message: { content } });
const text = (s) => ({ type: 'text', text: s });
const use = (name, input) => ({ type: 'tool_use', name, input });

test('C87 (c) — the skills invoked and the corpus pages read are counted from the tool calls', (t) => {
  const dir = corpus(t);
  const r = reportTurn(stream([
    assistant(use('Skill', { skill: 'itsm-specialist' })),
    assistant(use('Read', { file_path: '.claude/skills/csm-specialist/SKILL.md' })),
    assistant(use('Read', { file_path: 'vendor/ServiceNowDocs/markdown/it-service-management/incident/real-page.md' })),
    assistant(use('Read', { file_path: `${dir}/vendor/ServiceNowDocs/markdown/it-service-management/incident/real-page.md` })),
    assistant(use('Grep', { pattern: 'x', path: 'vendor/ServiceNowDocs/markdown' })),
    assistant(use('Read', { file_path: 'docs/MODES-AND-PRESETS.md' })),
    { type: 'result', result: 'done' },
  ]), { repoRoot: dir });
  assert.deepEqual(r.skills, [{ name: 'itsm-specialist', how: 'Skill' }, { name: 'csm-specialist', how: 'Read' }]);
  assert.equal(r.corpusReads.length, 1, 'the same page twice, by two spellings, is one page; a repo file is not a corpus page');
  assert.equal(r.corpusSearches, 1);
});

test('C87 (c) — a cited page is resolved: full path, bare name, ambiguous name, or missing', (t) => {
  const dir = corpus(t);
  const answer = [
    'Per *(citation: `markdown/it-service-management/incident/real-page.md`)* the flow holds.',
    'Also vendor/ServiceNowDocs/markdown/customer-service-management/only-here.md and ServiceNowDocs/markdown/it-service-management/incident/ghost.md.',
    'A bare name: only-here.md. An ambiguous one: twin.md. One that is nowhere: nowhere.md.',
    'Repo files are not citations: CLAUDE.md and docs/ARCHITECTURE.md.',
  ].join('\n');
  const r = reportTurn(stream([assistant(text(answer)), { type: 'result', result: answer }]), { repoRoot: dir });
  const by = Object.fromEntries(r.citations.map((c) => [c.cited, c.status]));
  assert.equal(by['markdown/it-service-management/incident/real-page.md'], 'ok');
  assert.equal(by['vendor/ServiceNowDocs/markdown/customer-service-management/only-here.md'], 'ok');
  assert.equal(by['ServiceNowDocs/markdown/it-service-management/incident/ghost.md'], 'missing', 'a full path that is not there');
  assert.equal(by['only-here.md'], 'bare', 'a bare name that resolves to one page is flagged, not accepted');
  assert.equal(by['twin.md'], 'ambiguous');
  assert.equal(by['nowhere.md'], 'missing');
  assert.equal(by['CLAUDE.md'], undefined);
  assert.equal(by['docs/ARCHITECTURE.md'], undefined);
  const line = formatReport(r);
  assert.match(line, /citations: 6 \(ok 2 · bare 1 · ambiguous 1 · missing 2\)/);
  assert.match(line, /MISSING .*ghost\.md/);
  assert.match(line, /MISSING .*nowhere\.md/);
});

test('C87 (c) — a turn with nothing to report says so, and never throws on a ragged stream', (t) => {
  const dir = corpus(t);
  const r = reportTurn('not json\n{"type":"assistant"}\n{"type":"assistant","message":{"content":"plain"}}\n', { repoRoot: dir });
  assert.deepEqual([r.skills.length, r.corpusReads.length, r.citations.length], [0, 0, 0]);
  assert.match(formatReport(r), /skills: none · corpus pages read: 0 · citations: 0/);
});

// ── the gateways ask for the full path ──────────────────────────────────────────────────────────

test('C87 (c) — each gateway\'s citation format asks for the full path from markdown/, never a bare file name', () => {
  for (const g of ['itsm', 'csm', 'hrsd', 'itom-discovery', 'cmdb-csdm', 'fso-insurance']) {
    const f = `.claude/skills/${g}-specialist/SKILL.md`;
    const body = read(f);
    const at = body.search(/(\*\*Citation format:\*\*|### Citation format)/);
    assert.ok(at >= 0, `${f} has no citation format`);
    const section = body.slice(at, at + 700);
    assert.match(section, /full path[^.]*markdown\//i, `${f}: the citation format does not ask for the full path`);
    assert.match(section, /never (a )?bare file name/i, `${f}: it does not forbid the bare file name`);
  }
});
