# ARC-02-S11 — `/snowarch` in a real session

**Run** 2026-09-09 · **CLI** 2.1.258 (Claude Code) · macOS · `claude -p --output-format json`
**Subject** `.claude/skills/snowarch/SKILL.md`, with `tests/fixtures/snowarch-doctor-stub.sh` copied
into a scratch checkout as `./snowarch`. The scratch tree held `CLAUDE.md`, `.claude/skills/snowarch/`,
`.claude/rules/` and the stub — nothing else, so nothing but the skill could supply the answers.

Two of the nine criteria failed on the first run and both failures were the file's fault, not the
session's. They are recorded below with what changed, because the fix is the point.

## Task 1 — `$ARGUMENTS` substitution: CONFIRMED

`/snowarch doctor` → the body sees `doctor`; no argument → `NONE`; `/snowarch setup-instance --resume`
→ `setup-instance`. One skill with three branches works on this CLI, so the three-skill fallback in
the story's risk (a) is **not** needed and was not applied.

## Criterion 2 — `/snowarch status` prints the stub's Mode line first

**PASS**, after a fix. First run answered `**Mode: live — …**` — the right line, bolded. The skill
said "verbatim as the first line", which a reader can satisfy while still decorating it. Rule 2 now
says the line stands alone with no bold, heading, fence or label; `CLAUDE.md` §2 carries the same
clause, since the plain-`Status` path reads §2 rather than the skill. Re-run:

```
Mode: live — instance=pdi (pdi) preset=pdi-developer — doctor 2026-09-08 41 ok
```

## Criterion 3 — the plain word `Status` produces the same line

**PASS.** Same line, first, undecorated. `CLAUDE.md` §2 routes it.

Worth recording: in the untrusted scratch workspace the CLI ignores the project's `permissions.allow`
entries, and the first `Status` run could not run the doctor at all. It answered
`**Mode: unverified** — the doctor did not run`, named the missing permission and read no further —
which is rule 5 behaving exactly as written, so the failure mode is the safe one. The criterion was
then verified with the tool granted explicitly (`--allowedTools 'Bash(./snowarch doctor:*)'`).
Trusting the workspace would mean editing `~/.claude.json`, which is out of bounds.

## Criterion 4 — the bootstrap-state fallback

**PASS, and the criterion's own wording was wrong.** With the launcher removed and
`.local/bootstrap-state.json` present, the session refused to print the story's expected line —
`doctor unavailable until Node 20+ is installed` — and said why: Node v24 was installed, so the
template blamed a cause that was not the cause. It was right. The rule now names the cause it
observed, from three: Node below 20, launcher absent, or the doctor ran and exited non-zero, with
"Never state a cause you did not check." Re-run:

```
Mode: design-only — from bootstrap state; doctor unavailable, the launcher is not installed — run ./bootstrap.sh (Windows: bootstrap.cmd)
```

**This changes the story text**, which still expects the old sentence in criterion 4.

## Criterion 5 — neither present

**PASS**, exactly as written:

```
Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)
```

## Criterion 6 — `setup-instance` hand-off

**PASS.** The session asked in plain chat for the label and URL only, said in the same breath that it
would not ask for a username, password, token or client secret, and printed the five-step block with
both substituted and the Windows `snowarch.cmd instance add …` line intact, ending with the literal
`/snowarch setup-instance --resume`. No `AskUserQuestion` was used at all, so the criterion's
"no `AskUserQuestion` mentioning password/secret/token" holds trivially. It closed with §2.1 and §2.2.

`grep -ci "password" .claude/skills/snowarch/SKILL.md` → **2**.

## Criterion 7 — `doctor` relays the summary

**PASS**, and it improved the fixture. Against the stub's failing mode the session pointed out that
the summary claimed two failures while the report printed no FAIL line — a contradiction it was right
to refuse to paper over. The stub now emits both FAIL lines with remedies, one marked fixable, and the
re-run relays each with its remedy verbatim.

## Criterion 8 — recorded

Task 1's result is above and in the pull request.

## Criterion 9 — Windows

**DEFERRED** to the owner's sitting; recorded in `docs/spikes/OWNER-SITTING.md` beside the other
Windows rows. The half a file can prove is done and permanent — `snowarch.cmd instance add …` is in
the hand-off and `tests/snowarch-skill.test.mjs` fails if it leaves. The half that needs the VM is
whether a Windows shell reaches the launcher, and before ARC-06 there is no launcher to reach.
