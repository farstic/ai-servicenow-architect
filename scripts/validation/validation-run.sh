#!/bin/sh
# ARC-02-S13 / ARC-10 acceptance (B02-06) — the design-only validation run, as a command.
#
# Reconstructed from `docs/spikes/validation-runs/2026-09-09-design-only.md`, which recorded a run
# whose harness was never committed: "One fresh headless session per test (`claude -p
# --output-format json`), 18 sessions in all". Repeating that meant rebuilding it from prose, which
# is why this exists — the next run is a command, not a reconstruction.
#
# WHAT IT DOES: a fresh --depth 1 clone of <tag> into a folder the CLI has never trusted, the corpus
# checked out AS THE SUBMODULE AT THE PIN, the real bootstrap in design mode (so
# `.claude/settings.local.json` comes from the product rather than by hand), then one fresh session
# per test with the prompts read from `tests/VALIDATION-TESTS.md`.
#
# WHAT IT DOES NOT DO: judge. It produces sessions; a person or a separate reviewer judges them
# against the spec's Pass criteria. A harness that scored its own runs would be marking its own work.
#
# Usage: validation-run.sh <tag> [--repeat N] [T-NN ...]
set -u
TAG="${1:?usage: validation-run.sh <tag> [--repeat N] [T-NN ...]}"; shift
REPEAT=1
case "${1:-}" in --repeat) REPEAT="${2:?--repeat needs a count}"; shift 2 ;; esac

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RUN="${VALIDATION_RUN_DIR:-${TMPDIR:-/tmp}/validation-run-$TAG}"
rm -rf "$RUN"; mkdir -p "$RUN/sessions"
# Scratch NEVER goes inside the checkout under test: a file this script writes there would be a
# difference between the tree the run exercises and the tree the tag names.
PROMPTS="$RUN/prompts.json"

node "$ROOT/scripts/validation/extract-validation-prompts.mjs" "$ROOT/tests/VALIDATION-TESTS.md" "$PROMPTS" || exit 9

C="$RUN/clone"
git clone -q --depth 1 --branch "$TAG" --no-local "$ROOT" "$C" || { echo "clone failed"; exit 9; }
cd "$C" || exit 9
echo "clone: $(git describe --tags --always) $(git rev-parse --short HEAD)"

# THE CORPUS AS A SUBMODULE, at the pin. The 2026-09-09 run COPIED it, and the copy made the doctor
# inside every session report E-12/E-13/E-14 — a corpus that is present but not a gitlink is not the
# state a user is in, and three checks said so in every transcript.
git submodule update --init --depth 1 vendor/ServiceNowDocs >/dev/null 2>&1 \
  || echo "note: submodule checkout failed — the corpus is not at the pin, and the doctor will say so"

./bootstrap.sh --mode design --yes --skip-claude-check --docs skip > "$RUN/bootstrap.out" 2>&1
echo "bootstrap exit=$?  settings.local.json: $(tr -d '\n ' < .claude/settings.local.json 2>/dev/null | cut -c1-60)"

ALL=$(node -e "console.log(require('$PROMPTS').map(t=>t.id).join(' '))")
SEL="${*:-$ALL}"

for T in $SEL; do
  N=$(node -e "const t=require('$PROMPTS').find(x=>x.id==='$T');console.log(t?t.prompts.length:0)")
  [ "$N" = 0 ] && { echo "$T: no prompt in the spec"; continue; }
  R=1
  while [ "$R" -le "$REPEAT" ]; do
    # `Skill` is granted by default: without it `Skill snowarch status` errors in an untrusted
    # headless session and the engine recovers by running the doctor itself — which is the engine
    # being resourceful about a harness limitation, not the behaviour under test.
    TOOLS="Read,Grep,Glob,Skill"
    case "$T" in
      T-07) TOOLS="$TOOLS,Bash(./snowarch:*),Bash(./snowarch doctor:*)" ;;
      T-13) TOOLS="$TOOLS,Write" ;;
    esac
    SID=""; i=0
    while [ "$i" -lt "$N" ]; do
      node -e "const t=require('$PROMPTS').find(x=>x.id==='$T');process.stdout.write(t.prompts[$i])" > "$RUN/prompt.txt"
      OUT="$RUN/sessions/$T-run$R-turn$((i+1)).jsonl"
      if [ -z "$SID" ]; then
        claude -p "$(cat "$RUN/prompt.txt")" --output-format stream-json --verbose --allowedTools "$TOOLS" > "$OUT" 2> "$OUT.err"
      else
        claude -p "$(cat "$RUN/prompt.txt")" --resume "$SID" --output-format stream-json --verbose --allowedTools "$TOOLS" > "$OUT" 2> "$OUT.err"
      fi
      RC=$?
      SID=$(node -e "const L=require('fs').readFileSync('$OUT','utf8').trim().split('\n');for(const l of L.reverse()){try{const j=JSON.parse(l);if(j.session_id){console.log(j.session_id);break}}catch{}}")
      echo "$T run$R turn$((i+1)): exit=$RC tool_use=$(grep -c '\"type\":\"tool_use\"' "$OUT") mcp=$(grep -c '\"name\":\"mcp__servicenow' "$OUT") tools=[$TOOLS] session=$(echo "$SID" | cut -c1-8) stderr=$(head -c 70 "$OUT.err" | tr '\n' ' ')"
      i=$((i+1))
    done
    R=$((R+1))
  done
done
echo "== $(find "$RUN/sessions" -name '*.jsonl' | wc -l | tr -d ' ') session files under $RUN/sessions — judging is a separate step =="
