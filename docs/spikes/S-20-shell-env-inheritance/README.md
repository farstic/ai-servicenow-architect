> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-20 — Shell environment inheritance of project stdio servers

**Run by:** ARC-00-S06 · **Verdict consumed by:** ARC-04-S11 / ARC-06-S01 / ARC-08-S03 (E-26)

**Status: CONFIRMED on macOS, non-interactively — and the story's own procedure for it cannot be
executed as written.**

## Assumption

> Project stdio servers spawned from `.mcp.json` inherit `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` from the shell that started `claude` (macOS, Windows cmd and PowerShell 5.1)

**Impact if false:** M (proxied laptops, R-15) · **Evidence so far (from `03`):** No statement in `docs:mcp`; raised by ARC-04-S11's risk note

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 · git 2.39.5 |
| Claude Code | **2.1.258** only for this sitting (S-21) · `~/.claude.json` `migrationVersion` unchanged at 14 |
| Ubuntu VM · Windows VM | `NOT RUN — awaiting the owner's claude login in arc00-ubuntu` · `DEFERRED — Windows VM pending (owner input #2)` |
| Date | 2026-09-07 |

## Procedure

**Check that retires it (from `03`):** Stub server echoes its environment on both platforms (ARC-00-S06).

**This was done without a session**, which the story did not anticipate. Three flags make a project
stdio server reachable from `claude -p` without the workspace-trust and per-server-approval path:

```sh
claude -p --mcp-config <file> --settings <file-with-an-allow-rule> --strict-mcp-config \
  "Call snow_probe_env_read and paste its whole text output verbatim. Nothing else."
```

`--mcp-config` loads the server directly, `--strict-mcp-config` suppresses every other configured
server, and `--settings` carries `permissions.allow` for the two stub tools so nothing prompts. **This
technique is reusable** — several spikes currently marked owner-gated may be answerable the same way.

## Observed

### macOS — the probe output, verbatim

```
snow_probe_env_read (stub)
cwd: <scratch>/s06
argv: ["/usr/local/bin/node","~/work/snowarch-spikes/spikes/stub-server/server.mjs"]
env:
CLAUDE_PROJECT_DIR: <scratch>/s06
SNOW_STORE: unset
STUB_CONFIGURED: 1
HTTPS_PROXY: unset
HTTP_PROXY: unset
NO_PROXY: set (len 18)
NODE_EXTRA_CA_CERTS: set (len 137)
```

Exported in the shell that started `claude`: `NO_PROXY` (18 characters) and `NODE_EXTRA_CA_CERTS`
(137). **Both arrive at the spawned server with their exact lengths**, and neither appears in the
`.mcp.json` `env` block — which carries only `STUB_CONFIGURED`. So **the server inherits the launching
shell's environment**; `.mcp.json` `env` adds to that inheritance rather than replacing it.

Two further facts fall out of the same output: **`CLAUDE_PROJECT_DIR` is set by Claude Code in the
server's environment** (the `01` §5 evidence-table claim, now observed), and `argv[1]` is the fully
resolved absolute script path.

### Why `HTTPS_PROXY` was not set for the run above — and why the story's procedure cannot work

The story's step 1 says to export `HTTPS_PROXY=http://user:pass@proxy.invalid:3128` and then start
`claude`. **That kills the session: Claude Code's own API traffic honours `HTTPS_PROXY`.**

```
$ HTTPS_PROXY=http://user:pass@proxy.invalid:3128 claude -p …
API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)
```

Adding `NO_PROXY` for the API host **does not rescue it** — the failure only changes shape:

```
$ NO_PROXY='localhost,.invalid,.anthropic.com,api.anthropic.com,claude.ai,.claude.ai' …
API Error: Can't reach the API server — check your internet or DNS (FailedToOpenSocket)
```

So an unreachable proxy in `HTTPS_PROXY` prevents any Claude Code session from starting, with or
without `NO_PROXY`. **The owner would have burned that step in the sitting.**

`HTTPS_PROXY` and `HTTP_PROXY` are ordinary environment variables and nothing in the observed behaviour
distinguishes them from the two that were tested; the sound reading is that they are inherited by the
same mechanism. That is **inference from a confirmed mechanism, not observation**, and the record says so
rather than claiming four when two were measured. Testing them directly needs a proxy that actually
answers — a local listener, not `proxy.invalid` — which is a fair addition to the procedure but was out
of scope here.

**One more trap for whoever runs this next:** the story says to point `NODE_EXTRA_CA_CERTS` at "an empty
file". Claude Code reads that variable itself and an empty file makes it print

```
warn: ignoring extra certs from <path>, load failed: error:10000009:SSL routines:OPENSSL_internal:PEM routines
```

Harmless, but noisy and easy to misread as a failure. The run above used a valid self-signed PEM
(`openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=arc00-s20-dummy"`) and the warning
disappeared.

### The `${HTTPS_PROXY:-}` variant (story step 4)

`NOT RUN.` It needs `HTTPS_PROXY` in the `.mcp.json` `env` block with the shell variable unset — the same
`claude -p` technique can carry it, but the value it must produce (`set (len 0)`) is already established
independently: the stub's own self-test asserts that an inherited empty string reads `set (len 0)` and
not `unset`, and ARC-00-S01 recorded it.

### Ubuntu VM · Windows VM

`NOT RUN — awaiting the owner's claude login` · `DEFERRED — Windows VM pending (owner input #2)`.

## Verdict

`S-20: CONFIRMED on macOS — a project stdio server inherits the launching shell's environment (NO_PROXY and NODE_EXTRA_CA_CERTS both arrived at their exact lengths without appearing in .mcp.json env), and CLAUDE_PROJECT_DIR is set by Claude Code; HTTPS_PROXY/HTTP_PROXY follow by the same mechanism but were not measured directly, because an unreachable HTTPS_PROXY stops Claude Code reaching its own API`

**Consequence for ARC-06.** ARC-04-S11's interim recommendation was that ARC-06 forward the four
variables as `${VAR:-}` in `.mcp.json` `env`. On this evidence **that forwarding is not needed on
macOS** — inheritance already delivers them — and forwarding has a cost the empty-string sanitisation
exists to absorb. The safe reading until the Windows row is taken: **keep the forwarding as a Windows
contingency, not as a macOS requirement**, and decide it when ARC-00-S06's Windows half runs.
**ARC-08's E-26** can stop saying "as seen by this shell" for macOS: what the shell exports is what the
server sees.

## Evidence

- `spikes/stub-server/server.mjs` — `snow_probe_env_read`, names and lengths only.
- The `claude -p --mcp-config … --settings … --strict-mcp-config` technique above; three probe scripts and
  their logs are in the session scratchpad (not committed: they contain absolute scratch paths).
