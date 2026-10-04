// ARC-09-C106 - a validation case's Setup block, planned and (when it is safe) run.
//
// `validation-run.sh` ran every case without its Setup. T-25's second turn asks the session to read
// `clients/acme/acme-engagement-state.md`, a file only T-25's Setup creates, so the run failed for a
// reason that was the harness's and looked like the product's.
//
// A Setup comes in four kinds in the spec, and this decides which, from the text:
//   prose     numbered context for a person (T-06, T-13): nothing to run
//   runner    the product's own design-mode install and doctor (T-07): the runner has already
//             bootstrapped the clone in design mode, and the session runs the doctor itself
//   files     shell that writes files under `clients/` (T-25): run, in the clone, before the case
//   instance  commands that need an instance (T-19, T-22, T-23): NEVER run here; the session has no
//             MCP server (`--strict-mcp-config`), so the case runs as its design-only dormant variant
//
// WHAT RUNS IS A WHITELIST, not a blacklist. A command is run only if it is `mkdir`, `touch`, `echo`
// or `printf` and every path it writes is a plain path under `clients/` (gitignored, so the clone
// under test stays the tree the tag names). Anything else - a command the planner does not know, shell
// syntax it does not interpret (`;` `|` `&` `$` a backtick, a subshell, a glob, a `..` in a path),
// a path outside `clients/`, a block that is not shell - is REFUSED, and a refused Setup stops its case:
// state the case needed was not prepared, and running it anyway would put the harness's gap in the
// product's column.
//
// Quoted text is data. A redirect symbol, a semicolon or a dollar inside SINGLE quotes is literal
// (T-25 prints lines containing backticks), so single-quoted segments are removed before the syntax
// check; double quotes expand `$` and backticks, so those are refused wherever they are not single-quoted.
//
// Usage: node scripts/validation/setup-plan.mjs summary <prompts.json> [T-NN ...]
//        node scripts/validation/setup-plan.mjs run <prompts.json> <T-NN> <clone>
// Exit (run): 0 the Setup ran clean, or there was nothing to run, or it needs an instance and was not
// run (the case goes on as its dormant variant) · 1 refused or failed (the case is not run) · 2 usage.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const INSTANCE = /(?:snowarch|snow\w*)\s+instance\b|instances\.json|set-credentials|set-preset|mcp__servicenow|\bsnow_[a-z]+_[a-z_]+/;
const SHELL_LANGS = new Set(['', 'sh', 'bash', 'shell']);
const WRITERS = new Set(['mkdir', 'touch', 'echo', 'printf']);
const SAFE_PATH = /^clients\/[A-Za-z0-9_.\/-]+$/;
// What the planner does not interpret. `>` is handled as a redirect; `\` is a joined continuation by now.
const SYNTAX = /[;|&()<*?~{}!`$\\]/;
// The product's own install and doctor, in the design-only form the runner has already done.
const RUNNER = /^\.\/(?:bootstrap\.sh\b.*\s--mode\s+design\b|snowarch\s+(?:doctor\b|mode\s+design\b))/;

/** A trailing `# comment`, quote-aware: a `#` counts only outside quotes and at a word start. */
function stripComment(line) {
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** Logical commands of one shell block: comments dropped, `\` continuations joined, blanks skipped. */
function commandsOf(block) {
  const out = [];
  let pending = [];
  for (const physical of block.split('\n')) {
    const line = stripComment(physical).replace(/\s+$/, '');
    if (line.trim() === '' && pending.length === 0) continue;
    pending.push(line);
    if (line.endsWith('\\')) continue;
    const raw = pending.join('\n');
    const text = pending.map((l) => l.replace(/\\$/, '').trim()).filter(Boolean).join(' ');
    out.push({ raw, text });
    pending = [];
  }
  if (pending.length) out.push({ raw: pending.join('\n'), text: pending.map((l) => l.replace(/\\$/, '').trim()).join(' ') });
  return out;
}

const withoutSingleQuoted = (s) => s.replace(/'[^']*'/g, "''");
const withoutQuoted = (s) => withoutSingleQuoted(s).replace(/"[^"]*"/g, '""');

/** One logical command: 'runner', 'file', or a refusal with its reason. */
function classify(cmd) {
  if (RUNNER.test(cmd.text) && !SYNTAX.test(withoutQuoted(cmd.text))) return { ...cmd, kind: 'runner' };
  const single = withoutSingleQuoted(cmd.text);
  const bad = (single.match(/[`$]/) ?? withoutQuoted(cmd.text).match(SYNTAX))?.[0];
  if (bad) return { ...cmd, kind: 'refused', reason: `shell syntax the planner does not run (${bad}) in: ${cmd.text.slice(0, 60)}` };
  const tokens = withoutQuoted(cmd.text).split(/\s+/).filter(Boolean);
  const prog = tokens[0];
  if (!WRITERS.has(prog)) return { ...cmd, kind: 'refused', reason: `unclassified command: ${String(prog).slice(0, 40)}` };
  const targets = [];
  const args = [];
  for (let i = 1; i < tokens.length; i += 1) {
    const m = /^(>>?)(.*)$/.exec(tokens[i]);
    if (m) targets.push(m[2] !== '' ? m[2] : tokens[++i] ?? '');
    else args.push(tokens[i]);
  }
  if (prog === 'mkdir' || prog === 'touch') targets.push(...args.filter((a) => !a.startsWith('-')));
  for (const target of targets) {
    if (!SAFE_PATH.test(target) || target.split('/').includes('..')) {
      return { ...cmd, kind: 'refused', reason: `writes outside clients/ (${target.slice(0, 50) || 'no target'})` };
    }
  }
  return { ...cmd, kind: 'file', prog };
}

/**
 * The plan for one case's Setup text: `{ kind, commands, reason? }`, kind one of none · prose · runner ·
 * files · instance · refused.
 */
export function planSetup(setupText) {
  const text = String(setupText ?? '').replace(/^\s*### Setup\s*\n/, '').trim();
  if (text === '') return { kind: 'none', commands: [] };
  const blocks = [...text.matchAll(/```([A-Za-z]*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), body: m[2] }));
  if (blocks.length === 0) return { kind: 'prose', commands: [] };

  const marker = blocks.map((b) => INSTANCE.exec(b.body)?.[0]).find(Boolean);
  const commands = blocks.flatMap((b) => commandsOf(b.body));
  if (marker) return { kind: 'instance', commands: commands.map((c) => ({ ...c, kind: 'instance' })), marker };
  const notShell = blocks.find((b) => !SHELL_LANGS.has(b.lang));
  if (notShell) return { kind: 'refused', commands: [], reason: `a Setup block that is not shell (${notShell.lang})` };

  const classified = commands.map(classify);
  const refused = classified.find((c) => c.kind === 'refused');
  if (refused) return { kind: 'refused', commands: classified, reason: refused.reason };
  if (classified.length === 0) return { kind: 'none', commands: [] };
  return { kind: classified.some((c) => c.kind === 'file') ? 'files' : 'runner', commands: classified };
}

/** What the plan says, without the case id: the same words the header and the run print. */
function describe(plan) {
  switch (plan.kind) {
    case 'none': return 'no Setup';
    case 'prose': return 'Setup is prose - nothing to run';
    case 'runner':
      return `Setup not needed - the runner's own design-mode bootstrap is it (${plan.commands.map((c) => c.text).join('; ')})`;
    case 'instance':
      return `Setup NOT run - needs an instance (${plan.marker}); the session is the design-only dormant variant`;
    case 'files': {
      const files = plan.commands.filter((c) => c.kind === 'file');
      return `Setup run - ${files.length} command${files.length === 1 ? '' : 's'} under clients/ (${[...new Set(files.map((c) => c.prog))].join(', ')})`;
    }
    default: return `Setup REFUSED - ${plan.reason}; the case is not run`;
  }
}

export const summaryLine = (id, plan) => `${id}: ${describe(plan)}`;

/**
 * Run the plan in `cwd`. Only a `files` plan spawns anything, and only its file commands (a runner
 * command alongside them is skipped). `ok` is false for a refused plan and for a command that failed -
 * the caller does not run the case.
 */
export function runSetup(plan, cwd, { run = spawnSync } = {}) {
  if (plan.kind !== 'files') return { ran: false, ok: plan.kind !== 'refused', line: describe(plan) };
  const script = plan.commands.filter((c) => c.kind === 'file').map((c) => c.raw).join('\n');
  const r = run('sh', ['-e', '-c', script], { cwd, encoding: 'utf8' });
  if (r.status === 0) return { ran: true, ok: true, line: describe(plan) };
  const why = String(r.stderr ?? '').trim().split('\n')[0] || (r.error ? String(r.error.message) : '');
  return { ran: true, ok: false, line: `Setup failed (exit ${r.status}) - ${why}; the case is not run` };
}

// ── the command line ───────────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [mode, file, ...rest] = process.argv.slice(2);
  const usage = (msg) => { process.stderr.write(`${msg}\nusage: setup-plan.mjs summary <prompts.json> [T-NN ...] | run <prompts.json> <T-NN> <clone>\n`); process.exit(2); };
  if (!['summary', 'run'].includes(mode) || !file) usage('bad arguments');
  let cases;
  try { cases = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { usage(`cannot read ${file}: ${e.message}`); }
  const find = (id) => cases.find((c) => c.id === id);
  if (mode === 'summary') {
    for (const id of rest.length ? rest : cases.map((c) => c.id)) {
      const c = find(id);
      process.stdout.write(`${c ? summaryLine(id, planSetup(c.setup)) : `${id}: not in the spec`}\n`);
    }
  } else {
    const [id, cwd] = rest;
    const c = find(id);
    if (!c || !cwd) usage(`no such case: ${id}`);
    const plan = planSetup(c.setup);
    const r = runSetup(plan, cwd);
    if (plan.kind !== 'none') process.stdout.write(`${id}: ${r.line}\n`);
    process.exit(r.ok ? 0 : 1);
  }
}
