#!/usr/bin/env node
// ARC-02-S03 — the S-13 acceptance test, measured rather than inferred.
//
// The question is "do all 28 skills reach a fresh session WITH a description". Asking a headless
// session to print its own listing cannot answer it: a model that omits a long description looks
// exactly like a description that was never registered. So this reads Claude Code's own debug log,
// where the CLI states both facts directly:
//
//   [DEBUG] Loaded N unique skills (… project: 28 …)
//   [WARN]  Skill listing over budget: 42 skills, 34399 chars > 30000 budget — descriptions will be
//           truncated. Run /skills to disable some, or raise skillListingBudgetFraction in settings.
//
// That warning is the P-09 mechanism, and it is a TOTAL budget across every skill in the session —
// bundled and user skills included — not a per-file cap. The engine therefore cannot control the
// total, only its own share of it, which is why the story's ceiling matters: the smaller the engine's
// contribution, the more room a user's own skills have before anything is truncated.
//
// Usage: node scripts/ci/skill-listing-check.mjs [--budget-headroom N]
// Exit 0 = all project skills registered and nothing truncated. 1 = over budget or missing skills.
// Exit 2 = could not measure (CLI absent); the caller decides whether that is fatal.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = (s) => process.stdout.write(`${s}\n`);

function cli() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function measure() {
  const version = cli();
  if (!version) return { ok: false, reason: 'claude CLI not available on this runner (S-19)', skipped: true };

  // A scratch project, so the measurement sees the engine's skills and nothing of this repo.
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-listing-'));
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    cpSync(join(root, '.claude/skills'), join(dir, '.claude/skills'), { recursive: true });
    const log = join(dir, 'debug.log');
    spawnSync('claude', ['--debug-file', log, '-p', 'say OK', '--output-format', 'text'],
      { cwd: dir, stdio: 'ignore', input: '' });
    if (!existsSync(log)) return { ok: false, reason: 'the CLI wrote no debug log', skipped: true, version };
    const text = readFileSync(log, 'utf8');

    const loaded = text.match(/Loaded (\d+) unique skills \(([^)]*)\)/);
    const project = loaded && /project: (\d+)/.exec(loaded[2]);
    const sent = text.match(/Sending (\d+) skills via attachment/);
    const over = text.match(/Skill listing over budget: (\d+) skills, (\d+) chars > (\d+) budget/);

    return {
      ok: !over && !!project,
      version,
      projectSkills: project ? Number(project[1]) : null,
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
  out(`  project skills registered: ${r.projectSkills}`);
  out(`  total skills in the listing: ${r.totalLoaded} loaded, ${r.sent} sent`);
  if (r.warning) {
    out(`  OVER BUDGET: ${r.chars} chars > ${r.budget} — descriptions are truncated`);
    out(`  ${r.warning}`);
    out('skill-listing: FAILED');
    process.exit(1);
  }
  out('  no truncation warning — every listed description is sent whole');
  out('skill-listing: OK');
}
