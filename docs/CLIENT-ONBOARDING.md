# Client onboarding

The ritual for taking on a new engagement. It exists because the confidentiality firewall is enforced by
folder discipline, not by the tool: everything for one client lives under `clients/<name>/`, and
`clients/` is gitignored, so nothing an engagement produces can reach the repository by accident.

Time: about 30 minutes, plus a first real task.

## 1 — Gather context

**Required.** Client short name (lowercase, hyphenated — it becomes the folder name). The ServiceNow
products in scope. The release family the client is on, if it differs from the vendored default. The
delivery model (waterfall, agile, hybrid) and who signs off.

**Strongly recommended.** Instance topology (which sub-production instances exist and what each is for).
Existing customisation posture — how much custom already exists, and whether the client knows it. The
named stakeholders and their roles. Any regulatory or data-residency constraint.

**Optional, added as discovered.** Naming conventions the client already uses. Their update-set and
release cadence. Known pain points that will shape which specialists you reach for.

## 2 — Create the working folder structure

```bash
mkdir -p clients/<name>/scripts/{script-includes,business-rules,client-scripts,scheduled-jobs}
mkdir -p clients/<name>/scripts/atf
mkdir -p clients/<name>/flows
mkdir -p clients/<name>/designs
mkdir -p clients/<name>/stories
mkdir -p clients/<name>/runbooks
mkdir -p clients/<name>/decisions
```

`clients/` is gitignored — these folders are local to your checkout. No `git add` is needed, or
possible. Keeping generated artefacts physically separated by client *is* the confidentiality
discipline: there is no interface-level firewall, so if you work in the wrong folder, nothing stops you.

`decisions/` is where architecture decision records go — every §1.1 ruling, approval or rejection alike,
per the delivery-governance rules. The traceability matrix lives alongside them at
`clients/<name>/traceability.md`, and the RAID log at `clients/<name>/raid-log.md`.

## 3 — Write the engagement context file

Create `clients/<name>/<name>-engagement-state.md` holding what you gathered in step 1, plus the
engagement defaults the architect should apply silently: release family, delivery model, naming
conventions, sign-off path. The Chief Architect reads this at Phase 1 Step 2 of every request, which is
how a request stops needing the same preamble every time.

## 4 — Connect the instance, if the engagement is live

```
/snowarch setup-instance
```

or `./snowarch instance add <label> …` (ARC-07). Credentials are stored per instance, outside the
repository. An engagement can stay design-only indefinitely — connecting is a choice, not a step.

## 5 — Smoke test

Ask for something small and domain-specific: a story for a requirement the client actually has, or a
question about a baseline process in one of their products. What you are checking is that the right
Domain Expert gateway fires without you naming it, that the engagement context was read, and that a
custom-object implication surfaces as an open question rather than a design.

## 6 — First real task

Take one genuine piece of work end to end — request, gateway, builder, post-build consults, artefact.
Confirm the §6.2 proposals appear and that the artefact lands under `clients/<name>/`. If a specialist
proposes a custom object, the answer is the open question, not the table.

## 7 — Client-specific specialists (rare)

Only when the client has a genuinely non-standard process that the roster mis-routes. Add the skill
under `.claude/skills/` with a name prefixed by the client short name, and record why in the
engagement's decision records. Prefer engagement context over a new specialist: a default recorded in
step 3 costs nothing to maintain.

## Maintenance

**After any major event** — a workshop, a refinement, a go-live — update the engagement context file
with what changed, and record any architectural decision as a decision record.

**Monthly.** Re-read the engagement context as if you were new to it. Anything stale, wrong, or no
longer true is a routing error waiting to happen.

## Troubleshooting

**The wrong specialist keeps firing.** The engagement context is probably silent on something the
architect is inferring. State it explicitly in step 3's file.

**Artefacts are landing in the repository root.** The output location was not passed on dispatch. Every
dispatch carries one; name `clients/<name>/…` explicitly.

**Work from two clients has mixed.** Stop. One session belongs to one engagement. Start a new session
for the other client rather than continuing.
