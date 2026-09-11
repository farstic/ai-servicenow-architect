<!-- The run record for ARC-07-S11's live suite. Copy to
     `docs/validation/<date>-e2e-live-<os>.md` and fill it in after a run.

     NO INSTANCE URL AND NO ACCOUNT NAME. Whose PDI this was is not a product fact (the Q-A persona
     rule), and this file is committed. The suite's own redactor already replaces both in any
     transcript it writes; this template exists so the prose does not reintroduce them. -->

# Live E2E — <date> — <macos | ubuntu | windows>

**Build under test:** `arc-07/wizard` @ `<sha>` · **Claude Code / Node:** `<node -v>`
**Instance:** a PDI (URL deliberately not recorded) · **Gate:** `RUN_LIVE_E2E=1`
**Writes allowed:** `SNOW_E2E_ALLOW_WRITES` <set | unset>

| Case | Result | What it proved, or why it was skipped |
|---|---|---|
| 1 — happy path (pty) | | exit 0 · the `Saved instance …` line · nothing echoed · nothing in `ps` |
| 2 — happy path (stdin) | | exit 0 · no secret in the output |
| 3 — three failures | | exit 1 · no store written · `locked_out` = `false` afterwards |
| 4 — production cap | | exit 3 raised · saved read-only · `--ack-prod` set `prodWriteAck` |
| 5 — ROPC | | skipped without the OAuth pair; the property write needs `SNOW_E2E_ALLOW_WRITES=1` |
| 6 — maintenance | | `test` · `list` · `list --json` · `set-default` · `remove`, no secret printed |
| 7 — import | | `/api` stripped · advice printed · the legacy file still there |
| 8 — sleeping PDI | | manual: which code a hibernated instance produced |

**The two variable probe results** (an instance without the licence is not a failing test):
`nowAssist = <ok | not licensed>` · `fluent = <ok | not installed>`

**`script(1)` on this runner:** `<the version line the workflow printed>`

**Anything that surprised the runner** — a prompt in a different order, a timing that needed longer
than the case allowed, a message whose wording has drifted from the story:

- <one line each, or "nothing">

**Case 8, if it was observed:** the code a hibernated PDI produced, and how long it took to answer:

- <code> — <observation>
