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
# EVERY CASE, ISOLATED (ARC-09-C87). The prompts come from all of `tests/VALIDATION-TESTS.md` (T-01 to
# the last), and each session runs on the policy in `scripts/validation/session-policy.mjs`: the
# checkout's own settings and hooks only (`--setting-sources project`), no MCP server
# (`--strict-mcp-config`), a tool set that is a set (`--tools`, with `--allowedTools` for the few that
# would ask), and Sonnet 5.5 unless VALIDATION_MODEL says otherwise. The header prints the sha, the
# model, the setting sources and the tools; each turn prints the skills invoked, the corpus pages read
# and any cited page that does not exist (`scripts/validation/turn-report.mjs`).
#
# WHAT IT DOES NOT DO: judge. It produces sessions and counts what a reviewer used to count by hand; a
# person or a separate reviewer judges them against the spec's Pass criteria. A harness that scored its
# own runs would be marking its own work.
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

POLICY="node $ROOT/scripts/validation/session-policy.mjs"
MODEL="${VALIDATION_MODEL:-$($POLICY model)}"
SOURCES=$($POLICY sources)
$POLICY header "$TAG" "$(git rev-parse --short HEAD)" "$MODEL" "$(claude --version 2>/dev/null | head -1)" | tee "$RUN/header.txt"

# THE CORPUS AS A SUBMODULE, at the pin. The 2026-09-09 run COPIED it, and the copy made the doctor
# inside every session report E-12/E-13/E-14 — a corpus that is present but not a gitlink is not the
# state a user is in, and three checks said so in every transcript.
git submodule update --init --depth 1 vendor/ServiceNowDocs >/dev/null 2>&1 \
  || echo "note: submodule checkout failed — the corpus is not at the pin, and the doctor will say so"

./bootstrap.sh --mode design --yes --skip-claude-check --docs skip > "$RUN/bootstrap.out" 2>&1
echo "bootstrap exit=$?  settings.local.json: $(tr -d '\n ' < .claude/settings.local.json 2>/dev/null | cut -c1-60)"

ALL=$(node -e "console.log(require('$PROMPTS').map(t=>t.id).join(' '))")
SEL="${*:-$ALL}"

# WHICH SETUP RUNS, in the header (ARC-09-C106). A case's Setup used to be skipped without a word, so
# T-25's second turn looked for a file only its Setup creates and the run failed for the harness's reason.
# Design-only shell under clients/ is run in the clone before the case; the product's own install is
# already done by the bootstrap above; a Setup that needs an instance is NOT run and the case goes on as
# its dormant variant; anything the planner does not recognise stops its case.
echo "setup:" | tee -a "$RUN/header.txt"
node "$ROOT/scripts/validation/setup-plan.mjs" summary "$PROMPTS" $SEL | sed 's/^/  /' | tee -a "$RUN/header.txt"

for T in $SEL; do
  N=$(node -e "const t=require('$PROMPTS').find(x=>x.id==='$T');console.log(t?t.prompts.length:0)")
  [ "$N" = 0 ] && { echo "$T: no prompt in the spec"; continue; }
  R=1
  while [ "$R" -le "$REPEAT" ]; do
    # clients/ holds nothing tracked, so a case's state is whatever a Setup or a session put there. Clear
    # it first: the state a Setup builds belongs to its own case, and a session's own artefacts
    # (T-25 files its work under clients/_unfiled) must not be what the next case starts from.
    git -C "$C" clean -fdxq -- clients
    # The case's Setup, in the clone, before its first turn - on EVERY repeat, so each starts from the
    # state the Setup describes. A refused or failed Setup means the state the case needs was not
    # prepared: the case is not run, rather than failing for the harness's reason.
    node "$ROOT/scripts/validation/setup-plan.mjs" run "$PROMPTS" "$T" "$C" \
      || { echo "$T run$R: Setup did not run clean - case not run"; R=$((R+1)); continue; }
    # The tool set and the permissions come from the policy, one place a test reads (see the header).
    TOOLS=$($POLICY tools "$T")
    ALLOWED=$($POLICY allowed "$T")
    SID=""; i=0
    while [ "$i" -lt "$N" ]; do
      node -e "const t=require('$PROMPTS').find(x=>x.id==='$T');process.stdout.write(t.prompts[$i])" > "$RUN/prompt.txt"
      OUT="$RUN/sessions/$T-run$R-turn$((i+1)).jsonl"
      if [ -z "$SID" ]; then
        claude -p "$(cat "$RUN/prompt.txt")" --model "$MODEL" --setting-sources "$SOURCES" --strict-mcp-config --tools "$TOOLS" --allowedTools "$ALLOWED" --output-format stream-json --verbose > "$OUT" 2> "$OUT.err"
      else
        claude -p "$(cat "$RUN/prompt.txt")" --resume "$SID" --model "$MODEL" --setting-sources "$SOURCES" --strict-mcp-config --tools "$TOOLS" --allowedTools "$ALLOWED" --output-format stream-json --verbose > "$OUT" 2> "$OUT.err"
      fi
      RC=$?
      SID=$(node -e "const L=require('fs').readFileSync('$OUT','utf8').trim().split('\n');for(const l of L.reverse()){try{const j=JSON.parse(l);if(j.session_id){console.log(j.session_id);break}}catch{}}")
      echo "$T run$R turn$((i+1)): exit=$RC tool_use=$(grep -c '\"type\":\"tool_use\"' "$OUT") mcp=$(grep -c '\"name\":\"mcp__servicenow' "$OUT") tools=[$TOOLS] session=$(echo "$SID" | cut -c1-8) stderr=$(head -c 70 "$OUT.err" | tr '\n' ' ')"
      node "$ROOT/scripts/validation/turn-report.mjs" "$OUT" "$C" | sed 's/^/    /'
      i=$((i+1))
    done
    R=$((R+1))
  done
done
echo "== $(find "$RUN/sessions" -name '*.jsonl' | wc -l | tr -d ' ') session files under $RUN/sessions — judging is a separate step =="
