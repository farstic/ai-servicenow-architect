// ARC-06-S09 — the sentences the installation ends with, in one place.
//
// Two of them are promises. The `Mode:` line is quoted verbatim by the SessionStart banner, by
// `/snowarch status` and by `snowarch mode`, so four programs must agree on its shape or a user
// sees three different answers to "what am I in". And the dialog count is a promise made before
// first contact: say one and show two, and the tool has lied in the first thirty seconds.
//
// So both live here, `text.json` is generated from this file, and the Node-free launchers read that
// rather than repeating the strings.

import { renderSummaryLine } from './doctor/report-text.mjs';

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
 * The four things a design-only or unknown checkout can BE, as sentences.
 *
 * They live here, with the Mode line itself, because they are the same sentence in four moods:
 * a variant table inside the doctor would be a second place where "what mode is this?" is
 * answered in words, and the rule file's promise — that the Mode line is authoritative — is only
 * true while there is one of it. ARC-08-S05's derivation picks a key; this renders it.
 */
export const MODE_VARIANTS = Object.freeze({
  unconfigured: 'no ServiceNow instance configured; run ./snowarch instance add or '
    + '/snowarch setup-instance to add one',
  serverDisabled: (label) => `server disabled in .claude/settings.local.json although instance `
    + `"${label}" is configured; run ./snowarch mode live`,
  noInstanceLoaded: 'server enabled but no instance is loaded (see SV-02/SV-03); run '
    + '/snowarch setup-instance',
  notBootstrapped: 'this checkout has not been bootstrapped; run ./bootstrap.sh '
    + '(Windows: bootstrap.cmd)',
});

/**
 * THE Mode line. One definition, five consumers.
 *
 * `instance` carries only a label, an environment and a preset — the three things that are not
 * secrets. A URL or a username here would end up in a banner, a status reply and a log at once.
 *
 * `qualifier` and `stamp` are ARC-08-S05's: the doctor knows WHY a checkout is design-only and
 * when it last checked, and the bootstrap does not. Both are optional, so the launcher's
 * `Mode: design-only` — which a Node-free shell prints from `text.json` — is unchanged.
 */
export function modeLine({ mode, instance = null, qualifier = null, stamp = null } = {}) {
  const tail = stamp ? ` — ${stamp}` : '';
  if (mode === 'unknown') return `Mode: unknown${qualifier ? ` — ${qualifier}` : ''}${tail}`;
  if (mode !== 'live') return `Mode: design-only${qualifier ? ` — ${qualifier}` : ''}${tail}`;
  if (!instance) return `Mode: live${qualifier ? ` — ${qualifier}` : ''}${tail}`;
  return `Mode: live — instance=${instance.label} (${instance.environment}) `
    + `preset=${instance.preset}${tail}`;
}

/**
 * The banner's four nudges — one definition each, for the hook and for `/snowarch status`.
 *
 * They are the only lines the SessionStart hook prints besides the Mode line, and two programs
 * print them: the hook at the top of a session, and the status skill when somebody asks. A second
 * wording in the second place is how a user comes to believe the two describe different things.
 *
 * Each is ONE line. The banner has a budget measured in milliseconds and a reader who has not
 * asked for any of this yet; a nudge that wraps is a nudge that gets skipped.
 */
export const BANNER = Object.freeze({
  firstRun: 'No ServiceNow instance configured — /snowarch setup-instance adds one '
    + '(design-only works without it).',
  upgrade: (tag) => `A newer release is available (${tag}) — run ./snowarch upgrade.`,
  staleRegistration: 'Stale MCP registrations from the old setup found in ~/.claude.json — run '
    + './snowarch doctor --section legacy for the removal commands.',
  doctorFail: (n) => `Doctor: ${n} FAIL — run ./snowarch doctor for remedies.`,
  /** The cache could not be refreshed in time: the line is still true, just old. */
  staleSuffix: ' (cache stale — run ./snowarch doctor)',
  timedOut: 'Mode: unknown — doctor timed out; run ./snowarch doctor',
  /** Anything unforeseen. The CLASS, never the message: a message can carry a path or a value. */
  failed: (errorClass) => `Mode: unknown — session banner failed (${errorClass}); run `
    + './snowarch doctor',
});

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

/**
 * `DOCTOR: 41 ok, 0 warn, 0 fail`, or the honest absence when Node cannot run one.
 *
 * The line itself is the DOCTOR's renderer (ARC-08-S05): the bootstrap's summary and the doctor's
 * report describe the same run, and they drifted the moment the doctor learned to say
 * `(2 fixable — …)`. What stays here is the sentence for a machine with no Node — which the
 * doctor, by definition, cannot print.
 */
export function doctorLine({ ok = 0, warn = 0, fail = 0, skip = 0, fixable = 0,
  nodeUsable = true } = {}) {
  return nodeUsable
    ? renderSummaryLine({ ok, warn, fail, skip, fixable })
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
    // The banner's fixed strings, as data: the hook prints them and `/snowarch status` (S09) says
    // the same words. The two that take an argument are rendered with an example one, so the file
    // shows the shape rather than a placeholder nobody can compare against.
    banner: {
      firstRun: BANNER.firstRun,
      upgrade: BANNER.upgrade('v2.1.0'),
      staleRegistration: BANNER.staleRegistration,
      doctorFail: BANNER.doctorFail(2),
      staleSuffix: BANNER.staleSuffix,
      timedOut: BANNER.timedOut,
      failed: BANNER.failed('Error'),
    },
    doctorUnavailable: doctorLine({ nodeUsable: false }),
    posix: forShell({ platform: 'linux', env: {} }),
    windows: forShell({ platform: 'win32', env: {} }),
  };
}
