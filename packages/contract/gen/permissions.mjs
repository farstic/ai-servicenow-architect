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
 */

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

  const reads = contract.tools.filter((t) => !t.mutates && !t.sessionMutates);
  const writes = contract.tools.filter((t) => t.mutates || t.sessionMutates);

  settings.permissions.allow = [...keep(settings.permissions.allow), ...entries(reads, prefix, style.allowStyle)];
  settings.permissions.ask = [...keep(settings.permissions.ask), ...entries(writes, prefix, style.askStyle)];

  // Two spaces and a trailing newline, like every other JSON in the repository.
  return `${JSON.stringify(settings, null, 2)}\n`;
}
