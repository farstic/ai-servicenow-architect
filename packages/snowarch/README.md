# ServiceNow MCP Toolkit

## Without an instance

The server starts even with nothing configured, and five tools stay callable so it can explain itself:
`snow_core_status_read`, `snow_core_capabilities_read`, `snow_core_instances_reload`,
`snow_core_instances_index`, `snow_core_current_instance_read`. Everything else returns
`NO_INSTANCE_CONFIGURED`. After adding an instance, call `snow_core_instances_reload` — no restart.

## Corporate networks

Node's built-in `fetch` ignores proxy environment variables entirely — that is the specification,
not a bug — so before this the server failed with a bare `fetch failed` on a laptop where `curl` to
the same URL worked. It now routes every request through an agent that reads these:

| Variable | What it does |
|---|---|
| `HTTPS_PROXY` / `https_proxy` | Proxy for `https://` requests. `http://user:pass@proxy:8080` is accepted; credentials are masked wherever the proxy is printed. |
| `HTTP_PROXY` / `http_proxy` | Proxy for `http://` requests. |
| `NO_PROXY` / `no_proxy` | Comma-separated hosts to reach directly. |
| `NODE_EXTRA_CA_CERTS` | Path to a PEM holding your organisation's root CA. Read **by Node at process start**, so it must be set before the server launches — changing it in a running session does nothing. |

An **empty** value means unset. ARC-06 forwards these as `${HTTPS_PROXY:-}`, which expands to an
empty string rather than omitting the entry, and an empty string is not a valid proxy URL — so the
server deletes empty values at start-up, before the agent is built.

**Exporting your root CA as PEM**

- **macOS** — Keychain Access → System Roots (or Login) → find the CA → File → Export as `.cer`, then
  `openssl x509 -inform der -outform pem -in ca.cer -out ca.pem`.
- **Windows** — `certmgr.msc` → Trusted Root Certification Authorities → the CA → All Tasks → Export →
  **Base-64 encoded X.509 (.CER)**. That file is already PEM; rename it `.pem` if you like.
- **Linux** — usually already in `/etc/ssl/certs`; point `NODE_EXTRA_CA_CERTS` at the specific
  organisation PEM rather than the bundle.

**Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`.** It is the first search result for the TLS error and it
disables certificate verification for the whole process — on a network that intercepts TLS, that means
trusting the interceptor and every other certificate too.

**When something fails, the error says which of these it was.** `DNS_FAILURE`, `TLS_CA_UNTRUSTED`,
`PROXY_UNREACHABLE`, `CONNECTION_REFUSED`, `CONNECTION_TIMEOUT` — each with a remedy naming the
variable actually set. The three most common failures on a corporate laptop have three different
fixes, and the one people reach for first, their credentials, is usually the one that is fine.

## The audit trail

Every mutating call appends one JSON line to `<store dir>/audit.jsonl` (0600, rotated at 10 MB, three
kept). `SNOW_AUDIT_FILE` moves it; `SNOW_AUDIT_FILE=off` disables it, warned once at start-up.

```json
{"ts":"2026-09-08T10:22:31.412Z","instance":"pdi","environment":"pdi","tool":"snow_core_record_add",
 "gate":"write","table":"incident","sysId":"a1b2…","query":null,"result":"ok","ms":312,"source":"mcp"}
```

**Never in it:** payload values (`fields`, `data`, `script`, the response body), credentials, or the
instance URL — the label identifies the instance, and this file ends up in tickets. **Refusals are
recorded** with their code (`WRITE_NOT_ENABLED`, …); non-mutating tools append nothing.

**`query` is recorded, and can contain personal data** — `caller_id=…`, a name in a `LIKE` filter. It is
the filter that selected the records, so a line without it answers nothing; it is also a string the
engine already had. If that is not acceptable for an engagement, set `SNOW_AUDIT_FILE=off` and lose the
trail, or point it outside the checkout.

`snow_core_instance_switch` is audited too, with `table`/`sysId`/`query` null and a `note` naming the
destination: it redirects where every later write lands, so a line after it naming a different instance
would otherwise be unexplained.

## Changing instance

**`snow_core_instance_switch` is the only way to change the instance a call goes to.** Every other tool
acts on the *current* instance, whatever its arguments say. A per-call `instance` argument used to route
— it was in no tool's `inputSchema`, so it was an undocumented side channel that could send a write to a
different instance than the session believed it was addressing. Passing one now has no effect.

*(Minimal insert; ARC-04-S14 rewrites this file.)*

A [Model Context Protocol](https://modelcontextprotocol.io) server for ServiceNow. It exposes **397 tools** spanning ITSM, CMDB, scripting, platform development, integration, security, and AI domains, so an MCP-capable assistant can read and operate a ServiceNow instance through a single, consistent interface.

## Highlights

- **397 tools** across 37 functional domains, each with a typed input schema.
- **Resource-first naming grammar** — every tool is named `snow_<domain>_<entity>_<action>`, so all operations on one entity sit together (e.g. `snow_inc_incident_add`, `snow_inc_incident_read`, `snow_inc_incident_modify`, `snow_inc_incident_resolve`).
- **Tiered write safety** — reads are always available; writes, CMDB writes, scripting, AI, ATF, and Fluent SDK operations are each gated behind an explicit environment flag.
- **Role-based tool packages** — load only the tools a persona needs via `MCP_TOOL_PACKAGE`.
- **Multi-transport** — stdio (default), SSE, and HTTP.
- **Explained deletes** — record deletion attempts the API call and returns a categorised, human-readable reason on failure (permission/ACL, reference constraint, not found).

## Install

```bash
npm install
npm run build
```

## Configure

Copy `.env.example` to `.env` and set at least your instance and auth:

```bash
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=basic            # or: oauth
SERVICENOW_BASIC_USERNAME=...
SERVICENOW_BASIC_PASSWORD=...
```

Write operations are off by default. Enable them deliberately:

| Flag | Unlocks |
|------|---------|
| `WRITE_ENABLED=true` | Standard record writes (create/update/delete, ITSM) |
| `CMDB_WRITE_ENABLED=true` | CI create/update (also needs `WRITE_ENABLED`) |
| `SCRIPTING_ENABLED=true` | Business rules, script includes, ACLs (also needs `WRITE_ENABLED`) |
| `NOW_ASSIST_ENABLED=true` | Generative AI / Now Assist tools |
| `ATF_ENABLED=true` | Automated Test Framework execution |
| `FLUENT_ENABLED=true` | Fluent / now-sdk tools |

Other useful settings: `MCP_TOOL_PACKAGE`, `TRANSPORT` (`stdio`/`sse`/`http`), `PORT`, `SNMCP_API_KEY` (bearer token for SSE/HTTP), `LOG_LEVEL`, `MAX_RECORDS`.

## Run

```bash
npm start            # stdio transport (local dev)
TRANSPORT=http PORT=3000 npm start   # HTTP server + REST API + dashboard
```

After building, the stdio server is also available through the bundled binaries — handy for global installs and MCP client configs:

```bash
npx servicenow-mcp start       # via the CLI (safely spawns the server)
npx -y servicenow-mcp-server   # dedicated stdio server binary
```

## Tool naming

| Part | Meaning | Example |
|------|---------|---------|
| `snow_` | global namespace | — |
| `<domain>` | functional area code | `inc`, `chg`, `cmdb`, `scr`, `sec`, `rpt`, `kb` |
| `<entity>` | the object acted on | `incident`, `change_request`, `record` |
| `<action>` | canonical verb | `index` (list), `read` (get), `add` (create), `modify` (update), `remove` (delete), plus `resolve`, `close`, `exec`, `query`, … |

Input-argument names follow ServiceNow field conventions (`sys_id`, `table`, `number_or_sysid`, …).

## Tool domains

ITSM (`inc`, `prb`, `chg`, `tsk`), core Table API (`core`), users/groups (`usr`), knowledge (`kb`), catalog (`cat`), CSM (`csm`), HRSD (`hr`), Virtual Agent (`va`), scripting (`scr`), security/SecOps (`sec`), ATF (`atf`), DevOps (`devops`), Fluent SDK (`fluent`), Flow Designer (`flow`), App Studio (`studio`), workspaces (`ws`), portal (`portal`), integration (`intg`), CMDB reconciliation (`cmdb`), discovery (`disco`), asset management (`itam`), deployment (`deploy`), update sets (`us`), reporting (`rpt`), performance analytics (`perf`), ML (`ml`), Now Assist (`na`/`nas`), notifications (`ntf`), mobile (`mob`), agile (`agile`), orchestration (`orch`), system properties (`cfg`).

## Develop

```bash
npm run dev          # watch mode
npm test             # vitest, includes the 394-tool parity suite
npm run type-check
npm run lint
```

## License

Apache-2.0 — see [LICENSE](./LICENSE) and the repository [NOTICE](../../NOTICE). © 2026 Cvetomir Grigorov.
