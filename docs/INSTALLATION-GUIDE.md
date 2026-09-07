# Installation Guide

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Purpose:** Plug-and-play setup for the engine in Claude Code — plus the optional NowAIKit MCP step for connecting to a live ServiceNow instance.
**Audience:** First-time users
**Last updated:** 4 September 2026
**Time to complete:** 3 minutes (core) · +3 minutes (optional live-instance connection)
**You will need:** Node.js **20 or newer** (the MCP server declares `engines.node >= 20`, and `doctor.sh` enforces 20), Git, and either a Claude Pro/Max subscription or an Anthropic Console account. For live-instance work: a ServiceNow instance (a PDI is fine) and the NowAIKit MCP server.

This is the plug-and-play setup: install, authenticate, clone, activate the hooks, run. Once the repo is cloned, `bash scripts/setup.sh` does the wiring of Step 3 for you — submodule, hooks and local settings — and `bash scripts/doctor.sh` tells you at any point whether the result is healthy.

> **Prefer the browser instead of a terminal?** See [`ADVANCED-WEB-SETUP.md`](./ADVANCED-WEB-SETUP.md) for the optional Claude.ai web setup. Note that live-instance deployment is CLI-only.

---

## Step 1 — Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

If you don't have Node.js, install it from [nodejs.org](https://nodejs.org) first — take the current LTS, which satisfies the version 20 floor. Check with `node --version`.

Then authenticate. There are two routes — pick **one**.

**Route A — Claude Pro or Max subscription (recommended, and the default for this audience):**

```bash
claude auth login
```

This opens a browser, signs you in on your subscription, and stores the credential for you. Nothing to export, nothing to persist by hand. Confirm it took with `claude auth status` — expect `"authMethod": "claude.ai"` and your `subscriptionType`.

> **The subcommand matters.** It is `claude auth login`, not `claude login`. `claude login` is **not** a command: `login` is parsed as a *prompt*, so it silently opens an interactive session that asks the model the word "login" and authenticates nothing. There is no error message — you simply are not signed in.

**Route B — API billing (only if you do not have a Pro/Max subscription):** use the built-in console route rather than an exported key:

```bash
claude auth login --console
```

This bills to Anthropic Console API usage. If you must use a raw key instead, generate one at [console.anthropic.com](https://console.anthropic.com) and set `ANTHROPIC_API_KEY` in your environment — but prefer `--console`, which stores the credential the same way Route A does instead of leaving a secret in your shell profile.

> **Do not do both.** An exported `ANTHROPIC_API_KEY` **overrides** the subscription: if you are on Pro or Max and you export it, every token the engine spends is billed to your metered API account instead of your subscription — and if you add that `export` line to `~/.zshrc` or `~/.bashrc`, it keeps doing so silently in every future shell. On a subscription, use `claude auth login` and leave the key unset. `claude auth status` tells you which route is actually live.

---

## Step 2 — Clone the repository

```bash
git clone --recurse-submodules https://github.com/farstic/claude-servicenow-live
cd claude-servicenow-live
```

The `--recurse-submodules` flag matters — it pulls the `ServiceNowDocs/` reference branch the engine uses to validate every ServiceNow claim it makes. Skip the flag and the engine will work, but won't be able to cite primary sources.

If you forgot the flag:

```bash
git submodule update --init --recursive
```

---

## Step 3 — Activate the governance hooks

```bash
git config core.hooksPath .githooks
```

This switches on the pre-commit gates — `.claude/` mirror sync, structural integrity, and citation verification. `core.hooksPath` is a **local** git config value that `git clone` does not carry, so until you run this line every governance gate in the repo is silently inert: commits pass because nothing is checking them. `bash scripts/setup.sh` runs this for you; run it by hand if you are setting up manually.

`scripts/setup.sh` can also generate a local `.claude/settings.json` from the shipped `.claude/settings.example.json` template. That file holds machine-specific absolute paths, so it is gitignored and generated locally rather than shipped. It is **optional** — the engine runs fully without it. The template wires the [context-mode](https://www.npmjs.com/package/context-mode) hooks, which keep large command output from flooding the context window; if you want them, `npm install -g context-mode` first, because a settings file whose hooks point at a package you have not installed makes every tool call fire a failing hook.

---

## Step 4 — Run it

```bash
claude
```

You'll see the Claude Code prompt. Type `Status` and press Enter.

The engine reports its working scope, release family, specialist roster and drift check. Check the response against these three criteria:

- **The response opens with a `Mode:` line** — the engine is required to quote it verbatim from `scripts/doctor.sh` before anything else. With no instance connected it should say design-only (Tier 0); that is the correct, healthy answer, not a failure. If the engine instead *infers* a mode, or reports it as unverified, the doctor script is not runnable from where you launched — relaunch from the repo root.
- **The roster lists all five Domain Expert gateways** — ITSM, CSM, HRSD, ITOM/Discovery, and CMDB & CSDM. Fewer than five means the roster did not load.
- **`bash scripts/doctor.sh` reports `0 fail`.** Run it from the repo root. It checks the host toolchain, the engine's own integrity, and the MCP layer if one is configured, and prints a named remedy for anything it finds.

All three green — setup complete.

---

## Verify it works

Paste this prompt into Claude Code:

> *We need to track the source channel of each ITSM incident — phone, email, portal, walk-up, chat, system-generated. Currently this distinction doesn't appear in our reports. How do we design this? Australia release.*

The engine should respond with the **ITSM Specialist** taking the lead, identifying `incident.contact_type` as the existing baseline answer, and recommending you configure the existing field rather than create a new one. No code, no custom table — just the right answer.

If you see that response, your install is healthy.

---

## Optional — connect to a live ServiceNow instance (NowAIKit MCP)

The core engine above is **design-only** ("Tier 0") and needs no instance — that is a complete, supported end state, not a degraded one. To let the engine *read and write a live instance*, add the NowAIKit MCP server. This is what powers live §1.1 validation against the real schema and direct deployment of approved artefacts.

1. Register the server: `bash scripts/setup.sh --mcp`. It prompts for the instance URL and credentials, backs up your Claude Code config before touching it, and never writes a credential into this repository.
2. Verify it: `bash scripts/doctor.sh`. It confirms the server is reachable, authenticated, and that the capability flags your work needs are actually switched on.
3. For the flag→capability reference see [`SETUP.md` § Capability flags](../SETUP.md#capability-flags); for the error-string catalogue see [§ Troubleshooting](../SETUP.md#troubleshooting).

This guide deliberately no longer transcribes the environment block — a hand-copied one drifts from the server's actual contract, and the previous version of this section prescribed a configuration that could not authenticate at all. `SETUP.md` is the single source of truth for it.

**Before you rely on this for writes, read [`MCP-OPERATIONS-GUIDE.md`](./MCP-OPERATIONS-GUIDE.md).** Every write is governed by two gates — §2.1 write approval and §2.2 Update Set capture — and the running list of confirmed MCP behaviours is in [`nowaikit-field-notes.md`](./nowaikit-field-notes.md).

> **Security:** instance URLs, credentials, and sys_ids must never be committed. Two different files hold them, and only one is covered by `.gitignore`:
> - `.mcp.json` — lives in the repo and **is** gitignored, along with `.claude/settings*.json` and `clients/`.
> - `~/.claude.json` — your Claude Code config. It lives **outside the repo entirely**, so `.gitignore` does not apply to it, and a basic-auth MCP registration stores the ServiceNow password there **in plaintext**. Never paste its contents into an issue, a transcript, or a screen share. See [`SETUP.md` § Security](../SETUP.md#security) for how to keep it out of harm's way and for the OAuth alternative, which avoids storing a password at all.

---

## What's next

- **First time using the engine?** Read [`USER-GUIDE-AND-EXAMPLES.md`](./USER-GUIDE-AND-EXAMPLES.md) for three worked scenarios.
- **Want the team context?** Read [`BUSINESS-OVERVIEW.md`](./BUSINESS-OVERVIEW.md).
- **Want to extend the engine?** Read [`TECHNICAL-ARCHITECTURE.md`](./TECHNICAL-ARCHITECTURE.md).
- **Connecting to a live instance?** [`SETUP.md`](../SETUP.md) is the canonical install and MCP configuration reference; [`MCP-OPERATIONS-GUIDE.md`](./MCP-OPERATIONS-GUIDE.md) covers operating it once connected.
- **Prefer the browser?** See [`ADVANCED-WEB-SETUP.md`](./ADVANCED-WEB-SETUP.md).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| **Anything not listed below, or you are not sure what is wrong** | Run `bash scripts/doctor.sh`. It checks the host toolchain, the engine, and the MCP layer, and prints a remedy for every failure. Start here. |
| `command not found: claude` | `npm install -g @anthropic-ai/claude-code` did not complete. Re-run and check for permission errors. On macOS/Linux you may need `sudo`. |
| `Status` shows fewer than 5 Domain Experts | Quit Claude Code (`/exit` or Ctrl+D) and relaunch from the repo root. The session may have cached an empty roster. |
| `ServiceNowDocs/` references fail | You cloned without submodules. Run `git submodule update --init --recursive`. |
| Authentication errors | Run `claude auth status` first — it prints which route is actually live. If it reports you are not logged in, run `claude auth login` (Pro/Max subscription) **or** `claude auth login --console` (API billing) — see Step 1. Pick one; do not also export `ANTHROPIC_API_KEY`, which silently overrides the subscription. |
| `claude login` appeared to hang or started a chat | `login` is not a subcommand — it was taken as a prompt, so you opened a session instead of signing in. Press Ctrl+C and run `claude auth login`. |
| Commits pass but nothing is verified | The governance hooks were never activated. Run `git config core.hooksPath .githooks` — see Step 3. |
| A `snow_*` tool fails mid-task (`SCRIPTING_NOT_ENABLED` and its siblings), or the MCP server does not appear at all | See [`SETUP.md` § Troubleshooting](../SETUP.md#troubleshooting) for the full MCP error-string catalogue. It is not duplicated here — a second copy is exactly what let this guide drift out of agreement with reality. |

---

*Documents the [Claude ServiceNow Architecture Engine](https://github.com/farstic/claude-servicenow-live) v2.8.0 install.*
