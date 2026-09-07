#!/usr/bin/env node
// ARC-02-S03 — the S-13 acceptance test, measured rather than inferred.
//
// The question is "do all 28 skills reach a fresh session WITH a description". Asking a headless
// session to print its own listing cannot answer it: a model that omits a long description looks
// exactly like a description that was never registered. So this reads Claude Code's own debug log,
// where the CLI states both facts directly:
//
//   [DEBUG] Loading skills from: managed=…, user=…, project=[…]
//   [DEBUG] Loaded N unique skills (… project: 28 …)
//   [WARN]  Skill listing over budget: 42 skills, 34399 chars > 30000 budget — descriptions will be
//           truncated. Run /skills to disable some, or raise skillListingBudgetFraction in settings.
//
// That warning is the P-09 mechanism, and it is a TOTAL budget across every skill in the session —
// bundled and user skills included — not a per-file cap. The engine therefore cannot control the
// total, only its own share of it.
//
// THE WALK-UP. Claude Code discovers project skills from EVERY `.claude/skills` on the path from cwd
// upward, not just cwd's own. A scratch project created under a directory that already has one gets
// BOTH sets, and `project:` counts them together — 56 where 28 was expected. That is a product fact,
// not a quirk of this script: a user who clones the engine beneath a folder that already carries
// `.claude/skills` loads both rosters. So the scratch parent is chosen only after checking its
// ancestors, the `project=[…]` list is required to name exactly the scratch directory, and when no
// clean parent exists the measurement is SKIPPED with that reason. It never reports a number it
// cannot trust, and never passes on one.
//
// Usage: node scripts/ci/skill-listing-check.mjs
// Exit 0 = all roster skills registered and nothing truncated. 1 = mismatch, over budget, or polluted.
// Exit 2 = could not measure (CLI absent, or no uncontaminated scratch parent).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = (s) => process.stdout.write(`${s}\n`);
const roster = () => JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')).roster.skills;

function cliVersion() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Every ancestor of `dir`, inclusive, that carries a .claude/skills — the directories whose skills
// would be loaded alongside the scratch project's own.
export function pollutingAncestors(dir) {
  const found = [];
  let cur = resolve(dir);
  for (;;) {
    if (existsSync(join(cur, '.claude', 'skills'))) found.push(cur);
    const up = dirname(cur);
    if (up === cur || cur === parse(cur).root) break;
    cur = up;
  }
  return found;
}

// The first candidate parent with no .claude/skills anywhere above it.
export function cleanScratchParent(candidates = [tmpdir(), '/tmp']) {
  const tried = [];
  for (const c of candidates) {
    if (!c || !existsSync(c)) continue;
    const real = realpathSync(c);
    const polluted = pollutingAncestors(real);
    if (!polluted.length) return { parent: real, tried };
    tried.push({ candidate: real, polluted });
  }
  return { parent: null, tried };
}

export function measure() {
  const version = cliVersion();
  if (!version) return { skipped: true, reason: 'claude CLI not available on this runner (S-19)' };

  const { parent, tried } = cleanScratchParent();
  if (!parent) {
    const why = tried.map((t) => `${t.candidate} (ancestor .claude/skills at ${t.polluted.join(', ')})`).join('; ');
    return { skipped: true, version, reason: `no uncontaminated scratch parent — an ancestor .claude/skills doubles the count: ${why}` };
  }

  const dir = mkdtempSync(join(parent, 'snowarch-listing-'));
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    cpSync(join(root, '.claude/skills'), join(dir, '.claude/skills'), { recursive: true });
    const log = join(dir, 'debug.log');
    spawnSync('claude', ['--debug-file', log, '-p', 'say OK', '--output-format', 'text'],
      { cwd: dir, stdio: 'ignore', input: '' });
    if (!existsSync(log)) return { skipped: true, version, reason: 'the CLI wrote no debug log' };
    const text = readFileSync(log, 'utf8');

    // The roots actually scanned. Anything but our own scratch directory invalidates the count.
    const roots = text.match(/Loading skills from:.*?project=\[([^\]]*)\]/s);
    const scanned = roots ? roots[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
    const expected = realpathSync(join(dir, '.claude', 'skills'));
    const extra = scanned.filter((p) => {
      try { return realpathSync(p) !== expected; } catch { return true; }
    });
    if (!scanned.length) return { skipped: true, version, reason: 'the debug log names no project skill roots' };
    if (extra.length) {
      return { skipped: true, version,
        reason: `the scratch project is not isolated — ancestor .claude/skills doubles the count: ${extra.join(', ')}` };
    }

    const loaded = text.match(/Loaded (\d+) unique skills \(([^)]*)\)/);
    const project = loaded && /project: (\d+)/.exec(loaded[2]);
    const sent = text.match(/Sending (\d+) skills via attachment/);
    const over = text.match(/Skill listing over budget: (\d+) skills, (\d+) chars > (\d+) budget/);
    const projectSkills = project ? Number(project[1]) : null;

    return {
      version,
      scratch: dir,
      projectSkills,
      roster: roster(),
      ok: !over && projectSkills === roster(),
      totalLoaded: loaded ? Number(loaded[1]) : null,
      sent: sent ? Number(sent[1]) : null,
      chars: over ? Number(over[2]) : null,
      budget: over ? Number(over[3]) : null,
      warning: over ? over[0] : null,
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = measure();
  if (r.skipped) { out(`skill-listing: SKIPPED — ${r.reason}`); process.exit(2); }
  out(`skill-listing: claude ${r.version}`);
  out(`  project skills registered: ${r.projectSkills} (engine.config.json roster: ${r.roster})`);
  out(`  total skills in the listing: ${r.totalLoaded} loaded, ${r.sent} sent`);
  let failed = false;
  if (r.projectSkills !== r.roster) {
    out(`  MISMATCH: ${r.projectSkills} registered != ${r.roster} in engine.config.json`);
    failed = true;
  }
  if (r.warning) {
    out(`  OVER BUDGET: ${r.chars} chars > ${r.budget} — descriptions are truncated`);
    out(`  ${r.warning}`);
    failed = true;
  }
  if (failed) { out('skill-listing: FAILED'); process.exit(1); }
  out('  no truncation warning — every listed description is sent whole');
  out('skill-listing: OK');
}
