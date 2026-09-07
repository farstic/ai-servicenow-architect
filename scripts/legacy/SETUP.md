# Setup Guide

**Last updated:** 2026-09-04

This is the single authoritative setup guide for the ServiceNow Architecture Engine. `README.md` is a project overview and `docs/INSTALLATION-GUIDE.md` covers the first session and the worked verification scenario. Where either of them disagrees with this file — on prerequisites, on configuration location, on capability flags, or on troubleshooting — **this file wins**. Anything conditional or version-sensitive is enforced by `scripts/doctor.sh`, not by prose here.

---

## Two commands

```bash
git clone --recurse-submodules <repo-url> AI-Architect-Claude
cd AI-Architect-Claude

bash scripts/setup.sh     # bootstrap (safe to re-run)
bash scripts/doctor.sh    # verify (read-only; run any time)
```

`setup.sh` is idempotent — re-running it repairs whatever has drifted and never writes a credential into the repository. `doctor.sh` changes nothing on your machine or your instance, and prints a named remedy for every check it fails.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Git | Needed for the clone and for the `ServiceNowDocs/` submodule. |
| Node.js **20 or newer** | The MCP server declares `engines.node >= 20`, which is stricter than Claude Code's own floor. `doctor.sh` enforces 20, not 18. |
| npm | Bundled with Node.js. |
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code`. |
| A Claude Pro/Max subscription (`claude login`) **or** an `ANTHROPIC_API_KEY` | One or the other, not both. **Exporting `ANTHROPIC_API_KEY` overrides the subscription and routes all usage to metered API billing — Pro/Max subscribers should not set it.** |

Optional, and only for document and diagram export: Python 3 (`scripts/md-to-docx.py`), draw.io Desktop (`scripts/render-drawio.sh`), LibreOffice (`scripts/render-pdf.sh`). None of these are needed to run the engine.

**Windows:** run the repository tooling under Git Bash or WSL. The document toolchain ships `.ps1` twins (`md-to-docx.ps1`, `render-pdf-pages.ps1`, `render-diagrams.ps1`); the governance and setup scripts — `doctor.sh`, `setup.sh`, `verify-structure.sh`, `verify-citations.sh` — are bash-only.

---

## Two modes

| Mode | What you need | What you get |
|---|---|---|
| **Design-only** (no ServiceNow instance) | Nothing beyond the prerequisites above | The full 27-specialist engine — all routing, Domain Expert gateways, §1.1 governance, and `ServiceNowDocs/` grounding |
| **Live instance** | A ServiceNow instance (a PDI is fine) and an account with REST access | Everything above, plus reading and writing that instance through the MCP server |

Design-only is a complete, supported end state, not a half-finished install. `scripts/setup.sh` stops there cleanly if you decline the instance question, and `doctor.sh` records the absent MCP registration as a skip, not a failure.

Both scripts take `--tier0` to commit to design-only without being asked — `bash scripts/setup.sh --tier0` bootstraps the repo and never raises the instance question; `bash scripts/doctor.sh --tier0` skips the whole MCP section. Use them for a scripted or CI install where no prompt can be answered.

---

## Connecting a live instance

```bash
bash scripts/setup.sh --mcp
```

The script clones and builds the `servicenow-mcp` checkout, prompts for credentials without echoing them to the terminal, and registers the server with `claude mcp add` after taking a backup of `~/.claude.json`.

### Where the configuration actually lives

The MCP registration lives in **`~/.claude.json`**, under `projects["<absolute path to this repo>"].mcpServers`. Three consequences follow:

- This is a **Claude Code** file. It is **not** `claude_desktop_config.json` — that file belongs to the Claude Desktop application, and Claude Code never reads it. Editing it will appear to work and change nothing.
- Registration is keyed on the **absolute repo path**. Move or rename the checkout and the server silently disappears from that session; re-run `setup.sh` from the new location.
- A `.env` file inside the server checkout is **never read**. The server resolves `.env` against the runtime working directory, which is this repository, not the server's own directory.

The server resolves its connection in a fixed order, and the first match wins: (1) a file named by `SN_INSTANCES_CONFIG`, (2) the wizard store `~/.config/servicenow-mcp/instances.json` — written by the server's own `npm run setup`, (3) `SN_INSTANCE_<NAME>_*` variable groups, (4) the `SERVICENOW_*` variables in the env block. If either config file exists, the env block's **URL and credentials are ignored entirely** — you can be pointed at a different instance than the one you just configured, with no error.

Capability flags do **not** follow that order. The wizard store only fills in a flag the env block left unset; a flag present in the env block always wins. So a wizard store and an env block can be in force at the same time — instance from the file, permissions from the env block. `doctor.sh` fails on that conflict and prints both hostnames so you can see which instance you are actually talking to.

One further asymmetry: the server's startup check accepts only `SERVICENOW_INSTANCE_URL`, an `SN_INSTANCE_<NAME>_URL`, or `SN_INSTANCES_CONFIG`. A wizard store on its own does not satisfy it — the process exits with `No ServiceNow instance configured` even though `instances.json` is present and valid.

### Capability flags

| Flag | Default | What it unlocks | Depends on |
|---|---|---|---|
| `WRITE_ENABLED` | disabled | All create / update / delete operations | — |
| `SCRIPTING_ENABLED` | disabled | The entire `snow_scr_*` domain — script includes, business rules, client scripts, ACLs, UI actions and policies — **including its read tools**. Outside that domain it gates only writes and executions: update-set create / switch / complete / export / ensure-active, UI Builder component and data-broker writes, `snow_flow_flow_action_add`, `snow_intg_event_register`, `snow_deploy_artifact_clone`, `snow_deploy_background_script_exec`. Update-set *reads* are ungated | `WRITE_ENABLED=true` |
| `CMDB_WRITE_ENABLED` | disabled | The CMDB reconcile tool **only**. CI create/update through the generic record-add tool is governed by `WRITE_ENABLED`, so this is not blanket CMDB protection | `WRITE_ENABLED=true` |
| `ATF_ENABLED` | disabled | ATF test and suite **execution** only (`snow_atf_atf_test_exec`, `snow_atf_atf_suite_exec`). Listing and reading ATF records is ungated, so the ATF Author can author and inspect tests without it — it is needed only to run them from a session | — |
| `NOW_ASSIST_ENABLED` | disabled | All `snow_na_*` and `snow_nas_*` tools — required by the Now Assist Specialist; also needs a Now Assist licence on the instance | — |
| `FLUENT_ENABLED` | disabled | `snow_fluent_*` / now-sdk tools | — |
| `MCP_TOOL_PACKAGE` | `full` | Which tool subset is loaded. Valid values: `full`, `service_desk`, `change_coordinator`, `knowledge_author`, `catalog_builder`, `system_administrator`, `platform_developer`, `portal_developer`, `integration_engineer`, `itom_engineer`, `agile_manager`, `ai_developer`, `devops_engineer`, `itam_analyst`. **None of them is read-only**, and an unrecognised value falls back to `full` after a `[WARN]` on stderr — which lands in the MCP server log, not in your session, so you will not see it. The actual read-only control is `WRITE_ENABLED=false` | — |
| `MAX_RECORDS` | unset | Default page size for queries that pass no explicit limit. **Unset means a limit-less query returns only 10 rows, with no error and no warning.** A non-numeric value reads the same as unset. Both this default and an explicit `limit` are capped at **1000** — ask for 5000 rows and you silently receive 1000 | — |

Three rules govern all of the above:

- **An absent flag is treated as disabled, silently.** There is no warning at startup.
- **The server enables a capability only on the exact lowercase string `"true"`.** A JSON boolean `true`, `"True"`, `"1"` and `"yes"` all read as disabled. `"false"` is a valid way to say *off* — it is not the same as leaving the flag out.
- **The tools of a disabled family are still advertised to the model.** The failure therefore surfaces mid-task, in the middle of real work, rather than at startup. That is why the absent-flag case has to be caught by a doctor rather than by the server.

`doctor.sh` therefore grades **absent** and **`"false"`** differently, which is the distinction that matters:

- An **absent** tier flag is a **fail** — all six of them, including the ones you may never want. Absent is not a decision; it is a gap that surfaces as a mid-task `*_NOT_ENABLED` throw because the family stays advertised either way.
- An explicit **`"false"`** passes. Declaring a capability off is a decision, and the doctor records it as one.
- Any other value — a JSON boolean, `"True"`, `"1"`, a trailing space — is a **fail**, because the server reads it as disabled while it looks enabled to you.
- `MAX_RECORDS` unset is a **warn**: it degrades answers rather than breaking calls.

The practical consequence: write out all six, `"true"` or `"false"`, even on a design-only or PDI install.

**`SCRIPTING_ENABLED` gates reads, not just writes.** Listing script includes is blocked without it. This is the single most common cause of a mid-task failure on a fresh install.

---

## Security

- The credential is stored in **plaintext** in `~/.claude.json` — a file shared by every Claude Code project on the machine, not just this one. Never paste it whole into a support thread, an issue, or a screen share.
- Use a **dedicated integration service account**, never a personal SSO credential.
- The server supports `SERVICENOW_AUTH_METHOD=oauth` with the OAuth client and user variables. Prefer it for anything beyond a personal PDI.
- **Nothing in this repository should ever contain a real credential, a real instance hostname, or a real sys_id.** `doctor.sh` greps the tracked tree and fails if one appears. The check must exempt the documented placeholders this repository uses deliberately — `your-instance.service-now.com`, `<instance>`, `<repo-url>` — or it fails on a clean checkout; `docs/TECHNICAL-ARCHITECTURE.md` and `docs/MCP-OPERATIONS-GUIDE.md` both carry the placeholder hostname today.

Two side effects of registration are worth knowing about, because neither is obvious:

- `claude mcp add` passes the secret in `argv`, where it is briefly visible to `ps` on the local machine — one more reason to prefer OAuth.
- `setup.sh` takes a verified backup before it touches `~/.claude.json`, and those `~/.claude.json.bak-*` files contain **every secret that was in the file at the time**, including ones you have since rotated. Keep the most recent, delete the rest.

`doctor.sh` also reports how many *other* projects in `~/.claude.json` hold their own plaintext ServiceNow credentials — each stale registration is a separate copy of a password. Remove the ones you no longer use with `claude mcp remove <name>`, run from that project's directory.

---

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| `(Code: SCRIPTING_NOT_ENABLED)` | `SCRIPTING_ENABLED` missing or not exactly `"true"`. Gates the whole `snow_scr_*` domain, **reads included** | Set `SCRIPTING_ENABLED` and `WRITE_ENABLED` to `"true"`, restart Claude Code. Workaround without it: read script records through the generic records-query tool against `sys_script_include` |
| `(Code: WRITE_NOT_ENABLED)` | `WRITE_ENABLED` missing. Can also surface from a scripting or CMDB call, because those guards check write first | Set `WRITE_ENABLED` to `"true"`, restart Claude Code |
| `(Code: CMDB_WRITE_NOT_ENABLED)` | `CMDB_WRITE_ENABLED` missing | Set it (and `WRITE_ENABLED`) to `"true"`, restart |
| `(Code: ATF_NOT_ENABLED)` | `ATF_ENABLED` missing | Set it to `"true"`, restart |
| `(Code: NOW_ASSIST_NOT_ENABLED)` | `NOW_ASSIST_ENABLED` missing, or the instance has no Now Assist licence | Set it to `"true"`, restart; confirm the licence on the instance |
| `(Code: FLUENT_NOT_ENABLED)` | `FLUENT_ENABLED` missing | Set it to `"true"`, restart |
| `Username and password are required for Basic authentication (Code: AUTHENTICATION_FAILED)` | Auth variables absent — or the unprefixed `SERVICENOW_USERNAME` / `SERVICENOW_PASSWORD` were set. Those are **OAuth-only aliases**; basic auth reads `SERVICENOW_BASIC_USERNAME` / `SERVICENOW_BASIC_PASSWORD` | `bash scripts/setup.sh --creds-only` |
| `User Not Authenticated (Code: AUTHENTICATION_FAILED)` (HTTP 401) | Wrong or expired password | `bash scripts/setup.sh --creds-only` |
| `(Code: INSUFFICIENT_PRIVILEGES)` (HTTP 403) | The account lacks the role for that table or operation | Grant the role on the instance, or use an account that has it |
| `Failed to parse URL` / `ERR_INVALID_URL` | The instance URL is missing the `https://` scheme | Re-register with the full `https://<instance>.service-now.com` |
| Server exits with `No ServiceNow instance configured` | No instance URL reachable at runtime — typically a `.env` that is never read, or a wizard-written `instances.json` on its own, which the startup check does not accept | Re-run `bash scripts/setup.sh --mcp`; the URL belongs in the `env` block, not a `.env` file and not `instances.json` alone |
| `(Code: UNKNOWN_TOOL)` | A retired tool name. The server's tool set was renamed wholesale to the `snow_*` convention | Use the current name; if a document still cites the old one, that document is stale |
| **No error, but the answer is wrong** — a "latest" or "newest" query returns old records | The `orderBy` parameter's descending path emits a malformed sort clause and silently returns **ascending** order | Never use `orderBy: "-field"`. Put the sort in the encoded query instead: `query: "ORDERBYDESCsys_created_on"`. Sample five or more rows before asserting "newest". `doctor.sh` self-tests this |
| **No error, but only 10 rows come back** | `MAX_RECORDS` unset — the limit-less default is 10 | Always pass an explicit limit, and never infer record volume from a limit-less query |
| **No error, but exactly 1000 rows come back** | Both the default page size and an explicit `limit` are capped at 1000 | Page with `offset`, or count with an aggregate tool. Never read 1000 as "that is all of them" |
| MCP tools do not appear at all | Registered under the wrong project key, or written to `claude_desktop_config.json` | `claude mcp list`, then `/mcp` inside a session; re-run `bash scripts/setup.sh` from the repo root |
| `Status` shows fewer specialists than expected, or `ServiceNowDocs/` citations fail | The submodule or the `agents/` / `skills/` mirrors have drifted | `bash scripts/doctor.sh` — it names which one |

Any symptom not listed here: run `bash scripts/doctor.sh` first. It names the cause and the remedy for every check it owns.

---

## Verifying the install

1. Run `bash scripts/doctor.sh`. It ends with two lines — a tally, `DOCTOR: N ok, N warn, N fail`, and the `Mode:` line. A healthy install reads `0 fail` and exits `0`; any fail exits `1`, and each failing check prints its own remedy inline. Warnings are advisory and do not affect the exit code.
2. Start Claude Code from the repo root and type `Status`. Two things to confirm:
   - The reply opens with a **`Mode:`** line quoted from `doctor.sh`. That line, not the presence of `snow_*` tools in the tool list, is the authoritative statement of whether you are design-only or live and which flags are in force — a disabled family is still advertised, so the tool list always looks connected.
   - The roster lists **five** Domain Expert gateways (ITSM, CSM, HRSD, ITOM/Discovery, CMDB & CSDM).
3. Only if you are on a live instance: ask for the five most recently created incidents. If the newest is years old, `orderBy` has been used instead of an `ORDERBYDESC` encoded query — see the troubleshooting row above.

Do not treat a transcribed sample of either output as the specification — the counts change as the roster grows. The criteria above do not. `Status` deliberately reports no engine version number; the version of record is the `Engine version:` line in `CLAUDE.md`, read from the file rather than from a session.

---

*Canonical setup and troubleshooting guide for the ServiceNow Architecture Engine. Version of record for the engine itself is the `Engine version:` line in `CLAUDE.md`.*
