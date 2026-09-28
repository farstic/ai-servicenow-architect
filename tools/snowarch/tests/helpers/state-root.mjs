/**
 * ARC-07-C43 head 2 — a suite that runs the real CLI writes its `.local/` somewhere else.
 *
 * WHAT THIS IS FOR, measured rather than argued. Five suites left eight files in the repository's own
 * `.local/` on every `npm test` — `logs/doctor-*.log`, `logs/mode-*.log`, two `logs/instance-*.log`,
 * two `logs/store-*.log`, and `doctor-last.json`, `doctor-last.inputs.json` and `upgrade-check.json`.
 * A test that writes into the tree it is testing can make the NEXT test pass or fail for a reason
 * neither of them names, and `.local/` is gitignored, so `assert-clean` — the gate whose whole job is
 * to say the install changed nothing — could not see any of it.
 *
 * WHY A `cwd` IS NOT THE ANSWER. `config.mjs` derives `root` from THAT FILE's own location, never
 * `process.cwd()`, so that a CLI invoked from a subdirectory still finds the corpus and the contract.
 * A child given a temp `cwd` therefore discovers the same checkout and writes the same `.local/`. The
 * only thing that moves it is the state root, which is what `SNOWARCH_STATE_ROOT` sets.
 *
 * WHY `process.env` AND NOT A PER-SPAWN OPTION. Both kinds of call have to move. A spawned child
 * inherits the environment, and these suites also call product functions IN-PROCESS with the real root
 * — `writeDoctorCache(root, …)` in the B08 cases, a logger built with no `logRoot` — and those read
 * `stateRoot`'s default. One assignment at import covers both; a per-spawn option would cover half and
 * look complete. `node --test` gives each FILE its own process, so this reaches that file only.
 *
 * It is deliberately NOT in `temp.mjs`. That file is about removing fixtures; this is about where the
 * product is allowed to write. A reader looking for either should not have to read the other.
 */
import { tempDir } from './temp.mjs';

let dir = null;

/**
 * Point this test file's state root at a private temp directory, and return it.
 *
 * Idempotent: the first call makes the directory and every later one returns it, so a suite may call
 * it at import and a case may ask for the path to assert against. Tracked by `temp.mjs`, so it is
 * removed at exit even when the run is killed.
 *
 * `t` is optional and worth passing when there is one — it gets the directory removed when the test
 * ENDS rather than when the process does.
 */
export function useStateRoot(t) {
  if (!dir) {
    dir = tempDir('snowarch-state-root-', t);
    process.env.SNOWARCH_STATE_ROOT = dir;
  }
  return dir;
}

/** The directory in use, or `null` — for a case that wants to assert against it without making one. */
export const stateRootInUse = () => dir;
