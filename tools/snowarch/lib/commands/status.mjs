/**
 * ARC-08-C18 — `./snowarch status`: the panel, as a command.
 *
 * It exists so that a terminal user and a Claude session read the SAME lines. SKILL.md § status
 * used to be a renderer in prose — seven lines with their JSON keys in brackets, a null rule, a
 * failure branch, an exit-3 branch and three named causes for "the doctor cannot run" — executed by
 * a language model once per session. Everything it described is now code: `renderPanel` for the
 * seven lines, `resolveCheckout` for the exit-3 branch, and `fallbackPanel` below for the causes,
 * each named only when this command actually observed it.
 *
 * IN-PROCESS, not a spawn of `./snowarch doctor --quick --json`. The SessionStart banner runs on a
 * budget ARC-09-C8 measured in single milliseconds on Windows, and a spawn spends a whole Node
 * start-up before the first check runs.
 *
 * `--json` emits the doctor report UNCHANGED — byte-for-byte what `doctor --quick --json` prints,
 * masked at the same boundary. A panel-shaped JSON would be a second schema for one set of facts,
 * and the first consumer to read the wrong one would be reading a shape nothing maintains.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXIT_FAIL, EXIT_OK, EXIT_PREREQ } from '../exit.mjs';
import { BANNER } from '../text.mjs';
import { resolveCheckout, runDoctor } from '../doctor/index.mjs';
import { maskForJson } from '../doctor/json-boundary.mjs';
import { renderPanel } from '../doctor/panel.mjs';

export const USAGE = [
  'usage: ./snowarch status [--json]',
  '',
  '  The one-screen panel: mode, engine, docs, roster, capabilities, instances and the quick',
  '  doctor. `--json` prints the doctor report itself, exactly as `doctor --quick --json` does.',
  '',
  '  Exit: 0 when no check failed, 1 when one did. A 1 is a finding about the checkout, not a',
  '  failure to render — the panel is printed either way.',
].join('\n');

/**
 * What to print when the doctor could not run at all.
 *
 * The mode is READ from `.local/bootstrap-state.json` rather than derived, and the sentence says
 * so — "from bootstrap state" is the difference between a fact established a moment ago and one
 * the bootstrap recorded at install time, and a reader deciding whether to trust it needs to know
 * which they have.
 *
 * THE CAUSE IS PASSED IN, never assumed. SKILL.md's rule was *"never state a cause you did not
 * check"* and then `BANNER.fromState` stated one unconditionally: *"until Node 20+ is installed"*,
 * which is the one cause this command can never be the one to report — a machine without Node
 * cannot run it to find out. Every caller below names what it actually observed.
 *
 * When the state file is missing or unreadable the panel says THAT, rather than a mode it does not
 * have. A remedy for the wrong problem costs the reader the time they spend following it.
 */
export function fallbackPanel(root, cause, { read = readFileSync, exists = existsSync } = {}) {
  const path = join(root, '.local', 'bootstrap-state.json');
  if (!exists(path)) {
    return `Mode: unknown — doctor unavailable ${cause}, and .local/bootstrap-state.json is`
      + ' absent — run ./bootstrap.sh (Windows: bootstrap.cmd)';
  }
  try {
    const state = JSON.parse(read(path, 'utf8'));
    return BANNER.fromState(state.mode ?? 'unknown', state.updatedAt ?? 'unknown', cause);
  } catch (e) {
    return `Mode: unknown — doctor unavailable ${cause}, and .local/bootstrap-state.json is`
      + ` unreadable (${e.message})`;
  }
}

export async function statusCommand({ flags = {}, log, out = process.stdout, env = process.env,
  cwd = process.cwd(), home = '', now = () => Date.now(), registry = undefined } = {}) {
  const write = (text) => out.write(`${text}\n`);

  const checkout = resolveCheckout({ cwd, who: 'STATUS' });
  if (checkout.problem) {
    // Exit 3 and its remedy, from the one preamble the doctor uses. The skill's step 4 — "print
    // the cd remedy and nothing else about mode" — is this branch, and it is now the command's
    // because the command is what observed it.
    write(checkout.problem.message);
    if (log?.commit) log.commit();
    return checkout.problem.exit;
  }
  const { root, config } = checkout;

  let report;
  try {
    ({ report } = await runDoctor({
      root,
      config,
      ...(registry ? { registry } : {}),
      quick: true,
      // `--quick` implies no network in `doctorCommand`, and the implication is the point rather
      // than a detail: a session must answer in under a second and a round trip is the slowest
      // thing here. Stated rather than inherited, because this call does not go through the flags.
      noNetwork: true,
      fix: false,
      section: null,
      sections: null,
      writeCache: 'auto',
      started: now(),
      env,
      home,
      now,
    }));
  } catch (e) {
    // It ran and failed. The CLASS, never the message: a message can carry a path or a value, and
    // this line is pasted into conversations.
    write(fallbackPanel(root, `after it failed (${e?.constructor?.name ?? 'Error'})`));
    if (log?.commit) log.commit();
    return EXIT_FAIL;
  }

  if (flags.json) {
    write(JSON.stringify(maskForJson(report, { home }), null, 2));
  } else {
    write(renderPanel(report));
  }
  if (log?.commit) log.commit();
  // The doctor's verdict, so a script can branch on it. The panel is on the screen either way.
  return report.summary.fail > 0 ? EXIT_FAIL : EXIT_OK;
}

// Re-exported so a caller that already has a report — the banner, a test — renders the same panel
// without going through the command. One renderer, whatever the path in.
export { renderPanel, EXIT_PREREQ };
