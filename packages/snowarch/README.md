# @farstic/snowarch

A [Model Context Protocol](https://modelcontextprotocol.io) server for ServiceNow. It speaks
**stdio only**, exposes the ServiceNow REST API as MCP tools, and is built so that what it will and
will not do on your instance is something you can read off a file rather than infer from behaviour.

Version of record: **2.0.0-dev**. The `2.0.0` release is cut later; until then the package version
and this document say `-dev` deliberately, so nobody mistakes a development checkout for a release.

---

## Quick start

```sh
npm ci                                  # dist/ is committed — there is no build step
node packages/snowarch/dist/server.js   # speaks MCP on stdin/stdout
```

It starts with **no instance configured** and answers `initialize`. That is a supported state, not
an error: five core tools stay callable so the server can explain itself —
`snow_core_status_read`, `snow_core_capabilities_read`, `snow_core_instances_reload`,
`snow_core_instances_index`, `snow_core_current_instance_read`. Everything else returns
`NO_INSTANCE_CONFIGURED`. After adding an instance, call `snow_core_instances_reload` — no restart.

To register it with a generic MCP client, add a server entry whose command runs this package:

```json
{
  "mcpServers": {
    "servicenow": {
      "command": "npx",
      "args": ["-y", "@farstic/snowarch@2", "start"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://dev12345.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "your.user",
        "SERVICENOW_BASIC_PASSWORD": "your-password"
      }
    }
  }
}
```

From a checkout, use `"command": "node"` with
`"args": ["<path>/packages/snowarch/dist/server.js"]` instead. *(The AI ServiceNow Architect
registers this server through its own committed `.mcp.json`; you do not write one by hand there.)*

Then call **`snow_core_status_read`**. It answers in every state — configured or not — and reports
which store was read, which instances loaded, and how many tools are advertised. It is the right
first call precisely because it cannot fail for lack of configuration.

---

## Configuration

There are two ways to configure an instance, and they do not merge.

### The store (recommended)

A JSON file, schema version 1, resolved by **first hit wins**:

| Order | Location |
|---|---|
| 1 | `$SNOW_STORE` — an explicit path. A missing file here is an **error**, never a fallback: a typo in an override must not silently load a different instance. |
| 2 | `<CLAUDE_PROJECT_DIR or cwd>/.local/instances.json` — the project store |
| 3 | `~/.config/snowarch/instances.json` (`%APPDATA%\snowarch\instances.json` on Windows) — the global store |

```json
{
  "version": 1,
  "defaultInstance": "pdi",
  "instances": {
    "pdi": {
      "url": "https://dev12345.service-now.com",
      "environment": "pdi",
      "auth": { "method": "basic", "username": "admin", "password": "…" },
      "preset": "pdi-developer",
      "toolPackage": "full",
      "maxRecords": 100,
      "prodWriteAck": false
    }
  }
}
```

The file must be **0600 in a 0700 directory** on POSIX; the server refuses to load a group- or
world-readable store rather than reading credentials out of one. On Windows permissions are
ACL-inherited and the mode check is skipped.

`url` must be a **bare https origin** — no path, no trailing slash. A trailing slash produces
`https://host//api/now/…` on join, which some proxies reject and others silently rewrite.

### Environment variables

`SERVICENOW_INSTANCE_URL` and friends define a single instance and **win over any store**, which is
then reported as ignored at start-up. Convenient for a one-off; the store is what you want for more
than one instance. See `.env.example` for the full set.

The server reads a `.env` file only when `SNOW_ENV_FILE` names one — never the current directory's.
For an MCP server that directory is your project, and an unrelated `WRITE_ENABLED=true` sitting in
it would arm writes nobody chose.

### Authentication

Two methods, set by `SERVICENOW_AUTH_METHOD` (or `auth.method` in the store).

**`basic`** — `SERVICENOW_BASIC_USERNAME` and `SERVICENOW_BASIC_PASSWORD`. Simplest, and what a
PDI usually wants.

**`oauth`** — the resource-owner password credentials flow, using
`SERVICENOW_OAUTH_CLIENT_ID`, `SERVICENOW_OAUTH_CLIENT_SECRET`, `SERVICENOW_OAUTH_USERNAME` and
`SERVICENOW_OAUTH_PASSWORD`. On the ServiceNow side: **System OAuth → Application Registry → New →
"Create an OAuth API endpoint for external clients"**, then take the generated **Client ID** and
**Client Secret**. Leave the redirect URL empty — this flow does not use one. If your instance has
ROPC disabled, that shows up as an authentication failure, not a configuration error.

Whichever you use, the credentials live in the store or the environment and appear in no log, no
audit line and no doctor output.

### Switching instances

**`snow_core_instance_switch` is the only way to change which instance a call goes to.** Every other
tool acts on the current one, whatever its arguments say — a per-call `instance` argument used to
route and was removed in 2.0.0, because it was in no tool's schema and could send a write somewhere
the session did not believe it was addressing.

---

## What the server will and will not do: flags and presets

Six flags gate everything that changes state. Reads are never gated.

<!-- generated:presets -->

Presets are named flag sets. A flag is on only when it is the exact string `true`;
anything else — `TRUE`, `1`, `yes`, unset — is off.

| Preset | `WRITE` | `CMDB_WRITE` | `SCRIPTING` | `ATF` | `NOW_ASSIST` | `FLUENT` |
|---|---|---|---|---|---|---|
| `read-only` | off | off | off | off | off | off |
| `pdi-developer` | on | on | on | on | off | off |
| `full` | on | on | on | on | on | on |

`CMDB_WRITE`, `SCRIPTING`, `ATF` and `NOW_ASSIST` additionally require `WRITE`: a tool
gated on one of them is refused while `WRITE` is off, and the refusal names `WRITE` first.

<!-- /generated:presets -->

**`SCRIPTING` gates *writing* scripting objects, not reading them.** Listing business rules or
exporting an update set needs no flag. This changed in 2.0.0 — see the migration notes.

**A `prod` instance raised above `read-only` is refused** unless `prodWriteAck: true` is set on it.
The refusal names the exact command that acknowledges it. Arming writes against production should be
a decision someone made on purpose, on a date, in a file.

---

## Tools

<!-- generated:families -->

**397 tools in 37 families.** Counts come from
`dist/contract.json`; the table is generated by `scripts/gen-readme-tables.mjs`.

| Family | Tools | What it covers |
|---|---:|---|
| `snow_core_*` | 27 | Core records, tables, CMDB, users, groups |
| `snow_scr_*` | 27 | Scripting objects |
| `snow_intg_*` | 19 | Integrations and events |
| `snow_sec_*` | 19 | Security operations and GRC |
| `snow_rpt_*` | 17 | Reports, scheduled jobs, logs |
| `snow_flow_*` | 16 | Flow Designer |
| `snow_hr_*` | 16 | HR Service Delivery |
| `snow_portal_*` | 16 | Service Portal |
| `snow_ws_*` | 16 | Workspaces and UI Builder |
| `snow_cat_*` | 15 | Service Catalog and requests |
| `snow_perf_*` | 15 | Performance Analytics and dashboards |
| `snow_ntf_*` | 14 | Notifications, email, attachments |
| `snow_cfg_*` | 12 | System properties |
| `snow_ml_*` | 12 | Machine learning and predictions |
| `snow_csm_*` | 11 | Customer Service |
| `snow_deploy_*` | 10 | Deployment and packaging |
| `snow_itam_*` | 10 | Asset and licence |
| `snow_mob_*` | 10 | Mobile |
| `snow_na_*` | 10 | Now Assist |
| `snow_agile_*` | 9 | Agile development |
| `snow_atf_*` | 9 | Automated Test Framework |
| `snow_us_*` | 9 | Update sets |
| `snow_usr_*` | 8 | Users and groups administration |
| `snow_chg_*` | 7 | Change |
| `snow_devops_*` | 7 | DevOps Change Velocity |
| `snow_fluent_*` | 7 | ServiceNow SDK |
| `snow_inc_*` | 7 | Incident |
| `snow_kb_*` | 7 | Knowledge |
| `snow_va_*` | 7 | Virtual Agent |
| `snow_ai_*` | 4 | AI agents |
| `snow_cmdb_*` | 4 | CMDB reconciliation and health |
| `snow_nas_*` | 4 | Now Assist skills |
| `snow_prb_*` | 4 | Problem |
| `snow_studio_*` | 4 | Scoped applications |
| `snow_tsk_*` | 4 | Task |
| `snow_orch_*` | 3 | Orchestration playbooks |
| `snow_disco_*` | 1 | Schema discovery |

<!-- /generated:families -->

### Loading a subset

<!-- generated:bundles -->

`MCP_TOOL_PACKAGE` selects a subset of the catalogue. The default is `full`, and **`full` is
what the AI ServiceNow Architect needs** — a bundle hides tools the engine cites by name.

| `MCP_TOOL_PACKAGE` | Tools |
|---|---:|
| `full` | 397 |
| `agile_manager` | 13 |
| `ai_developer` | 35 |
| `catalog_builder` | 14 |
| `change_coordinator` | 19 |
| `devops_engineer` | 24 |
| `integration_engineer` | 29 |
| `itam_analyst` | 12 |
| `itom_engineer` | 21 |
| `knowledge_author` | 13 |
| `platform_developer` | 54 |
| `portal_developer` | 37 |
| `service_desk` | 23 |
| `system_administrator` | 78 |

The value is read once, at start-up: the catalogue is fixed for the life of the process, so
`tools/list` answers the same way all session. An unknown name falls back to `full` with a
warning on stderr.

<!-- /generated:bundles -->

Names follow `snow_<family>_<subject>_<verb>`. The verb tells you what it does: `_read`, `_index`
and `_query` never change anything; everything else may.

`dist/contract.json` carries every tool with its gate and a `mutates` flag, which is what the
Architect's approval rules are generated from. Read it rather than inferring from names.

Two tools are registered and **always refuse**: `snow_deploy_background_script_exec` and
`snow_fluent_script_exec`. Server-side script execution has no supported REST endpoint on any
instance. They stay registered so the refusal is clear — `UNSUPPORTED_ON_THIS_INSTANCE`, naming the
UI route that does work — rather than reading as a typo.

---

## Corporate networks

Node's built-in `fetch` ignores proxy environment variables entirely — that is the specification,
not a bug — so before 2.0.0 the server failed with a bare `fetch failed` on a laptop where `curl` to
the same URL worked. It now routes every request through an agent that reads these:

| Variable | What it does |
|---|---|
| `HTTPS_PROXY` / `https_proxy` | Proxy for `https://` requests. `http://user:pass@proxy:8080` is accepted; credentials are masked wherever the proxy is printed. |
| `HTTP_PROXY` / `http_proxy` | Proxy for `http://` requests. |
| `NO_PROXY` / `no_proxy` | Comma-separated hosts to reach directly. |
| `NODE_EXTRA_CA_CERTS` | Path to a PEM holding your organisation's root CA. Read **by Node at process start**, so it must be set before the server launches — changing it in a running session does nothing. |

An **empty** value means unset: the server deletes empty proxy and CA variables at start-up, before
the HTTP agent is built, so a launcher that forwards `${HTTPS_PROXY:-}` is safe.

**Exporting your root CA as PEM**

- **macOS** — Keychain Access → System Roots (or Login) → find the CA → File → Export as `.cer`,
  then `openssl x509 -inform der -outform pem -in ca.cer -out ca.pem`.
- **Windows** — `certmgr.msc` → Trusted Root Certification Authorities → the CA → All Tasks →
  Export → **Base-64 encoded X.509 (.CER)**. That file is already PEM; rename it `.pem` if you like.
- **Linux** — usually already in `/etc/ssl/certs`; point `NODE_EXTRA_CA_CERTS` at the specific
  organisation PEM rather than the bundle.

**Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`.** It is the first search result for the TLS error and
it disables certificate verification for the whole process — on a network that intercepts TLS, that
means trusting the interceptor and every other certificate too.

When something fails, the error says which of these it was: `DNS_FAILURE`, `TLS_CA_UNTRUSTED`,
`PROXY_UNREACHABLE`, `CONNECTION_REFUSED`, `CONNECTION_TIMEOUT` — each with a remedy naming the
variable actually set. The three most common failures on a corporate laptop have three different
fixes, and the one people reach for first, their credentials, is usually the one that is fine.

---

## The audit trail

Every call to a tool that changes state appends one JSON line to `<store dir>/audit.jsonl` (0600,
rotated at 10 MB, three kept). `SNOW_AUDIT_FILE` moves it; `SNOW_AUDIT_FILE=off` disables it, warned
once at start-up.

```json
{"ts":"2026-09-08T10:22:31.412Z","instance":"pdi","environment":"pdi","tool":"snow_core_record_add",
 "gate":"write","table":"incident","sysId":"a1b2…","query":null,"result":"ok","ms":312,"source":"mcp"}
```

**Never in it:** payload values (`fields`, `data`, `script`, the response body), credentials, or the
instance URL — the label identifies the instance, and this file ends up in tickets. **Refusals are
recorded** with their code; non-mutating tools append nothing.

**`query` is recorded and can contain personal data** — `caller_id=…`, a name in a `LIKE` filter. It
is the filter that selected the records, so a line without it answers nothing. If that is not
acceptable for an engagement, set `SNOW_AUDIT_FILE=off`, or point it outside the checkout.

`snow_core_instance_switch` is audited too, with a `note` naming the destination: it redirects where
every later write lands, so a line after it naming a different instance would otherwise be
unexplained.

---

## Diagnosing a problem

```sh
node packages/snowarch/dist/cli/index.js doctor            # one line per check
node packages/snowarch/dist/cli/index.js doctor --json     # the report object
node packages/snowarch/dist/cli/index.js doctor --no-network
```

Nine checks: Node floor, `dist/` artefacts, the store and its modes, per-instance flags and prod
posture, network probes, a real stdio handshake against the server comparing advertised tools to the
contract, capabilities against the store, the audit file, and ancestor `.claude/skills` directories.
Exit **0** when nothing failed, **1** on any failure, **3** when the doctor could not run at all.

Its output is written to be pasted: masked paths, no clear usernames, no secret values.

### Error codes

<!-- generated:error-codes -->

Every code the server can throw (50), with what to do about it.
Generated from `src/errors/codes.ts` via `dist/contract.json`.

| Code | Remedy |
|---|---|
| `ATF_NOT_ENABLED` | ./snowarch instance set-preset <label> pdi-developer |
| `ATTACHMENT_UPLOAD_FAILED` | check the file size and the target record |
| `AUTHENTICATION_FAILED` | stop; ./snowarch instance set-credentials <label> |
| `BATCH_FAILED` | one or more requests in the batch failed; the message lists them |
| `CMDB_WRITE_NOT_ENABLED` | ./snowarch instance set-preset <label> pdi-developer |
| `CONNECTION_REFUSED` | the instance refused the connection; check the URL, its port, and whether the instance is awake |
| `CONNECTION_TIMEOUT` | the connection timed out; set HTTPS_PROXY on a corporate network, else check connectivity |
| `CREATE_FAILED` | the message carries the instance response |
| `DELETE_ACL_DENIED` | the account lacks delete access to that table; this is not a flag |
| `DELETE_CONSTRAINT` | another record references it; remove the reference first |
| `DELETE_FAILED` | the message carries the instance response |
| `DELETE_NOT_FOUND` | nothing to delete at that sys_id |
| `DNS_FAILURE` | the host name did not resolve; check the spelling, and set HTTPS_PROXY on a corporate network |
| `ECONNREFUSED` | the instance refused the connection; check the url and any proxy |
| `ENOTFOUND` | the instance host does not resolve; check the url in the store |
| `ETIMEDOUT` | the instance did not answer in time |
| `FLUENT_ERROR` | the message carries the SDK output |
| `FLUENT_NOT_ENABLED` | ./snowarch instance set-preset <label> full |
| `FLUENT_NOT_INSTALLED` | install @servicenow/sdk in the checkout |
| `INSTANCE_NOT_LOADED` | read the reason in snow_core_status_read; usually ./snowarch instance set-preset <label> <preset> --ack-prod |
| `INSTANCE_UNUSABLE` | the store entry parsed but a client could not be built; the message says why |
| `INSUFFICIENT_PRIVILEGES` | the account lacks a ServiceNow role for this table; this is not a flag |
| `INVALID_REQUEST` | the message names the missing or malformed argument |
| `NETWORK_ERROR` | the instance was unreachable; the message carries the cause |
| `NO_INSTANCE_CONFIGURED` | /snowarch setup-instance |
| `NOT_FOUND` | the record or table does not exist on this instance |
| `NOT_IMPLEMENTED` | the surface was removed; the message names what replaced it |
| `NOW_ASSIST_ERROR` | the message carries the instance response; check the Now Assist licence |
| `NOW_ASSIST_NOT_ENABLED` | ./snowarch instance set-preset <label> full |
| `PROD_WRITE_NOT_ACKNOWLEDGED` | ./snowarch instance set-preset <label> <preset> --ack-prod |
| `PROXY_UNREACHABLE` | nothing is listening at the proxy named by HTTPS_PROXY/HTTP_PROXY; correct it or unset it |
| `QUERY_FAILED` | the message carries the instance response |
| `RATE_LIMITED` | retry later; reduce maxRecords or the call rate |
| `REQUEST_FAILED` | the message carries the instance response |
| `SCHEMA_NOT_CACHED` | call the schema read tool for that table first |
| `SCRIPT_FAILED` | the script ran and errored; the message carries the instance output |
| `SCRIPTING_NOT_ENABLED` | ./snowarch instance set-preset <label> pdi-developer |
| `STORE_NOT_FOUND` | SNOW_STORE names a file that is not there; correct it or unset it |
| `STORE_PERMISSIONS_TOO_OPEN` | the message carries the exact chmod |
| `STORE_SCHEMA_INVALID` | the message names the field path; correct it in the store |
| `STORE_SCHEMA_UNSUPPORTED` | ./snowarch upgrade |
| `STORE_UNREADABLE` | the store is not valid JSON; repair or recreate it |
| `TLS_CA_UNTRUSTED` | export your organisation root CA as PEM and set NODE_EXTRA_CA_CERTS to it; never disable certificate verification |
| `UNKNOWN_GATE` | server defect: a tool declares a gate the evaluator does not know |
| `UNKNOWN_INSTANCE` | snow_core_instances_index lists the configured labels |
| `UNKNOWN_TOOL` | the name exists in no configuration; check the spelling |
| `UNSUPPORTED_ON_THIS_INSTANCE` | no REST endpoint backs this operation; the message names the UI route that does (e.g. Scripts - Background, or a Fix Script) |
| `UPDATE_FAILED` | the message carries the instance response |
| `VALIDATION_ERROR` | the message names the argument and the expected shape |
| `WRITE_NOT_ENABLED` | ./snowarch instance set-preset <label> pdi-developer |

<!-- /generated:error-codes -->

---

## Result size

A tool result is capped so one call cannot flood a conversation: the client's
`_meta["anthropic/maxResultSizeChars"]` if it sends one, else `SNOW_MAX_RESULT_CHARS`, else 100,000
characters. A records-shaped result drops whole records from the end and gains
`{ "truncated": true, "returned": …, "total_fetched": …, "hint": … }`; anything else is cut with a
marker. A result under the cap is untouched and gains **no** `truncated` key.

---

## Update sets

REST writes are captured according to the authenticated user's `sys_user_preference` with
`name=sys_update_set` — **not** the `is_default` flag on the update set, which is a UI concept and
does nothing for the API. So the order is:

1. `snow_us_active_update_set_ensure { name }` — requires a name, and returns only *your*
   in-progress sets. Without the name and the current-user filter it used to return whoever had
   opened one last, and objects landed in a stranger's update set.
2. `snow_us_capture_target_set { update_set_sys_id }` — points capture at it.
3. Do the work.
4. `snow_us_update_set_preview { sys_id }` — confirm the objects appear.

---

## Development

```sh
node scripts/build-dist.mjs      # the only way to rebuild the committed dist/
npm test                         # the workspace suite
npm run type-check               # src and tests, separately
```

`dist/` is committed and CI rebuilds and diffs it. **Never edit it by hand.** The tables in this
README between `<!-- generated:… -->` markers are written by `node scripts/gen-readme-tables.mjs`,
and CI runs `--check`. Everything outside those markers is prose — and prose is where a claim can be
wrong without anything noticing, which is why the facts here are not prose.

See `docs/CONTRIBUTING.md` at the repository root.

---

## Licence

Apache-2.0. See `LICENSE` and `NOTICE` at the repository root.
Repository: <https://github.com/farstic/ai-servicenow-architect>
