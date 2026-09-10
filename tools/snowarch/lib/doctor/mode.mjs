// ARC-08-S05 — the authoritative `Mode:` line: derived, never remembered.
//
// The rule file's promise is that this line is the mode — "never infer mode from any other file"
// — and a promise like that is only as good as the number of places that can produce it. So the
// derivation is a PURE FUNCTION of four facts, the sentences live in `text.mjs` with every other
// Mode line the product prints, and this module renders through `modeLine()` rather than holding
// a second sentence table.
//
// What it never reads is `~/.claude.json`. That file is where the OLD engine looked for the mode
// (`00` P-05/P-21), and it is wrong three ways: it belongs to Claude Code, it describes the
// registration rather than the configuration, and a stale entry there outlived the install it
// described. The toggle file and the store are the two things that decide, and both are ours.
import { flagNames } from '../../../../packages/contract/lib/contract.mjs';
import { modeLine as renderModeLine, MODE_VARIANTS } from '../text.mjs';

/** `2026-09-10 41 ok` / `2026-09-10 2 FAIL` — what the banner shows about the last run. */
export function doctorStamp({ summary = {}, at = new Date() } = {}) {
  const day = (at instanceof Date ? at : new Date(at)).toISOString().slice(0, 10);
  return summary.fail > 0
    ? `doctor ${day} ${summary.fail} FAIL`
    : `doctor ${day} ${summary.ok ?? 0} ok`;
}

/**
 * Which mode this checkout is in, and why — the whole decision, in one place.
 *
 * `live` is the conjunction of two facts and nothing else: the server is not disabled in the
 * toggle file, and the store has an instance that LOADED. Everything else is design-only with a
 * qualifier that names which half is missing, because "design-only" alone sends a user looking for
 * a problem that may be a deliberate choice.
 *
 * @param {object} facts
 * @param {{enabled?: boolean}} facts.toggles     `.claude/settings.local.json`, already read
 * @param {Array} facts.instances                 `server.instances[]` from the SV checks
 * @param {boolean} facts.bootstrapped            a `bootstrap-state.json` exists
 */
export function deriveMode({ toggles = {}, instances = [], bootstrapped = true } = {}) {
  const loaded = instances.filter((i) => i.status === 'loaded');
  const configured = instances.length > 0;
  const serverEnabled = toggles.enabled !== false;

  if (!bootstrapped) {
    return { mode: 'unknown', variant: 'notBootstrapped',
      qualifier: MODE_VARIANTS.notBootstrapped, instance: null, loaded, serverEnabled };
  }
  if (serverEnabled && loaded.length > 0) {
    const first = loaded[0];
    return { mode: 'live', variant: 'live', qualifier: null, loaded, serverEnabled,
      instance: { label: first.label, environment: first.environment, preset: first.preset } };
  }
  if (!serverEnabled && configured) {
    return { mode: 'design-only', variant: 'serverDisabled', loaded, serverEnabled,
      qualifier: MODE_VARIANTS.serverDisabled(instances[0].label), instance: null };
  }
  if (serverEnabled && configured) {
    // Entries exist and none of them loaded — the store is there and something in it is wrong,
    // which SV-02/SV-03 have already said in detail. The Mode line points at them rather than
    // repeating them.
    return { mode: 'design-only', variant: 'noInstanceLoaded', loaded, serverEnabled,
      qualifier: MODE_VARIANTS.noInstanceLoaded, instance: null };
  }
  if (serverEnabled) {
    return { mode: 'design-only', variant: 'noInstanceLoaded', loaded, serverEnabled,
      qualifier: MODE_VARIANTS.noInstanceLoaded, instance: null };
  }
  return { mode: 'design-only', variant: 'unconfigured', loaded, serverEnabled,
    qualifier: MODE_VARIANTS.unconfigured, instance: null };
}

/**
 * The banner form: the mode, the instance, and — in live mode — when the doctor last looked.
 *
 * The stamp rides on the LIVE line only. A design-only line already ends in an instruction
 * ("run ./snowarch instance add …"), and a date bolted onto the end of a sentence that tells
 * somebody what to type reads as part of the command. The story's criteria say the same thing
 * from the other side: criterion 1 quotes the live line WITH the stamp, criterion 2 quotes the
 * design-only line without it and calls it exact.
 */
export function modeLine(derived, { summary, at } = {}) {
  const stamped = derived.mode === 'live' && summary;
  return renderModeLine({
    mode: derived.mode,
    instance: derived.instance,
    qualifier: derived.qualifier,
    ...(stamped ? { stamp: doctorStamp({ summary, at }) } : {}),
  });
}

/** `WRITE=on CMDB_WRITE=off …` — the labels from the contract, never a list typed here. */
export function flagSummary(contract, flags = {}) {
  if (!contract) return null;
  return flagNames(contract)
    .map((name) => `${name.replace(/_ENABLED$/, '')}=${flags[name] === 'true' ? 'on' : 'off'}`)
    .join(' ');
}

/**
 * The skill form: everything `/snowarch status` prints on one line.
 *
 * The tool count says where it came from. `398 tools` is what the RUNNING server advertised;
 * `398 tools (contract)` is what the pinned contract declares, printed when SV-05 did not run —
 * on `--quick`, or with no dependencies. A count with no provenance is the kind of number a reader
 * trusts and should not.
 */
export function modeLineDetailed(derived, { contract = null, instances = [], toolCount = null,
  flags = null } = {}) {
  if (derived.mode !== 'live' || !derived.instance) return modeLine(derived);
  const parts = [`Mode: live — ${derived.instance.label} (${derived.instance.environment})`,
    `preset ${derived.instance.preset}`];
  const summary = flagSummary(contract, flags ?? {});
  if (summary) parts.push(summary);
  if (toolCount?.count != null) {
    parts.push(`${toolCount.count} tools${toolCount.source === 'contract' ? ' (contract)' : ''}`);
  }
  const others = instances.filter((i) => i.label !== derived.instance.label);
  const alsoLoaded = others.filter((i) => i.status === 'loaded');
  if (alsoLoaded.length > 0) {
    parts.push(`+${alsoLoaded.length} instance (${alsoLoaded.map((i) => i.label).join(', ')})`);
  }
  for (const other of others.filter((i) => i.status !== 'loaded')) {
    parts.push(`${other.label}: not loaded${other.reason ? ` (${other.reason})` : ''}`);
  }
  return parts.join(' · ');
}
