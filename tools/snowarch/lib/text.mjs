// ARC-06-S09 — the sentences the installation ends with, in one place.
//
// Two of them are promises. The `Mode:` line is quoted verbatim by the SessionStart banner, by
// `/snowarch status` and by `snowarch mode`, so four programs must agree on its shape or a user
// sees three different answers to "what am I in". And the dialog count is a promise made before
// first contact: say one and show two, and the tool has lied in the first thirty seconds.
//
// So both live here, `text.json` is generated from this file, and the Node-free launchers read that
// rather than repeating the strings.

/**
 * How many Claude Code dialogs a first `claude` will show.
 *
 * ONE, from the owner's sitting on 2.1.258 (2026-09-07), recorded in
 * `docs/plans/03-RISKS-AND-UNKNOWNS.md` §F as the S-01 dialog-count row: `live` = 1 (workspace trust
 * only), `design` = 1, and `control` — no toggle written — = 2. A test reads that row and fails if
 * the two ever disagree, because the number is the promise and the row is where it was measured.
 *
 * The row also notes what is NOT yet measured: the count is confirmed on 2.1.258, and the engine's
 * floor is 2.1.214, whose row is still pending. Two is therefore budgeted rather than promised away
 * — `nextBlock` prints one sentence per dialog and adds the second the moment this becomes 2.
 */
export const EXPECTED_DIALOGS = 1;

/**
 * Are we talking to a shell that spells paths the Windows way?
 *
 * Not `process.platform === 'win32'` alone: Git Bash on Windows runs `./bootstrap.sh` perfectly
 * well, and telling that user to type `.\bootstrap.cmd` would be telling them to type something
 * that does not work. `SHELL` and `MSYSTEM` are how a bash on Windows announces itself.
 */
export const isWindowsShell = ({ platform = process.platform, env = process.env } = {}) =>
  platform === 'win32' && !env.SHELL && !env.MSYSTEM;

/** The command spellings, by shell. */
export function spellings(where = {}) {
  return isWindowsShell(where)
    ? { bootstrap: '.\\bootstrap.cmd', cli: 'snowarch.cmd' }
    : { bootstrap: './bootstrap.sh', cli: './snowarch' };
}

/**
 * THE Mode line. One definition, four consumers.
 *
 * `instance` carries only a label, an environment and a preset — the three things that are not
 * secrets. A URL or a username here would end up in a banner, a status reply and a log at once.
 */
export function modeLine({ mode, instance = null } = {}) {
  if (mode !== 'live') return 'Mode: design-only';
  if (!instance) return 'Mode: live';
  return `Mode: live — instance=${instance.label} (${instance.environment}) `
    + `preset=${instance.preset}`;
}

/**
 * THE registration line. One definition, three consumers: `snowarch mode`, the doctor's report
 * (ARC-08) and the troubleshooting page's wording.
 *
 * The parenthesis is the whole message. "local" and "user" both mean `~/.claude.json`, and the
 * difference between them — this checkout, or every project on the machine — is the thing a user
 * has to understand before they choose one; the kind's name alone does not carry it.
 */
export const REGISTRATION_KINDS = Object.freeze({
  project: 'project (.mcp.json)',
  local: 'local (~/.claude.json, this checkout only)',
  user: 'user (~/.claude.json, every project — not recommended)',
});

export function registrationLine(kind) {
  return `registration: ${REGISTRATION_KINDS[kind] ?? `${kind} (unknown kind)`}`;
}

/**
 * What to do after a registration or a mode switch — the one thing a user must not have to guess.
 *
 * A running Claude session has already read its MCP configuration; nothing this command does
 * reaches it. Saying so here is the difference between "it did not work" and "it works after a
 * reconnect", which is a support conversation either way if the sentence is missing.
 */
export const restartSentence = (serverKey) =>
  `Restart claude (or /mcp → ${serverKey} → reconnect) to load the server.`;

/**
 * `mode design` keeps the store. This says so, names the label, and gives the two commands that
 * undo it in either direction — because "design-only" reads like "the instance is gone" to
 * everyone who has not read the code.
 */
export function instanceKeptNote({ label, platform, env } = {}) {
  const s = spellings({ platform, env });
  if (!label) return `note: no instance is configured; ${s.cli} mode live adds one`;
  return `note: instance "${label}" kept in .local/instances.json; ${s.cli} mode live re-enables `
    + `it; ${s.cli} instance remove ${label} deletes it`;
}

/** `DOCTOR: 41 ok, 0 warn, 0 fail`, or the honest absence when Node cannot run one. */
export function doctorLine({ ok = 0, warn = 0, fail = 0, nodeUsable = true } = {}) {
  return nodeUsable
    ? `DOCTOR: ${ok} ok, ${warn} warn, ${fail} fail`
    : 'DOCTOR: unavailable until Node 20+ is installed (design-only is complete)';
}

/**
 * The `Next:` block — what to type, and what will happen when they do.
 *
 * One sentence per dialog, always. The alternative — one sentence saying "you may see one or two" —
 * is the sort of hedge that makes a user distrust every other line in the summary.
 */
export function nextBlock({ mode, dialogs = EXPECTED_DIALOGS, serverKey, platform, env } = {}) {
  const s = spellings({ platform, env });
  const lines = ['Next: run `claude` here. You will see one workspace-trust dialog — answer Yes.'];
  if (dialogs >= 2) {
    lines.push(`      …and one approval for the "${serverKey}" MCP server — answer Yes.`);
  }
  lines.push('      (If you are already inside Claude Code in this folder: exit it and start '
    + '`claude` again.)');
  lines.push(mode === 'live'
    ? `      In Claude, /mcp should show: ${serverKey} ✔ connected · /snowarch status quotes the `
      + 'Mode line above.'
    : `      Add a live instance later with ${s.cli} mode live, or /snowarch setup-instance `
      + 'inside Claude.');
  return lines.join('\n');
}

/** The whole closing block, as one string — what `--json`'s `next` field carries verbatim. */
export function summaryBlock({ mode, instance = null, counts = {}, nodeUsable = true,
  dialogs = EXPECTED_DIALOGS, serverKey, platform, env, warnings = [] } = {}) {
  const lines = [
    doctorLine({ ...counts, nodeUsable }),
    modeLine({ mode, instance }),
    nextBlock({ mode, dialogs, serverKey, platform, env }),
  ];
  if (warnings.length > 0) {
    lines.push(`Warnings: ${warnings.length}`, ...warnings.map((w) => `      ${w}`));
  }
  return lines.join('\n');
}

/** Everything the Node-free launchers need, as data. `text.json` is generated from this. */
export function exportable({ serverKey }) {
  const forShell = (where) => ({
    spellings: spellings(where),
    nextDesign: nextBlock({ mode: 'design-only', serverKey, ...where }),
    nextLive: nextBlock({ mode: 'live', serverKey, ...where }),
  });
  return {
    expectedDialogs: EXPECTED_DIALOGS,
    modeDesign: modeLine({ mode: 'design-only' }),
    doctorUnavailable: doctorLine({ nodeUsable: false }),
    posix: forShell({ platform: 'linux', env: {} }),
    windows: forShell({ platform: 'win32', env: {} }),
  };
}
