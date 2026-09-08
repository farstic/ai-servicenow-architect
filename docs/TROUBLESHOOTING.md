# Troubleshooting

> **Seed — ARC-05 generates this file from the tool contract.** The entry below exists because
> ARC-04-S04 introduced the error it describes; the generator will absorb it.

## `NO_INSTANCE_CONFIGURED`

```
No ServiceNow instance is configured for this checkout. Inside Claude Code run
/snowarch setup-instance; in a terminal run ./snowarch instance add <label>.
```

**What it means.** The server is running and healthy — it just has no instance to talk to. It stays up
on purpose: an unconfigured checkout used to exit at start-up, so the one moment you most needed the
server to explain itself was the moment it was not there.

**What still works.** Five tools that need no instance: `snow_core_status_read`,
`snow_core_capabilities_read`, `snow_core_instances_reload`, `snow_core_instances_index`,
`snow_core_current_instance_read`. Start with `snow_core_status_read` — it names every path that was
searched and whether anything was there.

**Fixing it.**

1. Add an instance: `/snowarch setup-instance` in Claude Code, or `./snowarch instance add <label>` in
   a terminal.
2. Call `snow_core_instances_reload`. **You do not need to restart Claude Code** — the server
   re-advertises its tools and the full catalogue becomes callable in the same session.

**If the store exists and is still not loaded**, `snow_core_status_read` says why:

| Code | Meaning |
|---|---|
| `STORE_NOT_FOUND` | `SNOW_STORE` points at a file that is not there. It is an explicit override, so it never falls back to another store. |
| `STORE_PERMISSIONS_TOO_OPEN` | The file is group- or world-readable, or its directory is group/world-writable without the sticky bit. The message carries the exact `chmod`. |
| `STORE_SCHEMA_INVALID` | A field is wrong; the message names its path, e.g. `instances.pdi.flags.WRITE_ENABLED`. |
| `STORE_SCHEMA_UNSUPPORTED` | Written by a newer server — run `./snowarch upgrade`. |
| `PROD_WRITE_NOT_ACKNOWLEDGED` | A `prod` instance is raised above `read-only` without `prodWriteAck`. It is listed but not loaded; the message carries the `--ack-prod` command. |

---

## `UNSUPPORTED_ON_THIS_INSTANCE` — the tool exists, the capability does not

**What it means.** The tool is registered, your preset let it through, and the server then refused
without contacting the instance. The operation has **no REST endpoint** — not on your instance, not
on any instance. No flag, preset or role changes that, which is why the remedy is a different route
rather than a setting.

**Where it fires today.**

| Tool | Why | What to do instead |
|---|---|---|
| `snow_deploy_background_script_exec` | Server-side script execution is not part of the REST API. The tool used to POST to an endpoint that does not exist and returned a 400/404 the caller had to interpret. | Run the script in **System Definition → Scripts - Background**, or author it as a Fix Script (`sys_script_fix`) and run it from the UI. |
| `snow_fluent_script_exec` | Same endpoint, same absence. | As above. |

**Why they are still registered.** Removing the names would turn a clear refusal into
`UNKNOWN_TOOL`, which reads as "you spelled it wrong" and sends you looking for a typo that is not
there. They stay in the catalogue, are marked `[Unsupported]` in their descriptions, and fail
**before** any HTTP request — so nothing reaches the instance and nothing is half-done.

**A note on Fix Scripts.** `sys_script_fix.name` silently truncates at 40 characters over REST, so a
longer name comes back looking like a different record. Name it short enough to read back intact.

---

## Corporate networks — `DNS_FAILURE`, `TLS_CA_UNTRUSTED`, `PROXY_UNREACHABLE`

**Why these exist.** Node's `fetch` fails with `TypeError: fetch failed` for all three of these, and
the real reason sits two `cause` levels down. The three have three different fixes, and the one people
check first — their credentials — is usually the one that is fine. The server now names which it was.

| Code | What happened | What to do |
|---|---|---|
| `DNS_FAILURE` | The instance host name did not resolve (`ENOTFOUND`, `EAI_AGAIN`). | Check the spelling first. On a corporate network, set `HTTPS_PROXY`. Note that a proxy does **not** resolve names for you unless the request goes through it — so this code with a proxy already set usually means the name is wrong. |
| `TLS_CA_UNTRUSTED` | The certificate was not signed by a CA this machine trusts. Normal on a network that intercepts TLS. | Export your organisation root CA as PEM and set `NODE_EXTRA_CA_CERTS` to its path, then **restart** — Node reads it once, at process start. See "Corporate networks" in the package README for the per-OS export steps. |
| `PROXY_UNREACHABLE` | A proxy variable is set and nothing is listening there (or the connection timed out). | The message names the proxy, with any credentials masked. Correct the host and port, or unset the variable if you are not behind a proxy. |
| `CONNECTION_REFUSED` | The instance refused the connection and **no** proxy is configured. | Check the URL, its port, and whether the instance is awake. |
| `CONNECTION_TIMEOUT` | The connection timed out with no proxy configured. | Set `HTTPS_PROXY` if you are on a corporate network; otherwise check connectivity. |

**Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`.** It is the first search result for the TLS error and it
disables certificate verification for the whole process — on a network that intercepts TLS, that means
trusting the interceptor and every other certificate too. The server never suggests it.

**An empty value means unset.** `HTTPS_PROXY=""` is what `${HTTPS_PROXY:-}` expands to when the
variable is not set in the launching shell, and an empty string is not a valid proxy URL. The server
deletes empty proxy and CA variables at start-up, before the HTTP agent is built, so forwarding them is
safe.
