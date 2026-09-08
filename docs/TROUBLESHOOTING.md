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
