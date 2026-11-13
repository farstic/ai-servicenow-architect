// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The MCP entries of `permissions.allow` and `permissions.ask` in `.claude/settings.json`.
 *
 * This is the mechanical half of §2.1. The rule file tells a session to ask before a mutating call;
 * this makes the harness ask whether or not the session remembers to — and on a plan where sessions
 * start in auto mode, that difference is the whole protection. S-18 confirmed it with a control: an
 * `ask` rule prompts in auto mode, and without one a mutating tool runs unprompted.
 *
 * `ask` is `mutates || sessionMutates`. `snow_core_instance_switch` changes no record and redirects
 * where every later write lands; a generator reading `mutates` alone would leave that one action
 * unprompted and then prompt every write that follows it.
 *
 * Everything that is not an MCP entry of this server is preserved exactly — other `allow` rules,
 * `env`, `hooks`, and any key this renderer has never heard of. ARC-06-S01 merges its own blocks
 * into this file; it does not write over it.
 *
 * ONE NON-MCP ENTRY PAIR IS OURS (ARC-09-C268 phase B): `docs lookup`, the read-only search of the bundled corpus that the six
 * gateways tell a session to run before it calls a construct absent. In `design-only` mode there is no MCP tool to read the
 * corpus with, so the lookup runs through the shell, and a prompt on every lookup is a prompt in the middle of grounding. The
 * entry is written here, never by hand, so `npm run gen` regenerates it and `gen:check` finds a hand edit. It is exactly the
 * command and nothing broader: not `./snowarch *`, not `docs *`, not a bare `Bash`.
 */

import { askList } from '../lib/contract.mjs';
import { spellings } from '../../../tools/snowarch/lib/launcher-spelling.mjs';

/** Two entries, in the order they appear in the JSON. Sorted inside each. */
function entries(tools, prefix, style) {
  const names = tools.map((t) => `${prefix}${t.name}`).sort();
  if (style !== 'glob') return names;
  // The glob path exists and is tested against the full catalogue (criterion 7), and is not what
  // the config selects. S-12 confirmed middle-wildcard globs match in both directions, so it works
  // — but one entry per tool is deterministic, diffable and lint-checkable, and a glob saves lines
  // in a generated file at the cost of a matching bug nobody would see until a tool ran unprompted.
  const families = [...new Set(tools.map((t) => t.name.split('_')[1]))].sort();
  return families.map((f) => `${prefix}snow_${f}_*`);
}

export const target = '.claude/settings.json';

/** The Claude Code tools denied to every session in this checkout (ARC-09-C123). */
export const WEB_TOOLS = ['WebFetch', 'WebSearch'];

/**
 * The one product command a session may run without asking (ARC-09-C268 phase B): the two words after the launcher.
 *
 * TWO ENTRIES, ONE PER SHELL TOOL, because a `Bash` rule does not cover the `PowerShell` tool: Claude Code gives each its own
 * rule namespace, and on Windows the model types `.\snowarch.cmd`, which only the PowerShell tool runs. Each launcher is read
 * from the one definition (`launcher-spelling.mjs`) with its platform PINNED, like every other generator that spells one: this
 * file is committed, so its bytes are the same on every runner, and it renders both shells on purpose.
 *
 * THE SHAPE is the documented one: a trailing ` *` after the subcommand, which also matches the bare command and does not match
 * `docs lookupx` (the `ls *` / `lsof` row of Claude Code's permissions page). Claude Code's own "don't ask again" writes the same
 * form. Compound commands are split and every part is judged on its own, so a rule for this command lets nothing else through.
 */
export const LOOKUP_COMMAND = 'docs lookup';
const POSIX_CLI = spellings({ platform: 'linux', env: {} }).cli;
const WINDOWS_CLI = spellings({ platform: 'win32', env: {} }).cli;
export const LOOKUP_ALLOW = Object.freeze([
  `Bash(${POSIX_CLI} ${LOOKUP_COMMAND} *)`,
  `PowerShell(${WINDOWS_CLI} ${LOOKUP_COMMAND} *)`,
]);

export function render(ctx) {
  const { contract, serverKey, config, current, retired } = ctx;
  const prefix = `mcp__${serverKey}__`;
  const style = config?.mcp?.permissions ?? {};
  if (!style.allowStyle || !style.askStyle) {
    throw new Error('engine.config.json has no mcp.permissions { allowStyle, askStyle }');
  }
  if (style.askStyle === 'deny-with-hook') {
    // The S-18 fallback: `deny` plus a PreToolUse hook. The spike confirmed `ask` works, so this
    // path is a recorded design decision rather than dead code pretending to be a feature.
    throw new Error('askStyle "deny-with-hook" is the S-18 fallback and is not implemented — '
      + 'S-18 CONFIRMED that "ask" prompts in auto mode, so it was never needed');
  }

  // A settings file may not exist yet; the minimal shape is the one ARC-06-S01 builds on.
  const settings = current ? JSON.parse(current) : { permissions: {} };
  settings.permissions ??= {};

  // Ownership is decided by the TOOL name, not by the prefix.
  //
  // By prefix, a change to `mcp.serverKey` leaves every entry of the old key in place — they no
  // longer match, so they read as another server's rules — and the file ends up carrying 397 rules
  // for a server that no longer exists under that name, beside 397 new ones. The prefix rule was
  // trying to protect a third party's entries; the tool name protects them just as well, because
  // `mcp__other__thing` is not one of our tools whatever prefix it wears.
  //
  // Retired names are included: an entry for a tool this server used to have is ours to remove, and
  // leaving it would keep a dead rule alive across a rename.
  const ours = new Set([...contract.tools.map((t) => t.name), ...Object.keys(retired ?? {})]);
  const mine = (e) => {
    if (typeof e !== 'string') return false;
    const m = /^mcp__(.+?)__(.+)$/.exec(e);
    return m ? ours.has(m[2]) : false;
  };
  const keep = (list) => (Array.isArray(list) ? list.filter((e) => !mine(e)) : []);

  // `askList` comes from the loader, not from a filter written here. Three callers need the same
  // set — this block, the rule file's count, and ARC-08's doctor — and a second `t.mutates ||
  // t.sessionMutates` is a second definition free to lose the second half.
  const writes = askList(contract);
  const asked = new Set(writes.map((t) => t.name));
  const reads = contract.tools.filter((t) => !asked.has(t.name));

  // A user's own entries keep the head of the list; the lookup pair is written once after them, so a file that already has it
  // (the committed one, on every regeneration) does not gain a second copy; the MCP entries follow.
  settings.permissions.allow = [...keep(settings.permissions.allow).filter((e) => !LOOKUP_ALLOW.includes(e)),
    ...LOOKUP_ALLOW, ...entries(reads, prefix, style.allowStyle)];
  settings.permissions.ask = [...keep(settings.permissions.ask), ...entries(writes, prefix, style.askStyle)];
  // ARC-09-C123: the main thread is denied the web tools, as ARC-09-C115 took them from the sub-agents. A user's own
  // deny entries keep their place at the head; these two are written once, after them.
  const own = Array.isArray(settings.permissions.deny) ? settings.permissions.deny : [];
  settings.permissions.deny = [...own.filter((e) => !WEB_TOOLS.includes(e)), ...WEB_TOOLS];

  // Two spaces and a trailing newline, like every other JSON in the repository.
  return `${JSON.stringify(settings, null, 2)}\n`;
}
