#!/usr/bin/env bash
# doctor.sh
#
# Environment audit for the ServiceNow Architecture Engine. Answers the one
# question nothing else in this repo answers — "is my setup correct?" — BEFORE
# work starts, so that a deferred, mid-task MCP failure (SCRIPTING_NOT_ENABLED
# and its five siblings, an unbuilt server, a silently truncated query, a
# silently inverted sort) becomes a startup failure with a named remedy.
#   1. Host toolchain      — claude CLI, node, npm, git, optional renderers
#   2. Engine integrity    — roster, structure audit, hooks, submodule, citations
#   3. MCP layer           — registration, entrypoint, tier flags, live probes
#
# READ-ONLY. Every remedy is printed, never applied; scripts/setup.sh is the
# only writer. No credential value is ever echoed — secrets report as "set (len N)".
# No MCP server registered is a fully supported mode (Tier 0), never an error.
#
# Exit 0: no FAILs (WARNs are allowed). Exit 1: one or more FAILs.
# Exit 3: required host tooling missing — the audit could not be run at all.
#
# Usage: bash scripts/doctor.sh [--tier0] [--no-network] [--json]

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TIER0=0
NO_NETWORK=0
JSON=0

usage() {
  echo "Usage: bash scripts/doctor.sh [--tier0] [--no-network] [--json]"
  echo "  --tier0        skip the MCP section entirely (design-only mode)"
  echo "  --no-network   run the MCP section but skip every live instance probe"
  echo "  --json         one JSON object per check on stdout, then a summary object"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier0)      TIER0=1 ;;
    --no-network) NO_NETWORK=1 ;;
    --json)       JSON=1 ;;
    -h|--help)    usage; exit 0 ;;
    *)            echo "Unknown flag: $1" >&2; usage >&2; exit 1 ;;
  esac
  shift
done

oks=0
warns=0
fails=0
missing_bin=0
CHECK_ID="D00"
MODE_LINE="design-only (no MCP)"

# ─── output helpers ───────────────────────────────────────────────────────────
# In --json mode a record is buffered rather than printed immediately, so that a
# following hint() can be folded into its msg. This keeps the emitted shape at
# exactly {"id","status","msg"} while never losing a remedy.
pending_id=""
pending_status=""
pending_msg=""

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n\t' '  '
}

flush_pending() {
  [[ -z "$pending_status" ]] && return 0
  printf '{"id":"%s","status":"%s","msg":"%s"}\n' \
    "$pending_id" "$pending_status" "$(json_escape "$pending_msg")"
  pending_status=""
  pending_msg=""
}

# last_stream tracks where the record a hint() belongs to was written, so that a
# FAIL (stderr, house style) and its remedy never end up on different streams —
# `doctor.sh > report.txt` would otherwise drop every FAIL and keep orphan hints.
last_stream=1

ok()   { if [[ $JSON -eq 1 ]]; then flush_pending; pending_id="$CHECK_ID"; pending_status="ok";   pending_msg="$*"; else echo "OK: $*";       fi; last_stream=1; oks=$((oks + 1)); }
warn() { if [[ $JSON -eq 1 ]]; then flush_pending; pending_id="$CHECK_ID"; pending_status="warn"; pending_msg="$*"; else echo "WARN: $*";     fi; last_stream=1; warns=$((warns + 1)); }
fail() { if [[ $JSON -eq 1 ]]; then flush_pending; pending_id="$CHECK_ID"; pending_status="fail"; pending_msg="$*"; else echo "FAIL: $*" >&2; fi; last_stream=2; fails=$((fails + 1)); }
skip() { if [[ $JSON -eq 1 ]]; then flush_pending; pending_id="$CHECK_ID"; pending_status="skip"; pending_msg="$*"; else echo "SKIP: $*";     fi; last_stream=1; }

hint() {
  if [[ $JSON -eq 1 ]]; then
    pending_msg="$pending_msg — hint: $*"
  elif [[ $last_stream -eq 2 ]]; then
    echo "      hint: $*" >&2
  else
    echo "      hint: $*"
  fi
}

section() { [[ $JSON -eq 0 ]] && { echo; echo "== $* =="; }; return 0; }

verdict() {
  flush_pending
  local status="ok"
  [[ $fails -gt 0 ]] && status="fail"
  if [[ $JSON -eq 1 ]]; then
    printf '{"id":"SUMMARY","status":"%s","ok":%d,"warn":%d,"fail":%d,"mode":"%s"}\n' \
      "$status" "$oks" "$warns" "$fails" "$(json_escape "$MODE_LINE")"
  else
    echo
    echo "DOCTOR: $oks ok, $warns warn, $fails fail"
    echo "Mode: $MODE_LINE"
  fi
  [[ $fails -gt 0 ]] && exit 1
  exit 0
}

# portable file mode (BSD stat first, GNU stat fallback).
# NOTE: on GNU coreutils `stat -f` means --file-system and '%Lp' is read as a
# FILE operand, so the BSD form both errors AND prints filesystem junk on stdout.
# The result is therefore validated as pure octal before it is accepted.
file_mode() {
  local m
  m="$(stat -f '%Lp' "$1" 2>/dev/null)" || m=""
  case "$m" in
    ''|*[!0-7]*|*' '*) m="$(stat -c '%a' "$1" 2>/dev/null)" || m="" ;;
  esac
  case "$m" in
    ''|*[!0-7]*|*' '*) m="" ;;
  esac
  printf '%s' "$m"
}

# ══════════════════════════════════════════════════════════════════════════════
section "Host toolchain"

CHECK_ID="D01"
if command -v claude >/dev/null 2>&1; then
  ok "claude $(claude --version 2>/dev/null | head -1)"
else
  fail "claude CLI not found on PATH."
  hint "npm install -g @anthropic-ai/claude-code"
  missing_bin=1
fi

CHECK_ID="D02"
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
  case "$node_major" in
    ''|*[!0-9]*) node_major=0 ;;
  esac
  if [[ $node_major -lt 20 ]]; then
    fail "node v$(node -v 2>/dev/null) — the servicenow-mcp server declares engines.node >=20.0.0."
    hint "nvm install 20"
  else
    ok "node $(node -v 2>/dev/null)"
  fi
else
  fail "node not found on PATH — the servicenow-mcp server declares engines.node >=20.0.0."
  hint "nvm install 20"
  missing_bin=1
fi

CHECK_ID="D03"
if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm -v 2>/dev/null)"
else
  fail "npm not found on PATH."
  hint "reinstall Node.js (npm ships with it) — https://nodejs.org or 'nvm install 20'"
  missing_bin=1
fi

CHECK_ID="D04"
if command -v git >/dev/null 2>&1; then
  ok "git $(git --version 2>/dev/null | awk '{print $3}')"
else
  fail "git not found on PATH."
  hint "xcode-select --install (macOS) or apt install git (Linux)"
  missing_bin=1
fi

CHECK_ID="D05"
if command -v python3 >/dev/null 2>&1; then
  HAVE_PY3=1
  ok "python3 $(python3 -V 2>&1 | awk '{print $2}')"
else
  HAVE_PY3=0
  warn "python3 not found — scripts/md-to-docx.py (.docx export) unavailable."
  hint "brew install python (macOS) or apt install python3 (Linux)"
fi

CHECK_ID="D06"
# Same candidate lists render-drawio.sh / render-pdf.sh already probe.
DRAWIO_BIN="$(command -v drawio 2>/dev/null || true)"
for c in "/Applications/draw.io.app/Contents/MacOS/draw.io" \
         "/Applications/drawio.app/Contents/MacOS/drawio" \
         "/usr/bin/drawio"; do
  [[ -z "$DRAWIO_BIN" && -x "$c" ]] && DRAWIO_BIN="$c"
done
SOFFICE_BIN="$(command -v soffice 2>/dev/null || true)"
for c in "/Applications/LibreOffice.app/Contents/MacOS/soffice"; do
  [[ -z "$SOFFICE_BIN" && -x "$c" ]] && SOFFICE_BIN="$c"
done
if [[ -n "$DRAWIO_BIN" && -n "$SOFFICE_BIN" ]]; then
  ok "optional renderers present (draw.io, LibreOffice)"
else
  warn "draw.io / LibreOffice not found — diagram PNG + PDF QA unavailable."
  hint "brew install --cask drawio libreoffice"
fi

if [[ ${missing_bin:-0} -eq 1 ]]; then
  flush_pending
  if [[ $JSON -eq 1 ]]; then
    printf '{"id":"SUMMARY","status":"fail","ok":%d,"warn":%d,"fail":%d,"mode":"aborted — required host tooling missing"}\n' \
      "$oks" "$warns" "$fails"
  else
    echo
    echo "DOCTOR: required tooling missing — cannot continue."
  fi
  exit 3
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Engine integrity"

CHECK_ID="D07"
if [[ -f CLAUDE.md ]]; then
  ok "engine repo root: $REPO_ROOT"
else
  fail "CLAUDE.md not found — run doctor from inside the engine repo."
  hint "cd into the AI-Architect-Claude checkout and re-run: bash scripts/doctor.sh"
  verdict
fi

CHECK_ID="D08"
skills_n="$(ls -d skills/*/ 2>/dev/null | wc -l | tr -d ' ')"
agents_n="$(ls agents/*.md 2>/dev/null | wc -l | tr -d ' ')"
# Expected counts are read from CLAUDE.md's authoritative roster note rather than
# hardcoded, so the roster can grow without editing this script.
declared_skills="$(grep -oE 'There are \*\*[0-9]+\*\* .SKILL\.md. files' CLAUDE.md 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1)"
declared_agents="$(grep -oE '[0-9]+ of them also have a sub-agent' CLAUDE.md 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1)"
roster_source="CLAUDE.md"
if [[ -z "$declared_skills" || -z "$declared_agents" ]]; then
  declared_skills="${declared_skills:-28}"
  declared_agents="${declared_agents:-9}"
  roster_source="built-in fallback (could not parse the CLAUDE.md roster note)"
fi
if [[ "$skills_n" == "$declared_skills" && "$agents_n" == "$declared_agents" ]]; then
  ok "roster intact: $skills_n skills / $agents_n agents (expected per $roster_source)"
else
  fail "roster drift — CLAUDE.md declares $declared_skills skills / $declared_agents agents, filesystem has $skills_n/$agents_n."
  hint "bash scripts/sync-agents-skills.sh"
fi

CHECK_ID="D09"
missing_skill_md=0
for d in skills/*/; do
  [[ -d "$d" ]] || continue
  if [[ ! -f "$d/SKILL.md" ]]; then
    fail "skill directory has no SKILL.md: $d"
    hint "every specialist must ship a SKILL.md — see CLAUDE.md 'Specialist roster'"
    missing_skill_md=1
  fi
done
[[ $missing_skill_md -eq 0 ]] && ok "every skills/*/ directory ships a SKILL.md"

CHECK_ID="D10"
# Delegate to the existing structural audit — never re-implement its checks here.
struct_out="$(bash scripts/verify-structure.sh 2>&1)"
if [[ $? -eq 0 ]]; then
  ok "structure audit passed (parity, frontmatter, name-match, path refs)"
else
  if [[ $JSON -eq 0 ]]; then
    printf '%s\n' "$struct_out" | sed 's/^/  /' >&2
  fi
  fail "structure audit failed (output above)."
  hint "bash scripts/verify-structure.sh"
fi

CHECK_ID="D11"
hooks_path="$(git config core.hooksPath 2>/dev/null)"
if [[ "$hooks_path" == ".githooks" ]]; then
  ok "pre-commit governance hooks active (core.hooksPath=.githooks)"
else
  fail "pre-commit governance hooks are not active (core.hooksPath unset)."
  hint "git config core.hooksPath .githooks"
fi

CHECK_ID="D12"
SUBMODULE_OK=0
if [[ -d ServiceNowDocs/markdown ]]; then
  SUBMODULE_OK=1
  ok "ServiceNowDocs submodule populated"
else
  fail "ServiceNowDocs submodule not populated — the engine cannot cite primary sources."
  hint "git submodule update --init --recursive"
fi

CHECK_ID="D13"
if [[ $SUBMODULE_OK -eq 1 ]]; then
  docs_branch="$(git -C ServiceNowDocs rev-parse --abbrev-ref HEAD 2>/dev/null)"
  if [[ "$docs_branch" == "australia" ]]; then
    ok "ServiceNowDocs on the pinned release branch (australia)"
  else
    fail "ServiceNowDocs is on branch '$docs_branch', not 'australia' (the branch pinned in .gitmodules) — release-family claims will be wrong."
    hint "git -C ServiceNowDocs checkout australia && git -C ServiceNowDocs pull"
  fi
else
  skip "submodule branch check — submodule not populated (see D12)"
fi

CHECK_ID="D14"
sub_status="$(git submodule status ServiceNowDocs 2>/dev/null | head -1)"
case "$sub_status" in
  \+*) warn "ServiceNowDocs checkout differs from the pinned commit."
       hint "git submodule update --recursive (or commit the bump if it is intentional)" ;;
  \-*) fail "ServiceNowDocs submodule not initialised."
       hint "git submodule update --init --recursive" ;;
  "")  skip "submodule pin check — 'git submodule status' returned nothing" ;;
  *)   ok "ServiceNowDocs matches the pinned commit" ;;
esac

CHECK_ID="D15"
# verify-citations.sh:23-26 deliberately exits 0 when the submodule is missing so
# it never blocks a commit on a machine that has not fetched the docs. The doctor
# must NOT inherit that leniency: a skipped citation gate means every citation in
# the repo is currently unverified, which is a finding, not a pass.
cit_out="$(bash scripts/verify-citations.sh 2>&1)"
cit_rc=$?
case "$cit_out" in
  SKIP:*)
    fail "citation gate SKIPPED because the submodule is missing — every ServiceNowDocs citation is currently unverified."
    hint "git submodule update --init --recursive" ;;
  *)
    if [[ $cit_rc -eq 0 ]]; then
      ok "$(printf '%s' "$cit_out" | tail -1)"
    else
      if [[ $JSON -eq 0 ]]; then
        printf '%s\n' "$cit_out" | sed 's/^/  /' >&2
      fi
      fail "citation audit failed (output above)."
      hint "remap each DEAD path to a real file under ServiceNowDocs/markdown/"
    fi ;;
esac

CHECK_ID="D16"
# (a) settings.json present
if [[ -f .claude/settings.json ]]; then
  ok ".claude/settings.json present"

  # (b) valid JSON
  if [[ $HAVE_PY3 -eq 1 ]]; then
    if python3 -m json.tool .claude/settings.json >/dev/null 2>&1; then
      ok ".claude/settings.json is valid JSON"
    else
      fail ".claude/settings.json is not valid JSON"
      hint "python3 -m json.tool .claude/settings.json  # shows the offending line"
    fi
  else
    warn "cannot validate .claude/settings.json — python3 not available"
  fi

  # (c) example placeholder not substituted
  if grep -q '/path/to/your' .claude/settings.json; then
    fail ".claude/settings.json still contains the placeholder path from settings.example.json"
    hint "bash scripts/setup.sh re-runs the substitution"
  else
    ok ".claude/settings.json placeholder paths substituted"
  fi

  # (d) every hook target resolves. This matters more than it looks: the PreToolUse
  #     matcher is Bash|WebFetch|Read|Grep|Agent|Task, so a broken hook target fires
  #     on essentially every tool call, not on some rare path.
  hook_bad=0
  hook_seen=0
  while IFS= read -r line; do
    # collapse backslashes and quotes to spaces, then take the first absolute path token
    tgt="$(printf '%s' "$line" | tr '\\"' '  ' | grep -oE '/[^ ]+' | head -1)"
    [[ -z "$tgt" ]] && continue
    hook_seen=$((hook_seen + 1))
    if [[ ! -e "$tgt" ]]; then
      fail "hook target missing: $tgt"
      hint "npm install -g context-mode"
      hook_bad=1
    fi
  done < <(grep '"command"' .claude/settings.json 2>/dev/null)
  if [[ $hook_bad -eq 0 ]]; then
    if [[ $hook_seen -gt 0 ]]; then
      ok "all $hook_seen hook target(s) resolve on disk"
    else
      skip "no hook commands declared in .claude/settings.json"
    fi
  fi
else
  fail ".claude/settings.json not found — Claude Code hooks are not configured."
  hint "bash scripts/setup.sh  (or: cp .claude/settings.example.json .claude/settings.json)"
fi

# ══════════════════════════════════════════════════════════════════════════════
if [[ $TIER0 -eq 1 ]]; then
  section "MCP layer"
  CHECK_ID="D17"
  skip "MCP section skipped (--tier0) — design-only is a fully supported mode."
  verdict
fi

section "MCP layer"

# Read-only inspection of ~/.claude.json. This helper NEVER writes to that file
# and NEVER prints a secret value — anything matching /PASSWORD|SECRET|TOKEN|_KEY$/i
# is reported as __SET_LEN_<n>__ so a length can be sanity-checked without exposure.
NODE_READ_CFG="$(cat <<'NODEJS'
const fs = require("fs"), os = require("os"), path = require("path");
const cwd = process.argv[1];
const file = path.join(os.homedir(), ".claude.json");
// "absent", "unreadable" and "corrupt" must NOT collapse into one another: only
// absent is Tier 0. A file that exists but cannot be read or parsed means Claude
// Code itself is broken, and reporting that as "design-only, fully supported" is
// exactly the silent pass this script exists to eliminate.
let raw;
try { raw = fs.readFileSync(file, "utf8"); }
catch (e) {
  if (e && e.code === "ENOENT") console.log("NO_CONFIG=1");
  else console.log("CFG_UNREADABLE=" + ((e && e.code) || "ERR"));
  process.exit(0);
}
let j;
try { j = JSON.parse(raw); }
catch (e) { console.log("CFG_INVALID=1"); process.exit(0); }
try { console.log("CLAUDE_JSON_MODE=" + (fs.statSync(file).mode & 0o777).toString(8)); } catch (e) {}
const projects = j.projects || {};
const looksLikeSnow = (name, cfg) =>
  /servicenow|nowaikit|snow/i.test(name) ||
  (Array.isArray(cfg && cfg.args) && cfg.args.some(a => String(a).includes("server.js")));
const others = Object.keys(projects).filter(p => {
  if (p === cwd) return false;
  const s = (projects[p] || {}).mcpServers || {};
  return Object.keys(s).some(n => looksLikeSnow(n, s[n]));
});
console.log("OTHER_PROJECTS=" + others.join(","));
const entry = projects[cwd];
if (!entry) { console.log("NO_PROJECT=1"); process.exit(0); }
const servers = entry.mcpServers || {};
const key = Object.keys(servers).find(n => looksLikeSnow(n, servers[n]));
if (!key) { console.log("NO_SERVER=1"); process.exit(0); }
const cfg = servers[key] || {};
console.log("SERVER_KEY=" + key);
console.log("COMMAND=" + (cfg.command || ""));
console.log("ARGS0=" + ((cfg.args && cfg.args[0]) || ""));
const disabled = Array.isArray(entry.disabledMcpjsonServers) ? entry.disabledMcpjsonServers : [];
console.log("DISABLED=" + (disabled.indexOf(key) >= 0 ? "1" : "0"));
console.log("TRUST_ACCEPTED=" + (typeof entry.hasTrustDialogAccepted === "boolean" ? String(entry.hasTrustDialogAccepted) : "absent"));
const env = cfg.env || {};
// A JSON boolean / number in the env block is NOT a string; the child process
// would receive a coerced value (or the config may be rejected outright), so the
// key is reported separately rather than silently normalised to "true".
const nonString = [];
for (const k of Object.keys(env)) {
  if (env[k] !== null && env[k] !== undefined && typeof env[k] !== "string") nonString.push(k);
  const v = env[k] === null || env[k] === undefined ? "" : String(env[k]);
  if (/PASSWORD|SECRET|TOKEN|_KEY$/i.test(k)) console.log(k + "=__SET_LEN_" + v.length + "__");
  else console.log(k + "=" + v.replace(/[\r\n]/g, " "));
}
console.log("NONSTRING_KEYS=" + nonString.join(","));
NODEJS
)"

MCP_CFG="$(node -e "$NODE_READ_CFG" -- "$PWD" 2>/dev/null)"

cfgval() { printf '%s\n' "$MCP_CFG" | grep -m1 "^$1=" | sed "s/^$1=//"; }
cfghas() { printf '%s\n' "$MCP_CFG" | grep -q "^$1="; }

CHECK_ID="D17"
if cfghas CFG_INVALID; then
  fail "~/.claude.json exists but is not valid JSON — Claude Code cannot read ANY of its configuration, for this project or any other. This is not Tier 0; it is a broken install."
  hint "restore it from the newest ~/.claude.json.backup* if setup.sh made one, or fix the syntax: node -e 'JSON.parse(require(\"fs\").readFileSync(require(\"os\").homedir()+\"/.claude.json\",\"utf8\"))'"
  verdict
fi
if cfghas CFG_UNREADABLE; then
  fail "~/.claude.json exists but could not be read ($(cfgval CFG_UNREADABLE)) — Claude Code cannot read its configuration either."
  hint "chmod 600 ~/.claude.json (and check the file is owned by you)"
  verdict
fi
if [[ -z "$MCP_CFG" ]]; then
  fail "the ~/.claude.json inspection helper produced no output — node could not run it, so the whole MCP layer is unaudited."
  hint "node -v  # confirm node runs; then re-run: bash scripts/doctor.sh"
  verdict
fi
if cfghas NO_CONFIG || cfghas NO_PROJECT || cfghas NO_SERVER; then
  other_projects="$(cfgval OTHER_PROJECTS)"
  if [[ -n "$other_projects" ]] && ! cfghas NO_CONFIG; then
    fail "no MCP registration under projects[\"$PWD\"] — but one exists under: $other_projects."
    hint "'claude mcp add' keys local scope on the absolute working directory, so a moved or symlinked checkout silently loses its registration; re-run 'bash scripts/setup.sh' from the real path."
    verdict
  fi
  skip "no MCP server registered for this project — Tier 0 (design-only) is a fully supported mode."
  verdict
fi

SERVER_KEY="$(cfgval SERVER_KEY)"
ARGS0="$(cfgval ARGS0)"
COMMAND="$(cfgval COMMAND)"
ok "MCP '$SERVER_KEY' registered for this project"

CHECK_ID="D18"
if [[ "$(cfgval DISABLED)" == "1" ]]; then
  fail "MCP server '$SERVER_KEY' is listed in disabledMcpjsonServers — every snow_* tool is hidden from the model."
  hint "re-enable it with /mcp inside Claude Code, or remove the entry from ~/.claude.json"
elif [[ "$(cfgval TRUST_ACCEPTED)" == "false" ]]; then
  warn "hasTrustDialogAccepted=false for this project — Claude Code may not load the MCP server until the trust prompt is accepted."
  hint "open Claude Code in this directory and accept the trust prompt"
else
  ok "MCP server enabled for this project"
fi

CHECK_ID="D19"
SNOW_MCP=""
if [[ -n "$ARGS0" && -f "$ARGS0" ]]; then
  case "$ARGS0" in
    */dist/server.js) ok "server entrypoint resolves: $ARGS0" ;;
    *)                warn "registered entrypoint is not a .../dist/server.js path: $ARGS0"
                      hint "the supported registration runs 'node <snow-mcp>/dist/server.js'" ;;
  esac
  SNOW_MCP="$(dirname "$(dirname "$ARGS0")")"
else
  fail "registered server entrypoint does not exist: ${ARGS0:-<empty>}"
  if [[ -n "$ARGS0" ]]; then
    hint "cd $(dirname "$(dirname "$ARGS0")") && npm install && npm run build"
  else
    hint "re-register the server: bash scripts/setup.sh"
  fi
fi

CHECK_ID="D20"
if [[ -n "$SNOW_MCP" && -d "$SNOW_MCP" ]]; then
  if [[ -d "$SNOW_MCP/node_modules" ]]; then
    ok "server dependencies installed ($SNOW_MCP/node_modules)"
  else
    fail "server dependencies not installed: $SNOW_MCP/node_modules missing"
    hint "cd $SNOW_MCP && npm install"
  fi
  if [[ -f "$SNOW_MCP/dist/server.js" ]]; then
    ok "server build present ($SNOW_MCP/dist/server.js)"
  else
    fail "server not built: $SNOW_MCP/dist/server.js missing"
    hint "cd $SNOW_MCP && npm run build"
  fi
else
  skip "server checkout health — entrypoint unresolved (see D19)"
fi

CHECK_ID="D21"
if [[ -n "$SNOW_MCP" && -d "$SNOW_MCP/src" && -f "$SNOW_MCP/dist/server.js" ]]; then
  newer_src="$(find "$SNOW_MCP/src" -name '*.ts' -newer "$SNOW_MCP/dist/server.js" 2>/dev/null | head -1)"
  if [[ -n "$newer_src" ]]; then
    warn "dist/ is older than src/ — rebuild."
    hint "cd $SNOW_MCP && npm run build"
  else
    ok "server build is current (dist/ newer than src/)"
  fi
else
  skip "build freshness — server checkout unresolved"
fi

CHECK_ID="D22"
if [[ -n "$SNOW_MCP" && -f "$SNOW_MCP/dist/tools-manifest.json" ]]; then
  tool_count="$(node -e 'const m=require(process.argv[1]);console.log(Array.isArray(m)?m.length:Object.keys(m).length)' "$SNOW_MCP/dist/tools-manifest.json" 2>/dev/null)"
  case "$tool_count" in
    ''|*[!0-9]*) fail "tool manifest is present but unreadable: $SNOW_MCP/dist/tools-manifest.json"
                 hint "cd $SNOW_MCP && npm run build" ;;
    0)           fail "tool manifest is empty — no tools would be advertised."
                 hint "cd $SNOW_MCP && npm run build" ;;
    *)           ok "tool manifest present ($tool_count tools)" ;;
  esac
elif [[ -z "$SNOW_MCP" || ! -d "$SNOW_MCP" ]]; then
  # Do not restate D19's failure as a second FAIL — a cascade inflates the count
  # and buries the one remedy that matters.
  skip "tool manifest — server checkout unresolved (see D19)"
else
  fail "tool manifest missing: $SNOW_MCP/dist/tools-manifest.json"
  hint "cd $SNOW_MCP && npm run build"
fi

# ─── connection variables ─────────────────────────────────────────────────────
INSTANCE_URL="$(cfgval SERVICENOW_INSTANCE_URL)"
AUTH_METHOD="$(cfgval SERVICENOW_AUTH_METHOD)"
BASIC_USER="$(cfgval SERVICENOW_BASIC_USERNAME)"
CONN_OK=1   # flips to 0 if D23/D24 find a blocking problem

secret_len() {
  # value arrives as __SET_LEN_<n>__ from the helper; never the secret itself
  printf '%s' "$1" | sed -e 's/^__SET_LEN_//' -e 's/__$//'
}

CHECK_ID="D23"
if [[ -z "$INSTANCE_URL" ]]; then
  fail "SERVICENOW_INSTANCE_URL is empty or absent — the server has nothing to connect to."
  hint "bash scripts/setup.sh"
  CONN_OK=0
else
  ok "SERVICENOW_INSTANCE_URL set"
fi

if [[ -z "$AUTH_METHOD" ]]; then
  warn "SERVICENOW_AUTH_METHOD is absent — the server defaults to 'basic'. Set it explicitly."
  AUTH_METHOD="basic"
elif [[ "$AUTH_METHOD" != "basic" && "$AUTH_METHOD" != "oauth" ]]; then
  fail "SERVICENOW_AUTH_METHOD=\"$AUTH_METHOD\" is not a supported method (expected 'basic' or 'oauth')."
  hint "bash scripts/setup.sh"
  CONN_OK=0
else
  ok "SERVICENOW_AUTH_METHOD=$AUTH_METHOD"
fi

if [[ "$AUTH_METHOD" == "basic" ]]; then
  if [[ -z "$BASIC_USER" ]]; then
    fail "SERVICENOW_BASIC_USERNAME is absent under basic auth."
    hint "bash scripts/setup.sh"
    CONN_OK=0
  else
    ok "SERVICENOW_BASIC_USERNAME=$BASIC_USER"
  fi
  pw_raw="$(cfgval SERVICENOW_BASIC_PASSWORD)"
  if [[ -z "$pw_raw" ]]; then
    fail "SERVICENOW_BASIC_PASSWORD is absent under basic auth."
    hint "bash scripts/setup.sh"
    CONN_OK=0
  else
    ok "SERVICENOW_BASIC_PASSWORD set (len $(secret_len "$pw_raw"))"
  fi
  # The unprefixed names are OAuth-only aliases; under basic auth they are read by nothing.
  if [[ -z "$BASIC_USER" ]] && printf '%s\n' "$MCP_CFG" | grep -q '^SERVICENOW_USERNAME='; then
    fail "SERVICENOW_USERNAME/PASSWORD are ignored under basic auth — the server reads SERVICENOW_BASIC_USERNAME / SERVICENOW_BASIC_PASSWORD."
    hint "rename the two keys, or switch SERVICENOW_AUTH_METHOD to oauth"
    CONN_OK=0
  fi
else
  # The server reads SERVICENOW_OAUTH_<X> **|| SERVICENOW_<X>** — the unprefixed
  # forms are documented, supported fallbacks under oauth (unlike basic auth,
  # where only the _BASIC_ names are read). FAILing on the absence of the
  # prefixed name alone would condemn a working OAuth config.
  oauth_alias() {
    case "$1" in
      SERVICENOW_OAUTH_CLIENT_ID)     echo "SERVICENOW_CLIENT_ID" ;;
      SERVICENOW_OAUTH_CLIENT_SECRET) echo "SERVICENOW_CLIENT_SECRET" ;;
      SERVICENOW_OAUTH_USERNAME)      echo "SERVICENOW_USERNAME" ;;
      SERVICENOW_OAUTH_PASSWORD)      echo "SERVICENOW_PASSWORD" ;;
    esac
  }
  for k in SERVICENOW_OAUTH_CLIENT_ID SERVICENOW_OAUTH_CLIENT_SECRET SERVICENOW_OAUTH_USERNAME SERVICENOW_OAUTH_PASSWORD; do
    v="$(cfgval "$k")"
    kk="$k"
    if [[ -z "$v" ]]; then
      alias_k="$(oauth_alias "$k")"
      v="$(cfgval "$alias_k")"
      [[ -n "$v" ]] && kk="$alias_k"
    fi
    if [[ -z "$v" ]]; then
      fail "$k is absent under oauth auth (nor is its legacy alias $(oauth_alias "$k"))."
      hint "bash scripts/setup.sh"
      CONN_OK=0
    else
      case "$v" in
        __SET_LEN_*) ok "$kk set (len $(secret_len "$v"))" ;;
        *)           ok "$kk=$v" ;;
      esac
      [[ "$kk" != "$k" ]] && hint "read via the legacy alias $kk; the documented name is $k"
    fi
  done
fi

CHECK_ID="D24"
if [[ -n "$INSTANCE_URL" ]]; then
  url_bad=0
  case "$INSTANCE_URL" in
    https://*) ;;
    *) url_bad=1 ;;
  esac
  url_rest="${INSTANCE_URL#https://}"
  case "$url_rest" in
    */*) url_bad=1 ;;
  esac
  if [[ $url_bad -eq 1 ]]; then
    fail "SERVICENOW_INSTANCE_URL must be a bare https origin with no trailing slash (the client concatenates it raw into /api/now/...)."
    hint "expected shape: https://<instance>.service-now.com"
    CONN_OK=0
  else
    ok "instance URL shape valid ($url_rest)"
  fi
else
  skip "URL shape — SERVICENOW_INSTANCE_URL not set"
fi

# ─── tier flags ───────────────────────────────────────────────────────────────
TIER_FLAGS="WRITE_ENABLED SCRIPTING_ENABLED CMDB_WRITE_ENABLED ATF_ENABLED NOW_ASSIST_ENABLED FLUENT_ENABLED"

flag_family() {
  case "$1" in
    WRITE_ENABLED)      echo "every create/update/delete tool across all domains" ;;
    SCRIPTING_ENABLED)  echo "the whole snow_scr_* domain INCLUDING ITS READS, plus update-set writes" ;;
    CMDB_WRITE_ENABLED) echo "snow_cmdb_reconcile" ;;
    ATF_ENABLED)        echo "snow_atf_*_exec" ;;
    NOW_ASSIST_ENABLED) echo "snow_na_* and snow_nas_*" ;;
    FLUENT_ENABLED)     echo "snow_fluent_*" ;;
  esac
}

flag_errcode() {
  case "$1" in
    WRITE_ENABLED)      echo "WRITE_NOT_ENABLED" ;;
    SCRIPTING_ENABLED)  echo "SCRIPTING_NOT_ENABLED" ;;
    CMDB_WRITE_ENABLED) echo "CMDB_WRITE_NOT_ENABLED" ;;
    ATF_ENABLED)        echo "ATF_NOT_ENABLED" ;;
    NOW_ASSIST_ENABLED) echo "NOW_ASSIST_NOT_ENABLED" ;;
    FLUENT_ENABLED)     echo "FLUENT_NOT_ENABLED" ;;
  esac
}

CHECK_ID="D25"
# An ABSENT flag is a FAIL, not a default. The server treats absent as disabled,
# yet the tool is still advertised to the model — which is exactly how a mid-task
# SCRIPTING_NOT_ENABLED lands in the middle of real work.
absent_flags=0
for f in $TIER_FLAGS; do
  if cfghas "$f"; then
    :
  else
    fail "$f is absent from the env block — the server treats absent as disabled, yet every tool in that family is still advertised to the model and will throw $(flag_errcode "$f") mid-task. Set it explicitly to \"true\" or \"false\"."
    hint "family gated by $f: $(flag_family "$f")"
    absent_flags=$((absent_flags + 1))
  fi
done
[[ $absent_flags -eq 0 ]] && ok "all six tier flags are declared explicitly"

CHECK_ID="D26"
bad_value=0
NONSTRING_KEYS="$(cfgval NONSTRING_KEYS)"
for f in $TIER_FLAGS; do
  cfghas "$f" || continue
  v="$(cfgval "$f")"
  # A JSON boolean (true, not "true") is not a string — the env block must carry strings.
  if printf '%s' ",$NONSTRING_KEYS," | grep -q ",$f,"; then
    fail "$f is a JSON boolean/number in ~/.claude.json, not the string \"$v\" — env values must be quoted strings; the server compares to the exact string \"true\"."
    hint "quote it: \"$f\": \"$v\""
    bad_value=$((bad_value + 1))
    continue
  fi
  if [[ "$v" != "true" && "$v" != "false" ]]; then
    fail "$f=\"$v\" — the server compares to the exact string \"true\"; this value disables the tier."
    hint "write it as the lowercase string true or false (a JSON boolean, TRUE, 1, yes, or a trailing space all read as disabled)"
    bad_value=$((bad_value + 1))
  fi
done
[[ $bad_value -eq 0 ]] && ok "every declared tier flag is the byte-exact string true or false"

CHECK_ID="D27"
WRITE_V="$(cfgval WRITE_ENABLED)"
SCRIPTING_V="$(cfgval SCRIPTING_ENABLED)"
CMDBW_V="$(cfgval CMDB_WRITE_ENABLED)"
ATF_V="$(cfgval ATF_ENABLED)"
NA_V="$(cfgval NOW_ASSIST_ENABLED)"
FLUENT_V="$(cfgval FLUENT_ENABLED)"
coherence_bad=0
if [[ "$SCRIPTING_V" == "true" && "$WRITE_V" != "true" ]]; then
  fail "SCRIPTING_ENABLED=true but WRITE_ENABLED=${WRITE_V:-<absent>} — the scripting guard calls the write guard first, so every scripting tool still throws."
  hint "set WRITE_ENABLED=true, or set SCRIPTING_ENABLED=false to stop advertising a dead tier"
  coherence_bad=1
fi
if [[ "$CMDBW_V" == "true" && "$WRITE_V" != "true" ]]; then
  fail "CMDB_WRITE_ENABLED=true but WRITE_ENABLED=${WRITE_V:-<absent>} — the CMDB write guard calls the write guard first, so every CMDB write tool still throws."
  hint "set WRITE_ENABLED=true, or set CMDB_WRITE_ENABLED=false to stop advertising a dead tier"
  coherence_bad=1
fi
if [[ "$FLUENT_V" == "true" && "$WRITE_V" != "true" ]]; then
  warn "FLUENT_ENABLED=true but WRITE_ENABLED=${WRITE_V:-<absent>} — the Fluent build/deploy tools also require WRITE_ENABLED=true."
  hint "set WRITE_ENABLED=true if Fluent deploys are intended"
fi
[[ $coherence_bad -eq 0 ]] && ok "tier flag dependencies are coherent"

CHECK_ID="D28"
PKG="$(cfgval MCP_TOOL_PACKAGE)"
if [[ -z "$PKG" ]]; then
  ok "MCP_TOOL_PACKAGE unset — all tools advertised (package 'full')"
else
  pkg_valid=0
  for p in full service_desk change_coordinator knowledge_author catalog_builder \
           system_administrator platform_developer portal_developer integration_engineer \
           itom_engineer agile_manager ai_developer devops_engineer itam_analyst; do
    [[ "$PKG" == "$p" ]] && pkg_valid=1
  done
  if [[ $pkg_valid -eq 1 ]]; then
    ok "MCP_TOOL_PACKAGE=$PKG"
  else
    fail "MCP_TOOL_PACKAGE=\"$PKG\" is not a valid package; the server logs a stderr warning you will never see and silently falls back to \"full\" (all tools, writes included)."
    hint "there is no read-only package — the read-only control is WRITE_ENABLED=false"
  fi
fi

CHECK_ID="D29"
MAXREC="$(cfgval MAX_RECORDS)"
if [[ -z "$MAXREC" ]]; then
  warn "MAX_RECORDS is unset — limit-less queries return only 10 rows, silently truncated with no error."
  hint "set MAX_RECORDS=100 and always pass an explicit limit on every query"
else
  ok "MAX_RECORDS=$MAXREC"
fi

CHECK_ID="D30"
WIZ_CFG="$HOME/.config/servicenow-mcp/instances.json"
if [[ -f "$WIZ_CFG" ]]; then
  wiz_host="$(node -e '
    try {
      const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const pick = (o) => o && (o.instanceUrl || o.instance_url || o.url || "");
      let u = pick(j);
      if (!u && j.instances) {
        const k = Object.keys(j.instances);
        // the server honours defaultInstance, not "first key"
        const name = (j.defaultInstance && j.instances[j.defaultInstance]) ? j.defaultInstance : k[0];
        u = k.length ? pick(j.instances[name]) : "";
      }
      console.log(String(u).replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
    } catch (e) { console.log(""); }
  ' "$WIZ_CFG" 2>/dev/null)"
  fail "$WIZ_CFG exists and takes precedence over the env block — you may be connected to a different instance than the one configured here."
  hint "wizard config host: ${wiz_host:-<unreadable>} | env block host: ${url_rest:-<unset>} — remove or rename the wizard file to make the env block authoritative"
else
  ok "no ~/.config/servicenow-mcp/instances.json — the env block is authoritative"
fi
if [[ -n "$SNOW_MCP" && -f "$SNOW_MCP/.env" ]]; then
  warn "$SNOW_MCP/.env is never read by Claude Code (the server resolves .env against the runtime cwd, which is this repo, not the server directory)."
  hint "the authoritative configuration is the env block in ~/.claude.json — edit it with 'claude mcp add', not the .env file"
fi
# Two further env keys outrank SERVICENOW_INSTANCE_URL inside the server's own
# instance loader (SN_INSTANCES_CONFIG is priority 1 and returns early;
# SN_INSTANCE_<NAME>_URL groups register before the legacy vars are considered).
# If either is present, every SERVICENOW_* check above is auditing variables the
# server may never read — which is a silent pass, not a clean bill of health.
sn_cfg_path="$(cfgval SN_INSTANCES_CONFIG)"
if [[ -n "$sn_cfg_path" ]]; then
  fail "SN_INSTANCES_CONFIG=$sn_cfg_path is set in the env block — it is the server's FIRST config source and it returns early, so SERVICENOW_INSTANCE_URL and every SERVICENOW_* credential checked above are ignored."
  hint "remove SN_INSTANCES_CONFIG from the env block, or accept that file as authoritative and audit it instead"
fi
sn_groups="$(printf '%s\n' "$MCP_CFG" | grep -oE '^SN_INSTANCE_[A-Z0-9_]+_URL' | tr '\n' ' ')"
if [[ -n "$sn_groups" ]]; then
  fail "multi-instance env group(s) present in the env block: ${sn_groups}— these register before the legacy SERVICENOW_* vars, so the active instance may not be the one audited above."
  hint "keep exactly one configuration style: either the SERVICENOW_* single-instance block or the SN_INSTANCE_<NAME>_* groups"
fi

CHECK_ID="D31"
cj_mode="$(file_mode "$HOME/.claude.json")"
if [[ "$cj_mode" == "600" ]]; then
  ok "~/.claude.json permissions are 600"
else
  warn "~/.claude.json permissions are ${cj_mode:-unknown}, not 600 — it holds plaintext credentials."
  hint "chmod 600 ~/.claude.json"
fi
other_projects="$(cfgval OTHER_PROJECTS)"
if [[ -n "$other_projects" ]]; then
  op_count="$(printf '%s' "$other_projects" | tr ',' '\n' | grep -c . | tr -d ' ')"
  warn "$op_count other project(s) in ~/.claude.json also hold ServiceNow credentials: $(printf '%s' "$other_projects" | tr ',' ' '). Each is a separate plaintext copy."
  hint "remove the registrations you no longer use: claude mcp remove <name> (run from that project directory)"
fi
# Tracked-file leak scan. Only file:line is ever printed — never the matched line,
# which by definition could contain the credential.
# git grep exits 128 outside a work tree; without this guard a zip download (no
# .git) would silently report "no credential found" — a clean bill of health
# issued by a scan that never ran.
IS_GIT_REPO=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && IS_GIT_REPO=1
leak_files=""
leak_scanned=0
if [[ $IS_GIT_REPO -eq 1 && -n "${url_rest:-}" ]]; then
  leak_scanned=1
  # The instance host is scanned across EVERY tracked file with no exemption:
  # docs/nowaikit-field-notes.md is the one file the repo's Standing Rule says
  # must never carry an instance URL, so exempting it would defeat the check.
  host_hits="$(git grep -I -l -F -- "$url_rest" 2>/dev/null || true)"
  [[ -n "$host_hits" ]] && leak_files="$host_hits"
fi
# A doc may legitimately NAME the variable; a doc may never carry a real VALUE.
# Placeholder forms (<...>, ${...}, YOUR..., your-..., xxx, ***) are filtered out.
if [[ $IS_GIT_REPO -eq 1 ]]; then
  leak_scanned=1
  pw_hits="$(git grep -I -n -E 'SERVICENOW_BASIC_PASSWORD["'"'"']?[[:space:]]*[:=]' 2>/dev/null \
    | grep -vE '(<[^>]*>|\$\{|\$[A-Z_]+|YOUR|your-|xxx|\*\*\*|__REDACTED__|placeholder|read -rs)' \
    | cut -d: -f1,2 || true)"
  [[ -n "$pw_hits" ]] && leak_files="$(printf '%s\n%s' "$leak_files" "$pw_hits" | grep -v '^$')"
fi
if [[ $leak_scanned -eq 0 ]]; then
  if [[ $IS_GIT_REPO -eq 0 ]]; then
    fail "the tracked-file credential leak scan could NOT run — $REPO_ROOT is not a git work tree, so 'git grep' has nothing to search. Treat the repo as unscanned, not as clean."
    hint "git init / re-clone the engine instead of unpacking a zip: git clone --recurse-submodules <repo>"
  else
    skip "credential leak scan — SERVICENOW_INSTANCE_URL not set, no host to search for"
  fi
elif [[ -n "$leak_files" ]]; then
  while IFS= read -r lf; do
    [[ -z "$lf" ]] && continue
    fail "a credential or the live instance host appears in a TRACKED file: $lf. Remove it before any push."
  done < <(printf '%s\n' "$leak_files" | sort -u)
  hint "scrub the value, then rewrite history if it was already committed"
else
  ok "no credential or instance host found in tracked files"
fi
if [[ "$AUTH_METHOD" == "basic" ]]; then
  warn "the ServiceNow password is stored in plaintext in ~/.claude.json, a file shared by every Claude Code project on this machine. Never paste that file whole into a support thread."
  hint "the server also supports SERVICENOW_AUTH_METHOD=oauth, which is preferred for anything beyond a personal PDI"
fi

# ─── live probes ──────────────────────────────────────────────────────────────
CHECK_ID="D32"
PROBE=""
if [[ $NO_NETWORK -eq 1 ]]; then
  skip "live instance probes skipped (--no-network)"
elif [[ $CONN_OK -eq 0 ]]; then
  skip "live instance probes skipped — connection variables are not usable (see D23/D24)"
elif [[ "$AUTH_METHOD" != "basic" ]]; then
  skip "live instance probes support basic auth only — SERVICENOW_AUTH_METHOD=$AUTH_METHOD not probed"
else
  # The credential is read from ~/.claude.json inside node and used in-process only.
  # It is never placed in argv (visible to `ps`), an env var, or a temp file.
  NODE_PROBE="$(cat <<'NODEJS'
const fs = require("fs"), os = require("os"), path = require("path");
const cwd = process.argv[1];
const out = (k, v) => console.log(k + "=" + String(v).replace(/[\r\n]/g, " "));
let env;
try {
  const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8"));
  const servers = ((j.projects || {})[cwd] || {}).mcpServers || {};
  const key = Object.keys(servers).find(n =>
    /servicenow|nowaikit|snow/i.test(n) ||
    (Array.isArray(servers[n].args) && servers[n].args.some(a => String(a).includes("server.js"))));
  env = (servers[key] || {}).env || {};
} catch (e) { out("CONN", "ERR:CONFIG"); process.exit(0); }

const base = String(env.SERVICENOW_INSTANCE_URL || "").replace(/\/+$/, "");
const user = String(env.SERVICENOW_BASIC_USERNAME || "");
const pass = String(env.SERVICENOW_BASIC_PASSWORD || "");
const authHeader = "Basic " + Buffer.from(user + ":" + pass).toString("base64");

async function get(q) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch(base + q, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: ac.signal
    });
    let body = null;
    try { body = await r.json(); } catch (e) {}
    return { status: r.status, body: body };
  } catch (e) {
    const code = (e && e.cause && e.cause.code) || e.name || "UNKNOWN";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { status: "ERR:DNS" };
    if (code === "AbortError") return { status: "ERR:TIMEOUT" };
    return { status: "ERR:" + code };
  }
}

(async () => {
  out("HOST", base.replace(/^https?:\/\//, ""));
  out("USER", user);
  const r = await get("/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id");
  out("CONN", r.status);
  if (r.status !== 200) return;

  const tiers = [
    ["WRITE",      "WRITE_ENABLED",      "/api/now/table/sys_update_set?sysparm_limit=1&sysparm_fields=sys_id"],
    ["SCRIPTING",  "SCRIPTING_ENABLED",  "/api/now/table/sys_script_include?sysparm_limit=1&sysparm_fields=sys_id"],
    ["CMDB_WRITE", "CMDB_WRITE_ENABLED", "/api/now/table/cmdb_ci?sysparm_limit=1&sysparm_fields=sys_id"],
    ["ATF",        "ATF_ENABLED",        "/api/now/table/sys_atf_test?sysparm_limit=1&sysparm_fields=sys_id"],
    ["NOW_ASSIST", "NOW_ASSIST_ENABLED", "/api/now/table/sys_properties?sysparm_limit=1&sysparm_fields=sys_id&sysparm_query=nameSTARTSWITHsn_generative_ai"]
  ];
  for (const [label, flag, q] of tiers) {
    if (env[flag] !== "true") continue;
    const t = await get(q);
    out("TIER_" + label, t.status);
  }

  if (env.WRITE_ENABLED === "true") {
    const u = await get("/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id&sysparm_query=user_name=" + encodeURIComponent(user));
    const rows = (u.body && u.body.result) || [];
    if (u.status !== 200 || !rows.length) { out("US_PREF", "nouser"); }
    else {
      const sid = rows[0].sys_id;
      const p = await get("/api/now/table/sys_user_preference?sysparm_limit=1&sysparm_fields=value&sysparm_query=user=" + sid + "^name=sys_update_set");
      const prows = (p.body && p.body.result) || [];
      out("US_PREF", (p.status === 200 && prows.length && prows[0].value) ? "set" : "empty");
    }
  }

  const q1 = await get("/api/now/table/sys_user?sysparm_limit=2&sysparm_fields=sys_id,sys_created_on&sysparm_query=ORDERBYDESCsys_created_on");
  const q2 = await get("/api/now/table/sys_user?sysparm_limit=2&sysparm_fields=sys_id,sys_created_on&sysparm_query=ORDERBYsys_created_on%5EORDERBYDESC");
  const a = ((q1.body && q1.body.result) || [])[0];
  const b = ((q2.body && q2.body.result) || [])[0];
  if (!a || !b) { out("SORT", "inconclusive"); }
  else if (a.sys_created_on === b.sys_created_on) { out("SORT", "inconclusive"); }
  else if (a.sys_id === b.sys_id) { out("SORT", "ok"); }
  else { out("SORT", "broken"); out("SORT_DESC_FIRST", a.sys_created_on); out("SORT_MALFORMED_FIRST", b.sys_created_on); }
})();
NODEJS
)"
  PROBE="$(node -e "$NODE_PROBE" -- "$PWD" 2>/dev/null)"
fi

probeval() { printf '%s\n' "$PROBE" | grep -m1 "^$1=" | sed "s/^$1=//"; }

if [[ -n "$PROBE" ]]; then
  conn="$(probeval CONN)"
  phost="$(probeval HOST)"
  puser="$(probeval USER)"
  case "$conn" in
    200) ok "connected to $phost as $puser" ;;
    401) fail "401 — username or password rejected."
         hint "re-run setup with --creds-only: bash scripts/setup.sh --creds-only" ;;
    403) fail "403 — credentials valid but the account lacks a REST role (needs admin, or rest_api_explorer plus table read ACLs)." ;;
    404) fail "404 — the URL does not expose the Table API; check for a stray path or a typo." ;;
    ERR:DNS) fail "host not resolvable: $phost."
             hint "check SERVICENOW_INSTANCE_URL for a typo" ;;
    ERR:TIMEOUT) fail "no response in 10s — a PDI hibernates after ~10 days idle; wake it at developer.servicenow.com and re-run." ;;
    ERR:CONFIG) fail "live probe could not read the registration from ~/.claude.json." ;;
    *) fail "connection probe returned an unexpected result: ${conn:-<none>}" ;;
  esac
elif [[ $NO_NETWORK -eq 0 && $CONN_OK -eq 1 && "$AUTH_METHOD" == "basic" ]]; then
  fail "live probe produced no output — node could not run the connectivity check."
fi

CHECK_ID="D33"
if [[ -z "$PROBE" || "$(probeval CONN)" != "200" ]]; then
  skip "per-tier role probes — no live connection"
else
  tier_bad=0
  tier_seen=0
  for t in WRITE SCRIPTING CMDB_WRITE ATF NOW_ASSIST; do
    st="$(probeval "TIER_$t")"
    [[ -z "$st" ]] && continue
    tier_seen=$((tier_seen + 1))
    case "$t" in
      WRITE)      tbl="sys_update_set" ;;
      SCRIPTING)  tbl="sys_script_include" ;;
      CMDB_WRITE) tbl="cmdb_ci" ;;
      ATF)        tbl="sys_atf_test" ;;
      NOW_ASSIST) tbl="sys_properties" ;;
    esac
    if [[ "$st" != "200" ]]; then
      fail "${t}_ENABLED=true but GET $tbl returned $st — the flag is on and the account cannot use it. The tier is advertised to the model but dead."
      hint "grant the role that reads $tbl, or set ${t}_ENABLED=false so the tier is not advertised"
      tier_bad=$((tier_bad + 1))
    fi
  done
  if [[ $tier_seen -eq 0 ]]; then
    skip "per-tier role probes — no tier flag is set to true"
  elif [[ $tier_bad -eq 0 ]]; then
    ok "all $tier_seen enabled tier(s) verified against the instance"
  fi
fi

CHECK_ID="D34"
us_pref="$(probeval US_PREF)"
if [[ -z "$PROBE" || "$(probeval CONN)" != "200" || "$WRITE_V" != "true" ]]; then
  skip "update-set readiness (governance-rules.md §2.2) — requires WRITE_ENABLED=true and a live connection"
else
  case "$us_pref" in
    set)   ok "active sys_update_set preference found for $(probeval USER)" ;;
    empty) warn "no active sys_update_set preference for this user — configuration writes will land on the instance UNCAPTURED, and retroactive capture over REST is not possible."
           hint "set it before the first configuration write — CLAUDE.md §2.2 steps 1-3" ;;
    nouser) warn "could not resolve $(probeval USER) in sys_user — update-set capture readiness unverified." ;;
    *)     skip "update-set readiness — probe returned no result" ;;
  esac
fi

CHECK_ID="D35"
sort_res="$(probeval SORT)"
if [[ -z "$PROBE" || "$(probeval CONN)" != "200" ]]; then
  skip "descending-sort self-test — no live connection"
else
  case "$sort_res" in
    # NOTE ON DIRECTION: the malformed form (ORDERBYsys_created_on^ORDERBYDESC) is
    # what the MCP tool emits for orderBy:"-field". ORDERBYDESC with no field is a
    # no-op, so that query returns ASCENDING rows. The defect therefore shows up as
    # the two probes DISAGREEING on the first row; agreement means the descending
    # path is intact. (The spec for this check stated the comparison the other way
    # round; encoding it literally would have inverted the verdict.)
    broken) fail "the MCP orderBy descending path is broken — a '-' prefixed orderBy silently returns ASCENDING order (probe: proper DESC first row $(probeval SORT_DESC_FIRST) vs malformed-form first row $(probeval SORT_MALFORMED_FIRST))."
            hint "never trust orderBy; put the sort in the encoded query instead (query:\"ORDERBYDESCsys_created_on\") and sample 5+ rows before asserting \"newest\". Upstream fix: ${SNOW_MCP:-<snow-mcp>}/src/servicenow/client.ts builds \`ORDERBY<field>^ORDERBYDESC\` for a '-' prefix; the correct encoded form is \`ORDERBYDESC<field>\`." ;;
    ok)     ok "descending sort verified — both query forms agree on the newest row" ;;
    *)      skip "descending-sort self-test inconclusive (fewer than two distinct sys_created_on values returned)" ;;
  esac
fi

# ─── governing-document agreement ─────────────────────────────────────────────
CHECK_ID="D36"
# The real tool prefix Claude Code exposes is mcp__<server key>__ . CLAUDE.md §2.1
# gates writes by naming tool patterns; if it names a different prefix, the gate
# matches nothing that actually exists.
if grep -q "mcp__${SERVER_KEY}__" CLAUDE.md; then
  ok "CLAUDE.md gates on the live tool prefix (mcp__${SERVER_KEY}__)"
else
  fail "CLAUDE.md §2.1 does not gate on the prefix this server is actually registered under (mcp__${SERVER_KEY}__) — the write-approval patterns match no live tool."
  hint "update the §2.1 patterns to mcp__${SERVER_KEY}__create_* / _modify_* / _remove_*, or re-register the server under the key the docs assume"
fi

CHECK_ID="D37"
RENAME_MAP="${SNOW_MCP:-}/tool-rename-map.json"
if [[ -n "${SNOW_MCP:-}" && -f "$RENAME_MAP" ]]; then
  retired_pattern="$(node -e '
    const m = require(process.argv[1]);
    const names = Array.isArray(m) ? m : Object.keys(m);
    console.log(names.filter(n => /^[A-Za-z0-9_]+$/.test(n)).join("|"));
  ' "$RENAME_MAP" 2>/dev/null)"
  if [[ -z "$retired_pattern" ]]; then
    skip "tool-name currency — rename map unreadable: $RENAME_MAP"
  elif [[ $IS_GIT_REPO -eq 0 ]]; then
    # git grep exits 128 outside a work tree; reporting that as "no stale names"
    # would be a pass issued by a scan that never ran.
    skip "tool-name currency — not a git work tree, 'git grep' cannot scan the governing documents"
  else
    stale_files="$(git grep -l -w -E "$retired_pattern" -- '*.md' ':(exclude)ServiceNowDocs' 2>/dev/null || true)"
    if [[ -n "$stale_files" ]]; then
      stale_n="$(printf '%s\n' "$stale_files" | grep -c . | tr -d ' ')"
      stale_list="$(printf '%s\n' "$stale_files" | head -10 | tr '\n' ' ')"
      [[ $stale_n -gt 10 ]] && stale_list="$stale_list(+$((stale_n - 10)) more)"
      fail "$stale_n governing document(s) reference retired MCP tool names: $stale_list"
      hint "the rename map at $RENAME_MAP gives every old->new pair"
    else
      ok "no retired MCP tool names in the governing documents"
    fi
  fi
else
  skip "tool-name currency — no tool-rename-map.json under ${SNOW_MCP:-<unresolved server checkout>}"
fi

# ─── derived capability line ──────────────────────────────────────────────────
flagstate() {
  case "$1" in
    true)  echo "on" ;;
    false) echo "off" ;;
    "")    echo "ABSENT" ;;
    *)     echo "off" ;;
  esac
}
MODE_LINE="live — WRITE=$(flagstate "$WRITE_V") SCRIPTING=$(flagstate "$SCRIPTING_V") CMDB_WRITE=$(flagstate "$CMDBW_V") ATF=$(flagstate "$ATF_V") NOW_ASSIST=$(flagstate "$NA_V") FLUENT=$(flagstate "$FLUENT_V")"

verdict
