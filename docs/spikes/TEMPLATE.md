<!-- Spike-record template (ARC-00-S01). Copy this file to spikes/S-NN-<slug>/README.md and fill it in.
     Keep the six section headings and the single verdict line exactly as they are. -->

> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-NN — <title>

**Run by:** ARC-00-SNN · **Verdict consumed by:** <stories from `03` §E>

## Assumption

> <quoted verbatim from `03-RISKS-AND-UNKNOWNS.md` §A / §B — do not paraphrase>

**Impact if false:** <H | M | L, from `03`> · **Evidence so far:** <the `03` column, quoted>

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | <macOS 26.5.2 (25F84) arm64 · snapshot or recipe> |
| Claude Code | <`claude --version` output; and `claude-2.1.214 --version` where the floor is exercised> |
| Node | <`node --version`> |
| git | <`git --version`> |
| Shell | <zsh 5.9 / PowerShell 5.1 / cmd> |
| Date | <YYYY-MM-DD> |

## Procedure

**Check that retires it (from `03`):** <quoted>

```
<the exact commands, in order — or point to run.sh / run.ps1 next to this file>
```

## Observed

<!-- One block per OS. Paste real output, redacted per the rules above. Never paraphrase output. -->

### macOS

```
<output>
```

## Verdict

`S-NN: CONFIRMED` — or — `S-NN: FAILED → fallback <the pre-recorded fallback sentence from 03>`

<one paragraph: what the observation means for the design, and which story consumes it>

## Evidence

- `logs/<file>` — <what it is>
