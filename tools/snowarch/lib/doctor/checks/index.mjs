// ARC-08-S02 — the engine's twenty-three checks, in the order a report prints them.
//
// One list, assembled from five files. The registry sorts by section anyway, so the order here is
// the order WITHIN a section: prerequisites before the repository they are needed for, the corpus
// before the citations that read it, the roster before the contract the roster's text must agree
// with. A reader who works down the report is following the dependency chain.
//
// S03 added the `legacy` and `host` detectors (E-23…E-27); S04 adds the `SV-` checks. Both append
// to this list rather than building a registry of their own, because `--section` and `--quick` are
// answers about ONE registry.
import { createRegistry } from '../registry.mjs';

import { engineContractChecks } from './engine-contract.mjs';
import { engineDocsChecks } from './engine-docs.mjs';
import { enginePrereqChecks } from './engine-prereqs.mjs';
import { engineRepoChecks } from './engine-repo.mjs';
import { engineRosterChecks } from './engine-roster.mjs';
import { hostChecks } from './host.mjs';
import { legacyChecks } from './legacy.mjs';

/** Every engine check, as plain definitions — a caller may register a subset. */
export function engineChecks() {
  return [
    ...enginePrereqChecks(),
    ...engineRepoChecks(),
    ...engineDocsChecks(),
    ...engineRosterChecks(),
    ...engineContractChecks(),
    ...legacyChecks(),
    ...hostChecks(),
  ];
}

/**
 * The `stale` block of schema v1, assembled from the two detectors that fill it.
 *
 * It was `null` from S01 so that a consumer written against the shape would never have to ask
 * which version of the doctor produced its input. This is the version that fills it. The ids are
 * known HERE rather than in the report builder, because "which check knows about leftovers" is a
 * fact about the registry and the report builder has no business learning it.
 */
export function staleBlock(results = []) {
  const by = new Map(results.map((r) => [r.id, r]));
  const claude = by.get('E-23')?.data ?? {};
  const legacy = by.get('E-24')?.data ?? {};
  const entries = Array.isArray(claude.entries) ? claude.entries : [];
  return {
    claudeJsonEntries: entries.map(({ scope, project, name, command }) => ({
      scope, project, name, command,
    })),
    legacyStore: legacy.present
      ? { path: legacy.path, instances: legacy.instances ?? null }
      : null,
  };
}

/** The registry the `doctor` command builds when it is not given one. */
export function engineRegistry() {
  return createRegistry(engineChecks());
}
