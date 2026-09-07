# Advanced Web Setup (Optional)

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Purpose:** Optional setup for running the engine as a Claude.ai Master Project in the browser — a second front-end to the same governance rules.
**Audience:** Anyone who prefers the browser, mobile, or a meeting-friendly working surface.
**Last updated:** 29 May 2026
**Time to complete:** 10 minutes
**This guide is optional.** The core engine runs entirely from the terminal — see [`INSTALLATION-GUIDE.md`](./INSTALLATION-GUIDE.md) for the standard 2-minute setup.

This guide covers the **optional** Claude.ai Master Project setup. Use it if you prefer the browser to the terminal, want to use the engine from your phone, or want a second working surface for quick consults during meetings.

The web setup is a **second front-end to the same engine**. It runs the same Chief Architect, the same Domain Experts, and the same governance rules — just delivered through the Claude.ai web app instead of Claude Code CLI.

> **Design-only surface.** The web Master Project does **not** include the NowAIKit MCP connection. It can design, route, review, and enforce §1.1 against `ServiceNowDocs/`, but it cannot read or write a live ServiceNow instance. Live §1.1 validation against the real schema and direct deployment (the §2.1 / §2.2 write gates) are **CLI-only** — see [`MCP-OPERATIONS-GUIDE.md`](./MCP-OPERATIONS-GUIDE.md).

---

## When to use which environment

| Use Claude Code (CLI) when… | Use Claude.ai Master Project when… |
|---|---|
| You're producing files (code, ATF suites, HLDs as Word docs) | You're consulting during a meeting and need quick answers |
| You need multi-builder sequences (Integration → Flow → Developer) | You're on mobile or tablet |
| You want git-friendly outputs | You want shareable conversation links for the team |
| You're working with a specific client engagement folder | You're doing greenfield design exploration |
| **You need to read or deploy to a live instance (MCP)** | You only need design, routing, and review |

You can run both. The governance behaviour is identical.

---

## What you'll do

1. Create a Claude.ai Master Project
2. Upload five skill packages (the five Domain Experts)
3. Paste the Chief Architect persona into Project Instructions
4. Verify the install with a `Status` check

---

## Step 1 — Create the Master Project

1. Open [claude.ai](https://claude.ai) in your browser. Pro or Team plan recommended.
2. Click **Projects** in the left sidebar → **+ Create Project**.
3. Name it: **`ServiceNow Architecture Engine — Master`** (or your team's preferred name).
4. Save.

---

## Step 2 — Prepare the five Domain Expert packages

Claude.ai's Skills uploader expects one ZIP per skill — one folder, two files (`SKILL.md` and `EXAMPLES.md`) inside each ZIP.

From your local clone of the repo (you already have it from [`INSTALLATION-GUIDE.md`](./INSTALLATION-GUIDE.md)):

```bash
cd /path/to/claude-servicenow-live

mkdir -p /tmp/claude-ai-uploads

for skill in itsm-specialist csm-specialist hrsd-specialist itom-discovery-specialist cmdb-csdm-specialist; do
  cd skills
  zip -r "/tmp/claude-ai-uploads/${skill}-v2.0.zip" "$skill/"
  cd ..
done

ls -lh /tmp/claude-ai-uploads/
```

You'll get five ZIPs, each around 15–25 KB:

```
cmdb-csdm-specialist-v2.0.zip
csm-specialist-v2.0.zip
hrsd-specialist-v2.0.zip
itom-discovery-specialist-v2.0.zip
itsm-specialist-v2.0.zip
```

> **Windows users:** if `zip` isn't available, you can right-click each skill folder in File Explorer and use *"Send to → Compressed (zipped) folder"*.

---

## Step 3 — Upload the skills to the Master Project

1. In your Master Project on Claude.ai, click the **Settings** gear icon (top right).
2. Select **Skills** in the left navigation panel.
3. Click **Add skill**.
4. Upload the first ZIP from `/tmp/claude-ai-uploads/`. Claude.ai validates the YAML frontmatter and shows a preview.
5. If a v1.0 version of the same skill already exists, choose **Replace**.
6. Repeat for the other four ZIPs.

When done, the Skills panel should list five entries, each tagged `version: 2.0.0`.

---

## Step 4 — Paste the Chief Architect persona

⚠️ **Not yet implemented — Steps 4–5 cannot be completed yet.** The Tier 1 Chief Architect persona file (`claude-ai-projects/master-project-instructions.md`) is **not shipped** in the repo. The web Master Project setup is therefore currently unavailable; use Tier 2 (Claude Code) per [`INSTALLATION-GUIDE.md`](./INSTALLATION-GUIDE.md). The steps below are retained as a placeholder for when that file is authored.

1. Open the Tier 1 master instructions file *(not yet shipped — see the warning above)*. **Select all** and **copy**.
2. In Claude.ai, open your Master Project → **Settings** → **Instructions**.
3. **Select all** existing text in the field and **delete**.
4. **Paste** the copied contents.
5. **Save**.

---

## Step 5 — Verify the install

1. Open a **new chat** inside the Master Project (skill loading happens per-chat — existing chats won't pick up the new configuration).
2. Type `Status` and send.

You should see the Chief Architect roster listing all five Domain Expert gateways with `v2.0` labels.

3. Run the canonical Verdict C test:

> *Design a separate escalation log table for CSM cases with escalation timestamps, the responsible agent, escalation tier, and resolution notes per escalation event. Show me the table model. Australia release.*

Expected: the **CSM Specialist** fires, produces a 5-Part Constraint Envelope, returns **Verdict C** (no baseline construct covers a structured per-event log), surfaces an OPEN QUESTION with four evaluated paths, and **stops**. No table model is produced until you reply with an explicit decision.

If this behaviour matches, your web setup is healthy.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Skill upload rejected with YAML error | The skill ZIP is malformed. Re-zip from the original folder using the commands in Step 2. |
| `Status` shows fewer than 5 Domain Experts | One or more skill uploads silently failed. Re-open the Skills panel and confirm all five are listed with `v2.0`. |
| CSM test produces a table model in the same turn as the OPEN QUESTION | Project Instructions paste was incomplete. Re-do Step 4 with a fresh copy of `claude-ai-projects/master-project-instructions.md` *(when shipped)*. |
| Conversations seem to forget governance rules mid-chat | Project Instructions are loaded per-chat. Make sure you're in the Master Project (not a free chat). |

---

## Keeping the web setup in sync

When the engine releases a new version (e.g. v2.4):

1. `git pull --recurse-submodules` in your local clone.
2. Repeat Step 2 to regenerate the four skill ZIPs.
3. Repeat Step 3 — Claude.ai will offer **Replace** for the existing v2.0 skills. Choose it.
4. Re-copy `claude-ai-projects/master-project-instructions.md` *(when shipped)* and repeat Step 4.
5. Verify with Step 5.

The CLI install updates with one `git pull`. The web install requires this manual re-sync.

---

*Documents the optional web setup for the [Claude ServiceNow Architecture Engine](https://github.com/farstic/claude-servicenow-live) v2.6.*
