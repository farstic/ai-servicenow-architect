> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-19 — `claude plugin validate` on a headless CI runner

**Run by:** ARC-00-S12 · **Verdict consumed by:** ARC-01-S11, ARC-02-S02, ARC-05-S04

**Status: CONFIRMED on all three runners — no login, no TTY, and it discriminates.**

## Assumption

> `claude plugin validate` runs on a headless CI runner (no login, no TTY), so the skills/agents lint can call it in CI

**Impact if false:** L · **Evidence so far (from `03`):** Nothing in `docs:plugins` states a login requirement; never exercised headless (minor fold in `02`)

## Environment

| Field | Value |
|---|---|
| Runners | `ubuntu-22.04`, `macos-latest`, `windows-latest` |
| Claude Code | **2.1.263**, installed with `npm i -g @anthropic-ai/claude-code` in the job |
| Headless, proven in the job itself | `stdin is a TTY: no` · `stdout is a TTY: no` · `CI=true` · `no ~/.claude/.credentials.json — not logged in` |
| Workflow | `farstic/snowarch-spikes-marketplace` `.github/workflows/s19-validate.yml`, run `34049514442` |
| Date | 2026-09-06 |

## Procedure

**Check that retires it (from `03`):** Run it in a `ubuntu-latest` job after `npm i -g @anthropic-ai/claude-code` (ARC-00-S12).

Seven targets per runner — four that must pass, two that must fail, one minimal-but-valid control — so a
green matrix cannot be mistaken for `validate` doing nothing.

## Observed

| Runner | marketplace | plugin | `--strict` | skills dir | missing `name` | malformed JSON | minimal valid |
|---|---|---|---|---|---|---|---|
| ubuntu-22.04 | **0** | **0** | **0** | **0** | **1** | **1** | **0** |
| macos-latest | **0** | **0** | **0** | **0** | **1** | **1** | **0** |
| windows-latest | **0** | **0** | **0** | **0** | **1** | **1** | **0** |

### The stdout, verbatim (ubuntu-22.04 cell; the other two are identical bar the paths)

The story asks for it and `TEMPLATE.md` requires pasted output, not a summary:

```
Validating marketplace manifest: /home/runner/work/…/.claude-plugin/marketplace.json

✔ Validation passed
S19_EXIT_MARKETPLACE=0

Validating plugin manifest: /home/runner/work/…/plugins/architect-engine/.claude-plugin/plugin.json

✔ Validation passed
S19_EXIT_PLUGIN=0

Validating plugin manifest: …            # --strict, same target
✔ Validation passed
S19_EXIT_STRICT=0

✔ Validation passed                       # a skills-shaped directory: NO "Validating … manifest" line
S19_EXIT_SKILLSDIR=0

Validating plugin manifest: /home/runner/work/_temp/broken-noname/.claude-plugin/plugin.json

✘ Found 1 error:
  ❯ name: Invalid input: expected string, received undefined
✘ Validation failed
S19_EXIT_BROKEN=1
```

**One thing that output shows and the exit codes do not:** the skills-directory target prints **no
`Validating … manifest` line at all** — just a bare `✔ Validation passed`. A lint that greps for the
manifest line would see nothing; ARC-05 should key on the exit code, not on the text.

No runner asked for authentication, and none needed a TTY. `--strict` turns unknown-field *warnings*
into failures, which is what a lint wants. `{"name":"minimal"}` passes **with warnings** at exit 0 —
`name` is the only required field.

**Two things this record had to fix before the numbers meant anything**, both mine:

1. The first control was `{"name":"broken"}`, which is a **valid** manifest — so "must be non-zero"
   reported 0 and the matrix proved nothing. Replaced with a manifest missing `name` and a malformed
   JSON file, both verified locally first.
2. Even then the two failing controls reported **nothing**: GitHub's `shell: bash` runs `bash -e`, so a
   non-zero `validate` aborted the step before the `echo "…=$?"` line. `continue-on-error` kept the job
   alive but lost the value. Fixed with `cmd && ec=0 || ec=$?`, which tests the status and so does not
   trip `-e`. Five green cells and two blanks is not evidence; this is why the run was repeated twice.

## Verdict

`S-19: CONFIRMED — `claude plugin validate` runs on ubuntu-22.04, macos-latest and windows-latest with **no login and no TTY**: exit 0 on valid targets including `--strict` and a skills-shaped directory, exit 1 on a manifest missing `name` and on malformed JSON`

**`--strict` fails on *warnings*, and one of them is `author`.** A manifest with `name`, `version` and
`description` but no `author` passes plain validate (exit 0, "Validation passed with warnings") and
**fails `--strict`** (exit 1, `❯ author: No author information provided…`). So if ARC-05's lint runs in
`--strict` mode — and it should — **every product plugin manifest must carry `author`**, and ARC-01 should
add it when the manifests are first written. (Observed while the architect was reproducing S-14f: an
array-form `dependencies` probe failed `--strict` for exactly this reason and not for the dependencies
field.)

ARC-05's lint can call `claude plugin validate` in CI, and `--strict` is the mode to call it in. The
`03` fallback ("the lint runs `validate` locally only; the CI job stays advisory") is **not needed and
not adopted**. One caveat for ARC-01-S11: the runners installed Claude Code from **npm**, not the native
installer, and at 2.1.263 rather than the 2.1.214 floor — if the lint is pinned to the floor, that pair
should be re-checked (it is cheap: the same workflow with a version argument).

## Evidence

- `farstic/snowarch-spikes-marketplace` `.github/workflows/s19-validate.yml`, run `34049514442`.
- The two superseded runs, `34048606127` and `34048918678`, are the record of the two control bugs above.
