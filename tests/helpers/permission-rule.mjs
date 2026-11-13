// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C268 phase B — the one shape of Claude Code permission rule this product writes, and what it matches.
 *
 * `Tool(<command> *)`: a trailing ` *` after the subcommand. Claude Code's permissions page (the "Wildcard patterns" section)
 * gives its meaning: the text before the `*` is matched as written, the space before it is part of the rule, and a trailing
 * ` *` also matches the bare command. So `Bash(ls *)` matches `ls -la` and `ls`, and does not match `lsof`.
 *
 * THIS IS NOT CLAUDE CODE'S MATCHER and does not claim to be. It reads the one form the generator writes and refuses every other
 * (a rule with a `*` anywhere else returns `null`, so a broader rule cannot pass for a covered one by being read generously).
 * What it fixes is the agreement between three things this repository holds apart: the command the gateways tell a session to
 * run, the entry the generator writes for it, and the launcher spelling the product prints for each shell. The real matcher is
 * measured by a sitting, not here.
 */

/** `Bash(./snowarch docs lookup *)` → `{ tool: 'Bash', body: './snowarch docs lookup *' }`; anything that is not `Tool(...)` → null. */
export function parseRule(rule) {
  const m = /^([A-Za-z][A-Za-z0-9_]*)\(([\s\S]*)\)$/.exec(String(rule));
  return m ? { tool: m[1], body: m[2] } : null;
}

/**
 * Does this rule let `tool` run `command` without asking?
 * Only for the form `<prefix> *` with that `*` the only one; any other form is not answered here (it returns false, so a test
 * that expects "covered" fails loudly on a rule of another shape). PowerShell rules match case-insensitively; Bash rules do not.
 */
export function ruleAllows(rule, tool, command) {
  const r = parseRule(rule);
  if (!r || r.tool !== tool) return false;
  const stars = r.body.split('*').length - 1;
  if (stars !== 1 || !r.body.endsWith(' *')) return false;
  const fold = (s) => (tool === 'PowerShell' ? s.toLowerCase() : s);
  const prefix = fold(r.body.slice(0, -2));
  const text = fold(String(command));
  return text === prefix || text.startsWith(`${prefix} `);
}
