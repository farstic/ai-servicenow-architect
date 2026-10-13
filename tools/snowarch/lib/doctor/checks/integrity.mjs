// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C7 — E-32, the build's integrity: the files this release ships, against the manifest the owner signed for
// its tag.
//
// A FAILURE, NEVER A REFUSAL. A modified copy is reported, and it still runs: E-32 FAILs, `status` says so, and the
// banner prints the cached line. A release tree with no manifest, or with another release's, FAILs as well, because
// deleting or swapping the manifest is the cheapest tamper (the architect's ruling, 2026-10-13). A development tree
// has none to check, and skips.
//
// QUICK, AND OFFLINE. It reads the cached manifest and hashes the covered files, about 7 ms warm on an Apple M3, with
// one bounded `git` call for the tag's commit; the manifest is fetched by the bootstrap and by `licence check
// --refresh`, never here. It is the one quick check that reads every covered file, so the SessionStart hook leaves it
// out of its run by name (`banner()` in `hooks/session-start.mjs`): `status` and `doctor --quick` compute it, and
// the banner shows the verdict they cached.
import { integrityLine, integrityRemedy, integrityStatus } from '../../licence/manifest.mjs';
import { PRODUCT_KEYS } from '../../licence/keys.mjs';
import { defineCheck } from '../registry.mjs';
import { cliOf } from '../spell.mjs';
import { fail, ok, skip } from './result.mjs';

/** The checks this file registers. */
export function integrityChecks() {
  return [
    defineCheck({
      id: 'E-32',
      section: 'repo',
      title: "this release's files against its signed manifest",
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        // `licenceKeys` is the test seam E-31 has: a suite injects the keys it generated. Nothing in the product sets it.
        const s = integrityStatus(ctx.root, { keys: ctx.licenceKeys ?? PRODUCT_KEYS });
        const line = integrityLine(s);
        const data = { state: s.state, tag: s.tag ?? null, checked: s.checked ?? null,
          modified: s.modified ?? [], manifestTag: s.manifestTag ?? null };
        if (s.state === 'dev') return skip(line, data);
        if (s.state === 'verified') return ok(line, data);
        const cli = cliOf(ctx);
        return fail(line, {
          data,
          remedy: integrityRemedy(s, cli),
          ...(s.state === 'modified' ? {} : { command: `${cli} licence check --refresh` }),
        });
      },
    }),
  ];
}
