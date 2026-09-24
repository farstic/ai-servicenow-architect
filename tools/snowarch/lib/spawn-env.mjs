// ARC-06-S08 — the environment every child of ours is given.
//
// One rule, and it is worth stating plainly because it cost a reviewer's clone a failing run:
//
//   A VARIABLE CLAUDE CODE SETS PER SESSION IS NEVER READ FROM THE ENVIRONMENT BY OUR OWN SPAWNS.
//   IT IS SET.
//
// `CLAUDE_PROJECT_DIR` is the project root of the session that spawned the process. When the
// bootstrap spawns something, the bootstrap is that session — so an inherited value is somebody
// else's answer to our question. Inside a Claude Code session pointed at another repository it made
// the handshake start a server from that repository (`Cannot find module`, exit 1), and it would
// have made the server CLI read and write that repository's `.local/instances.json`: the server
// resolves its store as `<CLAUDE_PROJECT_DIR ?? cwd>/.local/instances.json`.
//
// Neither failure is visible in a plain terminal or in CI, where the variable is unset. That is
// exactly why it belongs in one helper with a test, rather than in each caller's memory.
export const SESSION_VARIABLES = Object.freeze(['CLAUDE_PROJECT_DIR']);

/**
 * `process.env` plus what the caller wants, with the session variables pinned to this checkout.
 *
 * `extra` wins over the inherited environment, and the session variables win over both: a caller
 * that passed `CLAUDE_PROJECT_DIR` explicitly would be making the same mistake one level up.
 */
export function childEnv(root, extra = {}, base = process.env) {
  return { ...base, ...extra, CLAUDE_PROJECT_DIR: root };
}

/**
 * The step whose `run()` is in flight, told to its own child processes.
 *
 * ARC-08-C32 (E-29's false FAIL). B09's job includes spawning `doctor --quick --json`, and the runner
 * records a step only AFTER its `run()` returns — so while the doctor is being asked for the summary
 * B09 will print, B09 is not in `.local/bootstrap-state.json`. E-29 checks that every planned step
 * is recorded, so on every first design-only bootstrap it reported
 *
 *     E-29 FAIL the bootstrap finished: bootstrap incomplete since <version>: B09 never ran
 *
 * under the very step that was running it — the first FAIL a new user ever sees, with a remedy
 * (`./bootstrap.sh`) that would re-run an install which had just finished. The install was fine; the
 * sentence was false.
 *
 * WHY AN ENVIRONMENT VARIABLE AND NOT A MARKER IN THE STATE FILE. A persisted `running` entry
 * survives the process that wrote it: a `SIGKILL` mid-step would leave it behind, and E-29 would
 * then treat a genuinely unfinished install as "in progress" for ever — the defect this check exists
 * to catch, facing the other way. This variable exists only inside the children of a step that is
 * actually running, so there is nothing to go stale and no clock to get wrong.
 *
 * The VALUE is the step's own id, passed by the step rather than spelled in the reader: E-29 excludes
 * "the step running me", not "B09".
 */
export const RUNNING_STEP_ENV = 'SNOW_BOOTSTRAP_RUNNING_STEP';
