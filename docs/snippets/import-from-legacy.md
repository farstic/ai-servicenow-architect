<!-- ONE SOURCE. This fragment is the legacy-migration step, and three places show it: ARC-08-S03's
     E-24 detector prints the command when it finds `~/.config/servicenow-mcp`, `docs/MIGRATION.md`
     quotes the plan block below as its step 3 (ARC-10-S01 — `tests/migration-doc.test.mjs` asserts
     the page carries it byte for byte, so a change here fails there rather than leaving the page
     describing an older screen), and `packages/snowarch/tests/cli/
     import-legacy.test.ts` asserts the plan block below is BYTE-IDENTICAL to what the command
     prints against `packages/snowarch/tests/fixtures/legacy-instances.json`. If the renderer
     changes, that test fails here rather than in a document nobody re-reads.

     (ARC-08-S03's story text cites "ARC-07-S07" for this command; it is ARC-07-S08. Corrected in
     that story by this one's amendment.) -->

# Migrating a snow-mcp 1.x store

The old store is at `~/.config/servicenow-mcp/instances.json` — the same path on every operating
system, including Windows, where it is `%USERPROFILE%\.config\servicenow-mcp\instances.json`.
Nothing reads it any more, so nothing is lost by leaving it there and nothing is gained either: it
holds plaintext credentials.

**See what would happen, first.** The plan is always printed; `--dry-run` stops there and writes
nothing:

```
$ ./snowarch instance import --from-legacy --dry-run
Legacy store: ~/.config/servicenow-mcp/instances.json (2 instances)
Target store: <checkout>/.local/instances.json (project)
  pdi   https://dev12345.service-now.com  pdi   basic       → preset pdi-developer
        notes: "/api" removed from URL; FLUENT set to off; dropped: addedAt, group
  prod  https://acme.service-now.com      prod  oauth_ropc  → preset read-only
        notes: per-user/impersonation mode is not carried (removed in 2.0.0); FLUENT set to off;
        production capped at read-only (D-05) — raise with: ./snowarch instance set-preset prod
        <preset> --ack-prod; tool package "minimal" not carried — 2.0.0 uses full (P-25); dropped:
        addedAt, aiBaseUrl, aiModel, aiProvider, apexEnabled, group, integrationMode, mcpEnabled,
        sdkEnabled; dropped: aiApiKey (a secret — not carried; delete the legacy file)
Each imported instance is probed before it is saved; an entry whose credentials fail is not saved.
```

Then run it without `--dry-run`. Each entry is probed once before it is saved — an entry whose
credentials no longer work is skipped with the command that adds it by hand — and every entry that
is not production goes through the review screen, because the legacy files written by the old
desktop app default `writeEnabled` to `true` and those flags are a proposal rather than a decision.
Production is capped at read-only whatever the legacy file said (D-05).

**Then delete the old files yourself.** The import never removes anything:

```
rm -r ~/.config/servicenow-mcp        # instances.json AND tokens.json — both plaintext
```

On Windows:

```
Remove-Item -Recurse $HOME\.config\servicenow-mcp
```

Finally, `./snowarch doctor` lists the exact `claude mcp remove` commands for any stale Claude Code
registration that still points at the old server.
