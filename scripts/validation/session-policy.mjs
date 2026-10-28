// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
//   --setting-sources  `project,local`: the clone's own settings and hooks, never the machine's. `local` is the
//                      clone's `.claude/settings.local.json`, which the bootstrap writes with the SessionStart
//                      hook in it (ARC-06-S05 keeps the committed file hook-free). Without it the hook does not
//                      run, the session has no Licence line, and T-31 cannot fire (ARC-11-C6, 2026-10-12).
//   --strict-mcp-config  with no --mcp-config: a design-only run reaches no ServiceNow server, and does
//                      not depend on a user-scope registration the run does not control.
//   --model            Sonnet 5.5 unless VALIDATION_MODEL says otherwise.
import { pathToFileURL } from 'node:url';
import { POSIX } from '../../tools/snowarch/lib/launcher-spelling.mjs';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const SETTING_SOURCES = 'project,local';

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
  // ARC-09-C221 — the note and aliases.txt are written, the masker and the status read are run. Write is allowed for
  // any path here, so T-37's pass criteria read the tree diff, not the model's words, for "nothing else was written".
  'T-37': { tools: ['Bash', 'Write'], allowed: ['Write', 'Bash(node tools/snowarch/lib/finding.mjs *)', `Bash(${CLI} status:*)`] },
  // ARC-09-C243 — T-38 prints the status panel and may run the doctor for the remedy it names: Bash for those two commands
  // and no other, and no Write. It is the first case with no licence that needs a tool, so the panel can be printed at all.
  'T-38': { tools: ['Bash'], allowed: [`Bash(${CLI} status:*)`, `Bash(${CLI} doctor:*)`] },
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
    `setting sources: ${SETTING_SOURCES} (the clone's settings and hooks, its bootstrap-written local file included; user settings are not loaded)`,
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
