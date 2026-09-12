# Migrating from claude-servicenow-live and snow-mcp

You are on this page because you installed the two-repository setup: the Architect engine in one
clone, the MCP server in another, registered by hand with Claude Code and carrying its credentials
in `~/.claude.json`. This page takes you to a working `2.0.0` checkout in one sitting, without
losing engagement content and without leaving a password behind.

Read it once before you start. Nothing in your old setup is modified until step 6, so you can stop
after any earlier step and still have exactly what you had this morning.

## Who this is for

- You cloned `farstic/claude-servicenow-live`, or
- you cloned `farstic/snow-mcp`, or installed its npm package and registered it by hand, or
- both — which is the ordinary case, because the engine needed the server to reach an instance.

If you have never installed either, you want [INSTALL.md](INSTALL.md) instead. Nothing here applies
to a fresh machine.

## What changes

| Old | New |
|---|---|
| Two clones, kept in step by hand | One repository — `farstic/ai-servicenow-architect` |
| `claude mcp add servicenow-mcp …` with 12 `-e SERVICENOW_*` environment keys | A committed `.mcp.json`, server key `servicenow`. You never register anything |
| Credentials in `~/.claude.json` and `~/.config/servicenow-mcp/instances.json` | `<checkout>/.local/instances.json`, mode `0600`, never committed, never in argv |
| Tier 0 / Tier 1 / Tier 2 | Mode `design-only` or `live`, and a preset — `read-only`, `pdi-developer`, `full` or `custom` |
| `bash scripts/setup.sh`, `bash scripts/doctor.sh` | `./bootstrap.sh` (`bootstrap.cmd` on Windows), `./snowarch doctor` |
| `/status` | `/snowarch status` |
| `/setup-instance` | `/snowarch setup-instance` |
| A `.env` in the working directory, loaded automatically | Not read. Point `SNOW_ENV_FILE` at one if you want it |
| Field notes in one file | `docs/PLATFORM-NOTES.md` for platform facts; the server's own changelog and tests for server behaviour |
| `memory/MEMORY.md` | Claude Code's own memory |
| Engine v2.8.0 · server 1.0.0 | One product, version `2.0.0` |

Everything below the table is the current vocabulary. The row on the left is the only place the old
words appear on this page, because they are what you are migrating *from*.

## Before you start

- **Half an hour**, uninterrupted. Steps 6 to 8 delete things, and the review in each is the point.
- **Your old checkout(s) still on disk.** Do not delete anything until step 4 has been verified.
- **The password for each instance**, because you will type it again — credentials are never copied
  from the old setup into the new one by any command here. If you do not have it, do step 9 first.

---

## 1. Preserve engagement content first

Take a fingerprint of `clients/` before anything else, so that step 4 can prove nothing was lost.

macOS / Linux:

```sh
cd <old-engine-checkout>
find clients -type f -print0 | sort -z | xargs -0 shasum -a 256 > ~/clients-before.sha256
wc -l ~/clients-before.sha256
```

Windows PowerShell:

```powershell
cd <old-engine-checkout>
Get-ChildItem clients -Recurse -File | Get-FileHash -Algorithm SHA256 |
  Sort-Object Path | Export-Csv $HOME\clients-before.csv -NoTypeInformation
(Import-Csv $HOME\clients-before.csv).Count
```

Then list the three things that are untracked and will not travel by themselves — they exist only
if you made them:

```sh
ls -la memory/ scratchpad/ deliverables/ 2>/dev/null
```

```powershell
Get-ChildItem memory, scratchpad, deliverables -ErrorAction SilentlyContinue
```

## 2. Clone and bootstrap the new repository

macOS / Linux:

```sh
git clone https://github.com/farstic/ai-servicenow-architect.git && cd ai-servicenow-architect && ./bootstrap.sh
```

Windows PowerShell:

```powershell
git clone https://github.com/farstic/ai-servicenow-architect.git
cd ai-servicenow-architect
.\bootstrap.cmd
```

The bootstrap prints a plan and waits. At step B03 it asks which mode you want: choose `live` if you
had a working instance, and B06 runs the instance wizard before the summary at B09. Choosing
`design-only` now is also fine — `./snowarch mode live` switches later, and the wizard runs then.

**Do not register anything.** The server registration is the committed `.mcp.json`; there is no
command for you to run and no environment key for you to set.

## 3. Bring your instance across

If you used the old wizard, its store is still on disk at
`~/.config/servicenow-mcp/instances.json` — on Windows that is
`%USERPROFILE%\.config\servicenow-mcp\instances.json`, *not* `%APPDATA%`: the old store used the
home directory's `.config` on every operating system. Import it:

```sh
./snowarch instance import --from-legacy
```

```powershell
.\snowarch.cmd instance import --from-legacy
```

The plan is printed first, and `--dry-run` stops there and writes nothing:

<!-- snippet:import-plan — byte-identical to docs/snippets/import-from-legacy.md; asserted by tests/migration-doc.test.mjs -->
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
<!-- /snippet:import-plan -->

Every entry that is not production then goes through a review screen, one line per flag, with what
each probe found:

<!-- snippet:review-screen-nonprod — byte-identical to docs/snippets/review-screen-nonprod.txt; asserted by tests/migration-doc.test.mjs -->
```
Proposed preset for "pdi" (pdi): full  — non-production: everything on
  [x] WRITE        probe: ok
  [x] CMDB_WRITE   probe: ok
  [x] SCRIPTING    probe: ok
  [x] ATF          probe: ok
  [x] NOW_ASSIST   probe: no Now Assist licence detected — tools will fail until licensed; keep on?
                   (recommend: off)
  [x] FLUENT       probe: @servicenow/sdk not on PATH — keep on? (recommend: off)
Enter = accept as shown · type a flag name to toggle · "preset <name>" to switch preset · "?"
explains the flags
```
<!-- /snippet:review-screen-nonprod -->

**Enter accepts the proposal as shown; any line is yours to edit first.** The screen proposes, it
does not decide — a failed probe changes the recommendation on that line and never the toggle. The
environment is asked, never guessed, and production is capped at `read-only` whatever the old file
said.

If you never used the old wizard, or would rather start clean:

```sh
./snowarch instance add
```

```powershell
.\snowarch.cmd instance add
```

From inside Claude, `/snowarch setup-instance` collects every non-secret choice and then prints the
exact command for you to run in your own terminal. **Credentials are typed in your terminal, never
pasted into a conversation** — the skill cannot type them and is not permitted to try.

## 4. Copy engagement folders

macOS / Linux:

```sh
cp -R <old-engine-checkout>/clients/ ./clients/
find clients -type f -print0 | sort -z | xargs -0 shasum -a 256 > ~/clients-after.sha256
diff <(cut -d' ' -f1 ~/clients-before.sha256 | sort) <(cut -d' ' -f1 ~/clients-after.sha256 | sort) && echo "identical"
```

Windows PowerShell:

```powershell
Copy-Item -Recurse <old-engine-checkout>\clients\* .\clients\
Get-ChildItem clients -Recurse -File | Get-FileHash -Algorithm SHA256 |
  Sort-Object Path | Export-Csv $HOME\clients-after.csv -NoTypeInformation
Compare-Object (Import-Csv $HOME\clients-before.csv).Hash (Import-Csv $HOME\clients-after.csv).Hash
```

`diff` printing `identical`, or `Compare-Object` printing nothing, means every file arrived. The
comparison is on the hashes alone because the paths change — the old checkout's root is not the new
one's.

`clients/` is ignored by git in the new repository, exactly as before: engagement content is yours
and is never committed.

## 5. Run the doctor

```sh
./snowarch doctor
```

```powershell
.\snowarch.cmd doctor
```

Expect **0 FAIL**. In the `legacy` section expect two WARN lines, which are the subject of the next
three steps. `E-23` finds what the old install left in Claude Code's own configuration:

```
WARN E-23 stale MCP registrations in ~/.claude.json
     stale MCP registration "servicenow-mcp" in ~/.claude.json for this folder (holds 3 env keys,
     1 credential-shaped — set (len 14)) · and 1 more under this folder · also registered under:
     /old/path (servicenow-mcp) — run the same command from that folder · 1 ~/.claude.json.bak-*
     file(s) present
     → claude mcp remove servicenow-mcp -s local        (run from this folder)
     → claude mcp remove nowaikit -s local        (run from this folder)
     → then review and delete ~/.claude.json.bak-* files — they retain the same secrets (ls -la ~/.claude.json.bak-* )
```

and `E-24` finds the old wizard's store:

```
WARN E-24 legacy wizard store
     legacy wizard store ~/.config/servicenow-mcp/instances.json present (2 instance(s); never read
     by this product)
     → ./snowarch instance import --from-legacy      (migrates entries, then advises deleting the directory)
```

The doctor **changes nothing** in either place — not now, not under `--fix`. Those files belong to
Claude Code and to a product that is not this one; the doctor's job is to print the exact command
and yours is to run it. Copy the commands; they are steps 6 to 8.

Your own numbers will differ: the names, the count of environment keys and the length are read from
your file. `set (len 14)` is the LENGTH of a credential the doctor found, never the credential.

## 6. Remove the stale registrations

Local-scope registrations are keyed on the **absolute folder path**, so each one is removed by
running the command from the folder it was made in. That is what "(run from this folder)" and "run
the same command from that folder" in the doctor's output mean. Wrap each command in the `cd` it
asks for:

```sh
cd <old-engine-checkout> && claude mcp remove servicenow-mcp -s local
cd <other-old-folder>   && claude mcp remove nowaikit -s local
```

```powershell
cd <old-engine-checkout>; claude mcp remove servicenow-mcp -s local
cd <other-old-folder>;    claude mcp remove nowaikit -s local
```

**If the folder no longer exists**, re-create it for the length of one command rather than editing
`~/.claude.json` by hand:

```sh
mkdir -p <path> && cd <path> && claude mcp remove servicenow-mcp -s local && cd - && rmdir <path>
```

```powershell
New-Item -ItemType Directory -Force <path> | Out-Null
Push-Location <path>; claude mcp remove servicenow-mcp -s local; Pop-Location
Remove-Item <path>
```

Then confirm nothing is left. This lists every project that still carries a server registration:

```sh
jq '.projects | to_entries[] | select((.value.mcpServers // {}) | length > 0) | .key' ~/.claude.json
```

```powershell
(Get-Content $HOME\.claude.json | ConvertFrom-Json).projects.PSObject.Properties |
  Where-Object { $_.Value.mcpServers.PSObject.Properties.Count -gt 0 } | Select-Object -Expand Name
```

**Your new checkout must not appear in that list.** Its server lives in the committed `.mcp.json`,
which is not part of this file at all. The shorter form `select(.value.mcpServers != null)` also
works, with one difference worth knowing: it also lists projects whose registration block is present
but empty, which is what a removal leaves behind.

## 7. Delete the backups that still hold the secrets

Claude Code writes a backup beside its configuration whenever it rewrites it, and **every backup
retains the credentials the original had**. Removing the registration does not touch them. Review
the list, then delete:

```sh
ls -la ~/.claude.json.bak-*
rm ~/.claude.json.bak-*
```

```powershell
Get-ChildItem $HOME\.claude.json.bak-*
Remove-Item $HOME\.claude.json.bak-*
```

## 8. Delete the legacy store

Once the import in step 3 is done — or once you have decided you do not want those entries — delete
the old store. It holds `instances.json` and `tokens.json`, both in plain text. This is the same
command the import prints as its closing advice, and the import itself never deletes anything:

```sh
rm -r ~/.config/servicenow-mcp        # instances.json AND tokens.json — both plaintext
```

```powershell
Remove-Item -Recurse $HOME\.config\servicenow-mcp
```

On Windows the folder is `%USERPROFILE%\.config\servicenow-mcp\instances.json` — `$HOME` is
PowerShell's name for the same directory. After this, `E-24` reports ok.

## 9. Rotate what was exposed

Any password that sat in `~/.claude.json`, in one of its backups, or in your shell history should be
treated as known. Rotate it on the instance, then set the new one:

```sh
./snowarch instance set-credentials <label>
```

```powershell
.\snowarch.cmd instance set-credentials <label>
```

This is a recommendation, not a step the tool enforces. It is on the list because the old layout put
one credential in as many as six places, and steps 6 to 8 delete the copies — they cannot un-read
them.

---

## Verify

```sh
./snowarch doctor
```

```powershell
.\snowarch.cmd doctor
```

- **0 FAIL**, and `E-23` and `E-24` both ok: no stale registration, no legacy store.
- Start `claude` in the checkout. You get the workspace-trust dialog once, then a banner:
  `Mode: live — instance=<label> (<env>) preset=<preset>` — or `Mode: design-only` if that is what
  you chose.
- `/mcp` lists `servicenow` as connected.

From here, upgrades are one command: `./snowarch upgrade` — see
[INSTALL.md](INSTALL.md#upgrading).

## Optional cleanup

Yours to decide; nothing here is required and nothing else depends on it.

**The context-mode hook tooling.** The old setup's routing rules were personal tooling that this
product does not use or ship. If you want it gone:

```sh
claude mcp remove context-mode -s user
```

```powershell
claude mcp remove context-mode -s user
```

Then delete the `hooks` block from `~/.claude/settings.json` and the context-mode section from
`~/.claude/CLAUDE.md`. Both are yours to edit; nothing in this product reads either.

**The old checkouts.** Confirm nothing is uncommitted, then keep or delete them as you like — both
old repositories stay readable after archiving:

```sh
git -C <old-checkout> status --short
```

```powershell
git -C <old-checkout> status --short
```

**`core.hooksPath`** needs no action. It was set inside the old checkout and travels with it.

## Environment notes

**Behind a corporate proxy or a TLS-intercepting gateway.** `HTTPS_PROXY` and `NO_PROXY` are
honoured; for a private certificate authority, point Node at the root:

```sh
export HTTPS_PROXY=http://proxy.example.internal:8080
export NO_PROXY=localhost,127.0.0.1
export NODE_EXTRA_CA_CERTS=/path/to/corp-root.pem
```

```powershell
$env:HTTPS_PROXY = 'http://proxy.example.internal:8080'
$env:NO_PROXY = 'localhost,127.0.0.1'
$env:NODE_EXTRA_CA_CERTS = 'C:\path\to\corp-root.pem'
```

When a fetch fails, the error is classified and the remedy named:
[DNS_FAILURE](TROUBLESHOOTING.md#dns_failure),
[TLS_CA_UNTRUSTED](TROUBLESHOOTING.md#tls_ca_untrusted),
[PROXY_UNREACHABLE](TROUBLESHOOTING.md#proxy_unreachable).

**A checkout inside a cloud-sync folder.** The wizard and the doctor both warn before anything is
written, and the warning is worth reading rather than accepting: this checkout is under OneDrive,
Dropbox, iCloud Drive or Google Drive, and `.local/instances.json` at mode `0600` **will still be
synchronised** — `0600` is a local permission and the sync client runs as you. Move the checkout
outside the synced folder, or keep credentials in the global store with `--global`, or accept it
knowingly.

## Rollback

**Nothing in your old setup is modified until step 6.** Up to that point, rolling back is deleting
the new checkout and carrying on.

After step 6, to go back you re-register the old server with the command in the old repository's
own setup page. Be clear-eyed about what that does: it writes the credential into `~/.claude.json`
again, in plain text, which is the thing steps 6 to 8 were removing.

To remove the new checkout instead, follow [INSTALL.md](INSTALL.md#uninstall) — the checkout holds
the only copy of everything you configured, credentials included.
