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
