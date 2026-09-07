#!/bin/sh
# spikes/S-18-permissions-ask-auto-mode/run.sh — prepares ONE S-05 run (S-18 and S-12 share a session)
# and prints the checklist. The observations themselves are interactive; this script only sets the stage.
#
#   ./run.sh            prepare with the committed settings (glob + ask rule present)
#   ./run.sh no-ask     the S-18 bypass control: the `ask` entry removed
#   ./run.sh trailing   the S-12 control: the middle-wildcard glob replaced by a trailing one
#
# STUB_CONFIGURED=1 is exported into the prepared path's .claude/settings.local.json `env` block, so the
# stub advertises set B (eight tools) and `snow_core_record_add` exists to be called.
set -e
VARIANT=${1:-default}
CLAUDE_BIN=${CLAUDE_BIN:-claude}
BASE=${BASE:-$HOME/spike-runs}
DIR="$BASE/S-05-$VARIANT-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BASE"
git clone -q git@github.com:farstic/snowarch-spikes.git "$DIR"
cd "$DIR"

SEEN=$(grep -c "$DIR" "$HOME/.claude.json" 2>/dev/null || true); SEEN=${SEEN:-0}
echo "precheck: grep -c '<path>' ~/.claude.json = $SEEN   (must be 0)"
[ "$SEEN" = "0" ] || { echo "ABORT: path already known to Claude Code"; exit 1; }

mkdir -p .claude
# enabledMcpjsonServers pre-seeds the approval (S-01); env.STUB_CONFIGURED=1 gives us set B.
printf '%s\n' '{"enabledMcpjsonServers":["servicenow"],"env":{"STUB_CONFIGURED":"1"}}' > .claude/settings.local.json

case "$VARIANT" in
  default) : ;;
  no-ask)   python3 - <<'PY'
import json,pathlib
p=pathlib.Path('.claude/settings.json'); j=json.loads(p.read_text())
j['permissions'].pop('ask', None)
p.write_text(json.dumps(j,indent=2)+"\n"); print("  control: the `ask` block has been REMOVED from .claude/settings.json")
PY
;;
  trailing) python3 - <<'PY'
import json,pathlib
p=pathlib.Path('.claude/settings.json'); j=json.loads(p.read_text())
a=j['permissions']['allow']
j['permissions']['allow']=[('mcp__servicenow__snow_core_*' if x=='mcp__servicenow__snow_*_read' else x) for x in a]
p.write_text(json.dumps(j,indent=2)+"\n"); print("  control: the middle-wildcard glob replaced by trailing `mcp__servicenow__snow_core_*`")
PY
;;
  *) echo "unknown variant: $VARIANT" >&2; exit 2 ;;
esac

echo
echo "prepared: $DIR"
echo "variant : $VARIANT"
echo "binary  : $CLAUDE_BIN ($($CLAUDE_BIN --version))"
cat <<'CHECKLIST'

MANUAL CHECKLIST — the prompts cannot be scripted.

  Auto mode is selected by FLAG, not a key sequence:
      claude --permission-mode auto
  The full choice list on this build is: acceptEdits | auto | bypassPermissions | manual | dontAsk | plan

  S-18  (variant `default`), once per mode in {auto, default, plan}:
    1. Ask Claude to create a record with `snow_core_record_add` on table incident.
       EXPECT a permission prompt NAMING mcp__servicenow__snow_core_record_add. Screenshot it. Decline.
       The stub answers `stub: would create record` if it ran, so the text is unambiguous.
    2. Ask Claude to call `snow_core_capabilities_read`.  EXPECT no prompt.
    3. Record the account plan (auto mode is plan-dependent).

  S-18 control (variant `no-ask`), auto mode only:
    4. Repeat step 1. If NO prompt appears, that is the hazard the ask block exists for —
       the expected demonstration of the risk, not a failure of the spike.

  S-12  (variant `default`):
    5. Call `snow_core_capabilities_read`   -> EXPECT no prompt (matches snow_*_read)
    6. Call `snow_core_records_query`       -> EXPECT a prompt (matches no allow rule)

  S-12 control (variant `trailing`):
    7. Call BOTH of the above -> EXPECT no prompt for either. This proves globs work at all
       and isolates the middle-wildcard question.

  Run the whole set on BOTH binaries — but one binary per sitting (S-21).
CHECKLIST
