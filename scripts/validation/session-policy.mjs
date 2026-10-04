// ARC-09-C87 — what a validation session is allowed to be, as data a test can read.
//
// The runner used to hand each session `--allowedTools "Read,Grep,Glob,Skill"`. That is permission, not
// confinement: the session still had every other tool, and the sittings that used it saw read-only Bash
// and an async sub-agent run with no denial. It also inherited the machine's user-level settings and
// hooks, so two reviewers on two machines were not running the same session. The policy lives here, in a
// module the shell calls and a test imports, so the flags are not retyped in two places.
//
//   --tools            the tools that EXIST in the session. Nothing else is there to be allowed or denied.
//   --allowedTools     permission for the ones that would otherwise ask (Bash patterns, Write).
//   --setting-sources  `project` alone: the checkout's own settings and hooks, not the machine's.
//   --strict-mcp-config  with no --mcp-config: a design-only run reaches no ServiceNow server, and does
//                      not depend on a user-scope registration the run does not control.
//   --model            Sonnet 5.5 unless VALIDATION_MODEL says otherwise.
import { pathToFileURL } from 'node:url';
import { POSIX } from '../../tools/snowarch/lib/launcher-spelling.mjs';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const SETTING_SOURCES = 'project';

const BASE = ['Read', 'Grep', 'Glob', 'Skill'];
// `Skill` is in the base: without it `Skill snowarch status` errors in an untrusted headless session and
// the engine recovers by running the doctor itself, which is the engine being resourceful about a
// harness limitation, not the behaviour under test. The two extras are what two cases cannot run without.
// The launcher is READ, not spelled (ARC-07-C31), and PINNED to the POSIX rendering: the runner is a shell script,
// and the session it drives types the launcher the way its own shell does.
const CLI = POSIX.cli;
const EXTRA = {
  'T-07': { tools: ['Bash'], allowed: [`Bash(${CLI}:*)`, `Bash(${CLI} doctor:*)`] },
  'T-13': { tools: ['Write'], allowed: ['Write'] },
};

/** The tool set and the permissions for one case. */
export function policyFor(id) {
  const extra = EXTRA[id] ?? { tools: [], allowed: [] };
  return { tools: [...BASE, ...extra.tools], allowed: [...BASE, ...extra.allowed] };
}

/** The run's header: what a reviewer needs to know about the session before reading any of it. */
export function header({ tag, sha, model, version }) {
  const extras = Object.entries(EXTRA).map(([id, e]) => `  ${id} adds ${e.allowed.filter((a) => !BASE.includes(a)).join(', ')}`);
  return [
    `validation run: ${tag} @ ${sha}`,
    `claude: ${version}`,
    `model: ${model}`,
    `setting sources: ${SETTING_SOURCES} (the checkout's settings and hooks; user and local settings are not loaded)`,
    'mcp: none (--strict-mcp-config): a design-only run reaches no ServiceNow server',
    `tools: ${BASE.join(',')} (--tools: only these exist in the session; no sub-agent, web or edit tool)`,
    ...extras,
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const out = {
    model: () => DEFAULT_MODEL,
    sources: () => SETTING_SOURCES,
    tools: () => policyFor(rest[0]).tools.join(','),
    allowed: () => policyFor(rest[0]).allowed.join(','),
    header: () => header({ tag: rest[0], sha: rest[1], model: rest[2], version: rest[3] ?? 'unknown' }).join('\n'),
  }[cmd];
  if (!out) { console.error('usage: session-policy.mjs model | sources | tools <T-NN> | allowed <T-NN> | header <tag> <sha> <model> <version>'); process.exit(2); }
  console.log(out());
}
