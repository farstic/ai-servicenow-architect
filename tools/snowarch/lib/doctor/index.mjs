// ARC-08-S01 — the `doctor` command: decide whether it can run at all, then run it.
//
// THE THREE THINGS THAT STOP IT are checked before any check is registered, because each of them
// makes every check meaningless and a report full of failures caused by one of them is a report
// that hides its own cause:
//
//   not at the repository root  →  exit 3, and the remedy is `cd`
//   `engine.config.json` unparsable  →  exit 3, naming the file
//   Node below the floor  →  exit 3, with the per-OS install command
//
// Everything else is a check result. Exit 1 means at least one FAIL; exit 0 means none, warnings
// included; exit 2 is a usage error, which is a fact about the command line rather than the
// checkout.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { loadContract } from '../../../../packages/contract/lib/contract.mjs';
import { EXIT_OK, EXIT_USAGE, EXIT_PREREQ } from '../exit.mjs';
import { meetsFloor } from '../versions.mjs';
import { childEnv } from '../spawn-env.mjs';

import { SECTIONS } from './registry.mjs';
import { engineRegistry, staleBlock } from './checks/index.mjs';
import { collectPrereqs } from './prereqs.mjs';
import { buildReport } from './report-json.mjs';
import { renderText, useColour } from './report-text.mjs';
import { exitCodeFor, runChecks, selectSections } from './runner.mjs';

export const USAGE = [
  'usage: ./snowarch doctor [--json] [--quick] [--no-network] [--fix] [--section <a,b>] [--no-cache]',
  '',
  `  --section <a,b>   only these sections: ${SECTIONS.join(', ')} (server = every SV- check)`,
  '  --quick           the fast subset; implies --no-network and skips anything that spawns',
  '  --no-network      skip every check that would contact the network',
  '  --fix             repair what is marked fixable (ARC-08-S06)',
  '  --json            the machine-readable report (schema 1)',
  '  --no-cache        do not write .local/doctor-last.json',
  '',
  'exit codes:',
  '  0  no FAIL (warnings allowed)',
  '  1  at least one FAIL',
  '  2  usage — an unknown flag or section',
  '  3  the doctor could not run at all',
].join('\n');

/** The message a run from a sub-directory gets. One sentence, and the command that fixes it. */
export const notAtRoot = (root) => `DOCTOR: not at the repository root — run: cd ${root}`;

/**
 * Walk up for `engine.config.json`, and stop at the git top level.
 *
 * `lib/config.mjs` resolves the root from the MODULE's own location, which is right for a launcher
 * that is always inside the checkout. The doctor answers a different question — "is the user's
 * current directory inside a checkout, and which one" — so it walks from the cwd, and the answer
 * `no` is exit 3 rather than a guess.
 */
/** `realpathSync.native` where it works, the path itself where it does not (a path not yet there). */
function realpathOrSelf(p) {
  try { return realpathSync.native(p); } catch { return p; }
}

export function findRoot(from) {
  let current = resolve(from);
  for (;;) {
    if (existsSync(join(current, 'engine.config.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The whole command.
 *
 * `registry` is injected so a test can register exactly the checks its case needs — the default is
 * the engine's twenty-three (ARC-08-S02), and a test that wants one check does not get the other
 * twenty-two's answers in its assertions.
 */
export async function doctorCommand({ flags = {}, log, out = process.stdout, env = process.env,
  cwd = process.cwd(), registry = engineRegistry(), now = () => Date.now(), home = '' } = {}) {
  const started = now();
  const write = (text) => out.write(`${text}\n`);

  const root = findRoot(cwd);
  if (!root) {
    // Nothing above this directory is a checkout. The sentence still names what to do, and says
    // what it does not know rather than inventing a path.
    write(notAtRoot('<the checkout>'));
    return EXIT_PREREQ;
  }
  // INSIDE the checkout is not AT it. Every path in this report — the store, the corpus, the
  // settings — is resolved relative to the root, and a run from `clients/acme/` that quietly used
  // the root anyway would print a report about a directory the reader is not in. Compared through
  // `realpath`, because `/var` is a symlink to `/private/var` on macOS and a temp checkout is
  // reached through both names.
  if (realpathOrSelf(cwd) !== realpathOrSelf(root)) {
    write(notAtRoot(root));
    return EXIT_PREREQ;
  }

  let config;
  try {
    config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  } catch (e) {
    write(`DOCTOR: engine.config.json is unreadable — ${e.message}`);
    return EXIT_PREREQ;
  }

  const floor = config?.floors?.node;
  if (floor && !meetsFloor(process.versions.node, floor).ok) {
    write(`DOCTOR: Node ${process.versions.node} is below the floor ${floor} — `
      + 'install it (macOS: brew install node@22 · Windows: winget install OpenJS.NodeJS.LTS · '
      + "Linux: your distribution's package or nvm)");
    return EXIT_PREREQ;
  }

  const sections = selectSections(flags.section);
  if (sections && sections.unknown.length > 0) {
    write(`unknown section "${sections.unknown[0]}"; valid: ${SECTIONS.join(', ')}`);
    return EXIT_USAGE;
  }

  // `verifyPin: false`: a stale pin is a CHECK RESULT (E-22, ARC-08-S03), not a crash. A doctor
  // that refused to start because the thing it diagnoses is broken would be useless exactly when
  // it is needed (ARC-05-S10 criterion 2).
  let contract = null;
  try {
    contract = loadContract({ root, verifyPin: false });
  } catch { contract = null; }

  const options = {
    quick: flags.quick === true,
    // `--quick` implies `--no-network`: the subset exists to be fast, and a network round trip is
    // the slowest thing the doctor does.
    noNetwork: flags['no-network'] === true || flags.quick === true,
    fix: flags.fix === true,
    section: flags.section ?? null,
    sections: sections ? sections.names : null,
  };

  const ctx = {
    root,
    config,
    contract,
    flags: options,
    platform: process.platform,
    env: childEnv(root),
    // Supplied by the entry point. Nothing under `lib/` reads the home directory itself — the
    // repo-wide rule — and the doctor needs it only to shorten a path to `~` in a report.
    home,
    now,
  };

  const checks = registry.all();
  const { results, summary } = await runChecks(checks, ctx, { ...options, home });

  const report = buildReport({
    results,
    checks,
    summary,
    options,
    root,
    durationMs: now() - started,
    prereqs: collectPrereqs({ root, config, env }),
    // Filled by ARC-08-S03's detectors, from their own results — `null` until one of them ran, so
    // a `--section contract` run does not claim there are no leftovers.
    stale: results.some((r) => ['E-23', 'E-24'].includes(r.id) && r.status !== 'skip')
      ? staleBlock(results)
      : null,
  });

  if (flags.json) {
    write(JSON.stringify(report, null, 2));
  } else {
    write(renderText({ report, checks, colour: useColour({ stream: out, env }) }));
  }
  if (log?.commit) log.commit();
  return summary.fail > 0 ? exitCodeFor(summary) : EXIT_OK;
}
