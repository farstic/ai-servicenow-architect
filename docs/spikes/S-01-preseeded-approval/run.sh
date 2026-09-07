#!/bin/sh
# spikes/S-01-preseeded-approval/run.sh — prepares ONE S-01 run and prints the manual checklist.
#
#   ./run.sh live      pre-seed {"enabledMcpjsonServers":["servicenow"]}
#   ./run.sh design    pre-seed {"disabledMcpjsonServers":["servicenow"]}
#   ./run.sh control   no toggle file at all (negative control)
#
# It creates a BRAND-NEW clone path every time. That is the only reliable reset: `claude mcp
# reset-project-choices` resets the MCP approval but not the folder's trust record, which lives in
# ~/.claude.json. This script NEVER writes to ~/.claude.json — it only greps it, read-only, to prove
# the path is new (the same rule the product itself follows).
#
# The dialog COUNT cannot be scripted; the checklist below is what a human runs and records.
#
# NOT INERT: `claude mcp get` / `claude mcp list` in step 6 rewrite exactly one top-level key in
# ~/.claude.json — `migrationVersion` (2.1.214 writes 13, 2.1.258 writes 14) — so alternating the two
# versions flips it on every switch. This script itself only greps the file; see the S-01 record.
#
# A Windows run.ps1 is NOT provided: `DEFERRED — Windows VM pending (owner input #2)`. Writing an
# untested PowerShell script would be worse than its absence; the checklist's Windows forms are noted
# inline instead.
set -e
VARIANT=${1:-live}
CLAUDE_BIN=${CLAUDE_BIN:-claude}
BASE=${BASE:-$HOME/spike-runs}
STAMP=$(date +%Y%m%d-%H%M%S)
DIR="$BASE/S-01-$VARIANT-$STAMP"

mkdir -p "$BASE"
git clone -q git@github.com:farstic/snowarch-spikes.git "$DIR"
cd "$DIR"

# Step 1 precheck — the path must be unknown to Claude Code. Read-only.
# grep -c prints 0 and exits 1 when there is no match; `|| true` keeps the 0 and drops the
# non-zero exit, instead of appending a second "0" from an `|| echo 0` fallback.
SEEN=$(grep -c "$DIR" "$HOME/.claude.json" 2>/dev/null || true)
SEEN=${SEEN:-0}
echo "precheck: grep -c '<path>' ~/.claude.json = $SEEN   (must be 0)"
[ "$SEEN" = "0" ] || { echo "ABORT: path already known to Claude Code"; exit 1; }

case "$VARIANT" in
  live)    mkdir -p .claude && printf '%s\n' '{"enabledMcpjsonServers":["servicenow"]}'  > .claude/settings.local.json ;;
  design)  mkdir -p .claude && printf '%s\n' '{"disabledMcpjsonServers":["servicenow"]}' > .claude/settings.local.json ;;
  control) : ;;
  *) echo "unknown variant: $VARIANT" >&2; exit 2 ;;
esac

if [ "$VARIANT" != "control" ]; then
  # Step 2 condition from `03` S-01: the file must be UNTRACKED.
  echo "gitignored check: git status --porcelain .claude/settings.local.json ->"
  git status --porcelain .claude/settings.local.json | sed 's/^/    [/;s/$/]/'
  echo "    (empty above = untracked and ignored, as the docs condition requires)"
fi

echo
echo "prepared: $DIR"
echo "variant : $VARIANT"
echo "binary  : $CLAUDE_BIN ($($CLAUDE_BIN --version))"
cat <<'CHECKLIST' | sed "s|@BIN@|$CLAUDE_BIN|g"

MANUAL CHECKLIST — dialogs cannot be scripted; count them by eye and record verbatim.

  1. cd into the prepared path above and start @BIN@ (the binary named above).
  2. COUNT EVERY MODAL until the prompt is usable. Expected:
       live    -> 1 (workspace trust only)      2 means S-01 FAILED
       design  -> 1 (workspace trust only), and no MCP approval
       control -> 2 (trust + the per-server approval) — this proves the prompt exists
     Screenshot each modal, cropped to the dialog.
  3. In the session: /mcp
       live    -> servicenow  connected, 5 tools
       design  -> servicenow  disabled, no prompt
  4. S-16, in the same live session: ask Claude to run  ./snowarch doctor --json
       expect 0 permission prompts (settings.json allows Bash(./snowarch doctor*));
       then ask it to run  ./snowarch version  -> expect 1 prompt (not allow-listed).
       Note whether the VERY FIRST Bash call after trust prompts.
  5. S-17, in the same live session: confirm /mcp lists exactly five tools, then ask
     Claude to call snow_core_capabilities_read -> expect no prompt and a text result.
  5b. S-17 negative control, in a NEW prepared path: export STUB_EXIT_ON_START=1 before
     starting the binary, then /mcp -> the panel must show servicenow FAILING. This proves
     the /mcp check can fail; without it a green panel proves nothing.
  6. Exit, then from the same path record verbatim:
       @BIN@ mcp get servicenow
       @BIN@ mcp list
       ps ax -o command= > /tmp/ps-snap.txt; grep -c 'spikes/stub-server/server\.mjs' /tmp/ps-snap.txt
         expect 0 in EVERY variant.
         # Do NOT count with the loose pattern '[s]erver.mjs': unrelated applications embed that
         # basename in their command lines and it reports a false-positive 1 on this machine
         # (see "Process measurement — and a correction" in this spike's README).
         # Snapshot to a file first so the grep cannot match its own command line.
         # Windows: (Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
         #           Where-Object CommandLine -match 'spikes[\\/]stub-server[\\/]server\.mjs').Count
  7. Paste all output into the record, redacted per the repository's rules.
CHECKLIST
