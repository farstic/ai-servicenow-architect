// ARC-08-S02 — the engine's twenty-three checks, in the order a report prints them.
//
// One list, assembled from five files. The registry sorts by section anyway, so the order here is
// the order WITHIN a section: prerequisites before the repository they are needed for, the corpus
// before the citations that read it, the roster before the contract the roster's text must agree
// with. A reader who works down the report is following the dependency chain.
//
// S03 adds the `legacy` and `host` detectors (E-23…E-27) and S04 the `SV-` checks; both append to
// this list rather than building a registry of their own, because `--section` and `--quick` are
// answers about ONE registry.
import { createRegistry } from '../registry.mjs';

import { engineContractChecks } from './engine-contract.mjs';
import { engineDocsChecks } from './engine-docs.mjs';
import { enginePrereqChecks } from './engine-prereqs.mjs';
import { engineRepoChecks } from './engine-repo.mjs';
import { engineRosterChecks } from './engine-roster.mjs';

/** Every engine check, as plain definitions — a caller may register a subset. */
export function engineChecks() {
  return [
    ...enginePrereqChecks(),
    ...engineRepoChecks(),
    ...engineDocsChecks(),
    ...engineRosterChecks(),
    ...engineContractChecks(),
  ];
}

/** The registry the `doctor` command builds when it is not given one. */
export function engineRegistry() {
  return createRegistry(engineChecks());
}
