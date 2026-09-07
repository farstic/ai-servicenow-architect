#!/usr/bin/env bash
# setup.sh
#
# One command to fix. Takes a bare clone of the ServiceNow Architecture Engine
# to a working engine, idempotently, and stops cleanly at whichever tier the
# user actually wants:
#
#   Tier 0 (design-only)   the engine, its specialist roster and the
#                          ServiceNowDocs submodule. No ServiceNow instance,
#                          no credentials, no MCP server. This is a COMPLETE,
#                          first-class end state — every design deliverable the
#                          engine produces (HLD/LLD, stories, ADRs, estimates,
#                          diagrams, code artefacts) works fully in Tier 0.
#   Tier 1 (live instance) everything above, plus the servicenow-mcp server
#                          registered against a real instance so the engine can
#                          read (and, where enabled, write) live platform data.
#
# Steps (each one idempotent — a re-run prints "SKIP: ... already done"):
#   S1  Preflight          scripts/doctor.sh --tier0 (host toolchain + repo)
#   S2  Submodule          ServiceNowDocs, australia branch
#   S3  Hooks              git config core.hooksPath .githooks
#   S4  Mirrors            scripts/sync-agents-skills.sh
#   S5  context-mode       optional global npm package the hooks call
#   S6  settings.json      from settings.example.json, placeholder resolved
#   S7  TIER GATE          stop at Tier 0, or continue to a live instance
#   S8  snow-mcp checkout  locate and identify the MCP server source
#   S9  Build              npm install && npm run build
#   S10 Credentials        interactive only; never echoed, never stored here
#   S11 Tier flags         the six capability gates + tool package + MAX_RECORDS
#   S12 Register           claude mcp add, backup-first / verify-after. A zero
#                          exit from the CLI is NOT taken as proof: the written
#                          config is re-read and the entry, its entrypoint and
#                          every required env KEY are checked (names only).
#   S13 Verify             scripts/doctor.sh (full)
#
# REGISTRATION DECISION — why `claude mcp add`, and not a JSON rewrite:
#   1. ~/.claude.json is a ~100 KB file holding EVERY project's Claude Code
#      configuration on this machine, not just this repo's. The CLI is its
#      sanctioned writer: it preserves the schema and every sibling project.
#      A hand-rolled read-modify-write risks losing all of it. That is not
#      hypothetical — the upstream MCP server's own config-merge helper
#      swallows a JSON parse error and restarts from an empty object, which
#      would silently discard the entire file. That pattern is deliberately
#      NOT reproduced here.
#   2. `claude mcp add` takes each variable as a separate `-e KEY=value` argv
#      item, so a password containing spaces, quotes, $, backticks or ; needs
#      no escaping at all — bash passes each `-e` value as one discrete argv
#      entry. `claude mcp add-json` would require embedding the same secret
#      inside a JSON string, adding an escaping failure mode for zero benefit.
#      (The upstream setup wizard interpolates env vars into a single shell
#      command string passed to execSync — exactly the bug avoided here.)
#   3. Local scope keys on the ABSOLUTE working directory, which is why S12
#      runs from REPO_ROOT. Registering from the server checkout is the silent
#      failure where the engine repo sees no ServiceNow tools at all.
#   4. Residual risk, stated honestly: process argv is visible to `ps` for the
#      lifetime of the `claude mcp add` call. Mitigations — the backup-first /
#      verify-after protocol in S12; use a dedicated integration service
#      account rather than a personal SSO credential; prefer OAuth on any
#      instance that supports it. Note also that the resulting registration
#      stores the secret in PLAINTEXT in ~/.claude.json (mode 0600 at best) —
#      that is a property of Claude Code's MCP config, not of this script.
#
# CREDENTIAL RULES (non-negotiable, enforced throughout):
#   - No credential is ever written to any file under this repository.
#   - No credential is ever echoed: secrets are read with `read -rs`.
#   - No credential is ever written to a temp file.
#   - `set -x` is never enabled anywhere in this script, and the secret
#     variables are unset immediately after the registration call.
#
# Exit 0: setup completed AND the closing scripts/doctor.sh run was clean
#         (Tier 0 or Tier 1 — both are success).
# Exit 1: either a setup step failed, or every step succeeded but the closing
#         doctor run still reports problems. The final two lines say which:
#         a step failure is a setup defect, a doctor-only failure is a repo /
#         instance health finding setup does not fix by itself.
# Exit 3: required tooling missing (git / node / npm; or `claude` for Tier 1).
#
# Usage:
#   bash scripts/setup.sh                        # interactive, full bootstrap
#   bash scripts/setup.sh --yes                  # non-interactive; stops at Tier 0
#   bash scripts/setup.sh --tier0                # explicitly stop after S7
#   bash scripts/setup.sh --mcp                  # MCP steps only (S8-S13)
#   bash scripts/setup.sh --creds-only           # re-prompt creds, re-register
#   bash scripts/setup.sh --snow-mcp ../snow-mcp # where the server checkout is

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MCP_NAME="servicenow-mcp"
SNOW_MCP_DEFAULT="$REPO_ROOT/../snow-mcp"
VALID_PACKAGES="full service_desk change_coordinator knowledge_author catalog_builder system_administrator platform_developer portal_developer integration_engineer itom_engineer agile_manager ai_developer devops_engineer itam_analyst"

errors=0
warns=0

# ---------------------------------------------------------------- reporting --
ok()   { echo "OK: $*"; }
warn() { echo "WARN: $*"; warns=$((warns + 1)); }
fail() { echo "FAIL: $*"; errors=$((errors + 1)); }
skip() { echo "SKIP: $*"; }
step() { echo; echo "== $* =="; }

# --help prints this file's header block (the shebang excluded) — it is the doc.
usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"; }

# ------------------------------------------------------------------- flags ---
ASSUME_YES=false
FORCE_TIER0=false
MCP_ONLY=false
CREDS_ONLY=false
SNOW_MCP="$SNOW_MCP_DEFAULT"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)      ASSUME_YES=true ;;
    --tier0)       FORCE_TIER0=true ;;
    --mcp)         MCP_ONLY=true ;;
    --creds-only)  CREDS_ONLY=true; MCP_ONLY=true ;;
    --snow-mcp)
      shift
      if [[ $# -eq 0 || -z "${1:-}" || "${1:-}" == -* ]]; then
        echo "FAIL: --snow-mcp needs a path argument, e.g. --snow-mcp ../snow-mcp"
        exit 1
      fi
      SNOW_MCP="$1" ;;
    --snow-mcp=*)
      SNOW_MCP="${1#--snow-mcp=}"
      if [[ -z "$SNOW_MCP" ]]; then
        echo "FAIL: --snow-mcp= needs a path, e.g. --snow-mcp=../snow-mcp"
        exit 1
      fi ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "FAIL: unknown option '$1' — run: bash scripts/setup.sh --help"; exit 1 ;;
  esac
  shift
done

if $FORCE_TIER0 && $MCP_ONLY; then
  echo "FAIL: --tier0 and --mcp/--creds-only are contradictory. Pick one."
  exit 1
fi

INTERACTIVE=1
[[ -t 0 ]] || INTERACTIVE=0
$ASSUME_YES && INTERACTIVE=0

# ------------------------------------------------------------------ prompts --
# bash writes `read -p` prompts to STDERR, so these are safe inside $( ).
ask_yn() {  # ask_yn "question" "Y|N"  -> exit 0 = yes
  local q="$1" def="${2:-N}" ans hint
  if [[ "$def" == "Y" ]]; then hint="[Y/n]"; else hint="[y/N]"; fi
  if [[ $INTERACTIVE -eq 0 ]]; then
    [[ "$def" == "Y" ]] && return 0 || return 1
  fi
  read -r -p "$q $hint " ans || ans=""
  ans="${ans:-$def}"
  case "$ans" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

ask_val() { # ask_val "question" "default" -> echoes the answer
  local q="$1" def="${2:-}" ans
  if [[ $INTERACTIVE -eq 0 ]]; then printf '%s' "$def"; return 0; fi
  read -r -p "$q [$def] " ans || ans=""
  printf '%s' "${ans:-$def}"
}

ask_secret() { # ask_secret "question" -> echoes the secret; NEVER displays it
  local q="$1" s=""
  read -rs -p "$q " s || s=""
  echo >&2          # the newline `read -rs` swallowed
  printf '%s' "$s"
}

ask_bool() { # ask_bool "question" "true|false" -> echoes the literal true/false
  local q="$1" def="${2:-false}" ans
  if [[ $INTERACTIVE -eq 0 ]]; then printf '%s' "$def"; return 0; fi
  read -r -p "$q [$def] " ans || ans=""
  ans="${ans:-$def}"
  case "$ans" in
    [Tt]rue|[Yy]|[Yy]es|1) printf 'true' ;;
    *)                     printf 'false' ;;
  esac
}

# --------------------------------------------------------------- utilities ---
have() { command -v "$1" >/dev/null 2>&1; }

json_ok() { # json_ok <file> -> exit 0 if the file parses as JSON
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" >/dev/null 2>&1
}

run_doctor() { # run_doctor [args...] -> echoes output, returns doctor's status
  if [[ ! -f scripts/doctor.sh ]]; then
    return 127
  fi
  bash scripts/doctor.sh "$@"
}

# =============================================================== S1 preflight =
# Hard requirements first, so a missing binary is exit 3 even if doctor.sh is
# not present yet (the two scripts ship together, but never assume it).
step "S1  Preflight"

missing=""
for b in git node npm; do
  have "$b" || missing="$missing $b"
done
if [[ -n "$missing" ]]; then
  echo "FAIL: required tooling missing:$missing"
  echo "      macOS: brew install git node   (npm ships with node)"
  echo "SETUP: aborted — required tooling missing."
  exit 3
fi
ok "host toolchain present (git, node $(node -v 2>/dev/null), npm $(npm -v 2>/dev/null))"

doctor_out="$(run_doctor --tier0 2>&1)"; doctor_rc=$?
if [[ $doctor_rc -eq 127 ]]; then
  warn "scripts/doctor.sh not found — preflight limited to the binary check above."
elif [[ $doctor_rc -eq 3 ]]; then
  echo "$doctor_out"
  echo "SETUP: aborted — doctor reported missing required tooling (exit 3)."
  exit 3
elif [[ $doctor_rc -ne 0 ]]; then
  # Only the "before" problems, not the whole clean report — the closing
  # verification prints the full picture and this would otherwise be the same
  # 35 lines twice in one run.
  echo "$doctor_out" | grep -E '^(FAIL|WARN|DOCTOR):' || true
  echo "NOTE: doctor reported problems (exit $doctor_rc). The steps below are what fix them;"
  echo "      the full report is printed by the closing verification at the end of this run."
else
  echo "$doctor_out" | grep -E '^DOCTOR:' || true
  ok "preflight clean"
fi

# ========================================================= S2..S7 bootstrap ===
TIER="0"

if $MCP_ONLY; then
  step "S2-S7  Repo bootstrap"
  skip "repo bootstrap already done (--mcp / --creds-only) — jumping to the MCP steps"
else

  # ------------------------------------------------------------ S2 submodule --
  step "S2  ServiceNowDocs submodule"
  if [[ -d ServiceNowDocs/markdown ]]; then
    skip "ServiceNowDocs already populated"
  else
    if [[ ! -d .git && ! -f .git ]]; then
      fail "this is not a git working tree — the ServiceNowDocs submodule cannot be fetched. Re-clone the engine with git (a ZIP download omits submodules)."
    elif git submodule update --init --recursive; then
      # Exits 0 even when there is nothing registered to init, so only claim
      # success if the content actually appeared.
      if [[ -d ServiceNowDocs/markdown ]]; then
        ok "submodule initialised"
      else
        fail "'git submodule update --init' reported success but ServiceNowDocs/markdown is still absent — is .gitmodules present in this clone?"
      fi
    else
      fail "git submodule update --init --recursive failed — check network/SSH access to the docs remote (and that .gitmodules is present)."
    fi
  fi

  if [[ -d ServiceNowDocs/markdown ]]; then
    ok "ServiceNowDocs/markdown present"
    branch="$(git -C ServiceNowDocs rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    if [[ "$branch" == "australia" ]]; then
      ok "ServiceNowDocs on the australia branch"
    else
      echo "NOTE: ServiceNowDocs is on '$branch', expected 'australia' — checking it out."
      if git -C ServiceNowDocs checkout australia >/dev/null 2>&1; then
        ok "ServiceNowDocs switched to australia"
      else
        warn "could not check out 'australia' in ServiceNowDocs (still on '$branch'). Citations may not resolve; fix with: git -C ServiceNowDocs fetch origin australia && git -C ServiceNowDocs checkout australia"
      fi
    fi
  else
    fail "ServiceNowDocs/markdown still missing — the engine will run, but every documentation citation will be unverifiable."
  fi

  # ---------------------------------------------------------------- S3 hooks --
  step "S3  Git hooks"
  # Setting core.hooksPath succeeds even when the directory does not exist —
  # git then silently runs no hooks at all. Verify the hook is really there
  # rather than reporting "guards armed" on the strength of an exit code.
  if git config core.hooksPath .githooks; then
    if [[ -x .githooks/pre-commit ]]; then
      ok "core.hooksPath = .githooks (pre-commit guards armed)"
    elif [[ -f .githooks/pre-commit ]]; then
      if chmod +x .githooks/pre-commit 2>/dev/null; then
        ok "core.hooksPath = .githooks (pre-commit made executable — guards armed)"
      else
        fail ".githooks/pre-commit is not executable and chmod failed — the governance guards will never run."
      fi
    else
      fail "core.hooksPath is set to .githooks but .githooks/pre-commit does not exist — no governance guard is armed. Incomplete clone?"
    fi
  else
    fail "could not set core.hooksPath — is this a git working tree? (a ZIP download is not: re-clone with git)"
  fi

  # -------------------------------------------------------------- S4 mirrors --
  step "S4  agents/ + skills/ mirrors"
  if [[ -f scripts/sync-agents-skills.sh ]]; then
    if bash scripts/sync-agents-skills.sh; then
      ok "mirrors in sync"
    else
      fail "scripts/sync-agents-skills.sh failed"
    fi
  else
    fail "scripts/sync-agents-skills.sh missing — incomplete clone?"
  fi

  # ---------------------------------------------------------- S5 context-mode --
  step "S5  context-mode (optional)"
  STRIP_HOOKS=false
  if npm ls -g context-mode >/dev/null 2>&1; then
    skip "context-mode already installed globally"
  else
    echo "context-mode is an optional MCP server that keeps large command output"
    echo "out of the context window. .claude/settings.example.json wires three"
    echo "hooks to it; without the package those hooks point at nothing."
    do_install=false
    if $ASSUME_YES; then
      do_install=true
    elif ask_yn "Install context-mode globally?" "N"; then
      do_install=true
    fi
    if $do_install; then
      if npm install -g context-mode; then
        ok "context-mode installed globally"
      else
        warn "npm install -g context-mode failed — continuing without it."
        STRIP_HOOKS=true
      fi
    else
      warn "context-mode not installed — the hooks in .claude/settings.json would point at a package that is not present."
      # Removing a hooks block is destructive and irreversible from the user's
      # point of view, so it is NEVER auto-answered: a non-interactive run
      # leaves the file exactly as it found it.
      if [[ $INTERACTIVE -eq 0 ]]; then
        echo "  Non-interactive — leaving .claude/settings.json untouched. Install context-mode"
        echo "  (npm install -g context-mode) or re-run interactively to drop the hooks block."
      elif ask_yn "  Write .claude/settings.json with the hooks block removed instead?" "Y"; then
        STRIP_HOOKS=true
        echo "  Hooks will be omitted. Re-run this script after installing context-mode to restore them."
      else
        echo "  Keeping the hooks block. Install context-mode later with: npm install -g context-mode"
      fi
    fi
  fi

  # --------------------------------------------------------- S6 settings.json --
  step "S6  .claude/settings.json"
  SETTINGS=".claude/settings.json"
  EXAMPLE=".claude/settings.example.json"

  MUTATE_OK=true
  if [[ -f "$SETTINGS" ]]; then
    # Back up only when something is actually about to change, so a no-op
    # re-run does not litter .backups/ with identical copies.
    pending_change=false
    $STRIP_HOOKS && pending_change=true
    grep -q '/path/to/your' "$SETTINGS" 2>/dev/null && pending_change=true
    if $pending_change; then
      mkdir -p .backups
      stamp="$(date +%Y%m%d%H%M%S)"
      if cp "$SETTINGS" ".backups/settings.json.$stamp"; then
        ok "backed up existing settings.json -> .backups/settings.json.$stamp"
      else
        fail "could not back up $SETTINGS — refusing to modify it."
        MUTATE_OK=false   # no unbacked-up mutation, ever
      fi
    else
      skip "$SETTINGS already configured — nothing to change, no backup needed"
    fi
  elif [[ -f "$EXAMPLE" ]]; then
    if cp "$EXAMPLE" "$SETTINGS"; then
      ok "created $SETTINGS from settings.example.json"
    else
      fail "could not create $SETTINGS from $EXAMPLE"
    fi
  else
    fail "$EXAMPLE missing — cannot create $SETTINGS"
  fi

  if [[ -f "$SETTINGS" ]]; then
    if $STRIP_HOOKS && ! $MUTATE_OK; then
      fail "refusing to strip the hooks block from $SETTINGS — no verified backup was taken."
    elif $STRIP_HOOKS; then
      tmp_s="$(mktemp)"
      if node -e '
        const fs=require("fs");
        const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
        delete j.hooks;
        fs.writeFileSync(process.argv[2], JSON.stringify(j,null,2)+"\n");
      ' "$SETTINGS" "$tmp_s" 2>/dev/null; then
        mv "$tmp_s" "$SETTINGS"
        ok "hooks block removed from $SETTINGS (context-mode not installed)"
      else
        rm -f "$tmp_s"
        fail "could not strip the hooks block from $SETTINGS"
      fi
    fi

    if grep -q '/path/to/your' "$SETTINGS" 2>/dev/null && ! $MUTATE_OK; then
      fail "refusing to substitute placeholders in $SETTINGS — no verified backup was taken."
    elif grep -q '/path/to/your' "$SETTINGS" 2>/dev/null; then
      NPM_PREFIX="$(dirname "$(dirname "$(npm root -g 2>/dev/null)")")"
      if [[ -z "$NPM_PREFIX" || "$NPM_PREFIX" == "." || "$NPM_PREFIX" == "/" ]]; then
        fail "could not resolve the npm global prefix (npm root -g) — leave $SETTINGS placeholders and fix by hand."
      elif [[ "$NPM_PREFIX" == *"#"* ]]; then
        fail "npm global prefix contains '#' ($NPM_PREFIX) — substitute the placeholder by hand."
      else
        # Escape the sed replacement metacharacters. An unescaped '&' expands to
        # the whole match and a stray backslash is undefined behaviour — both
        # would write a WRONG path while sed still exits 0.
        NPM_PREFIX_ESC="$(printf '%s' "$NPM_PREFIX" | sed -e 's/[\\&]/\\&/g')"
        tmp_s="$(mktemp)"
        if sed "s#/path/to/your/npm-global#$NPM_PREFIX_ESC#g" "$SETTINGS" > "$tmp_s" && mv "$tmp_s" "$SETTINGS"; then
          ok "placeholder resolved -> $NPM_PREFIX"
        else
          rm -f "$tmp_s"
          fail "placeholder substitution failed in $SETTINGS"
        fi
      fi
    else
      skip "no /path/to/your placeholder left in $SETTINGS"
    fi

    # Verify: parses, no placeholder, every hook target exists on disk.
    if json_ok "$SETTINGS"; then
      ok "$SETTINGS parses as JSON"
    else
      fail "$SETTINGS does not parse as JSON — restore from .backups/ and retry."
    fi
    if grep -q '/path/to/your' "$SETTINGS" 2>/dev/null; then
      fail "$SETTINGS still contains a /path/to/your placeholder."
    fi

    hook_targets="$(node -e '
      const fs=require("fs");
      let j; try { j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch(e) { process.exit(2); }
      const out=[];
      for (const ev of Object.keys(j.hooks||{})) {
        for (const m of (j.hooks[ev]||[])) {
          for (const h of (m.hooks||[])) {
            const c=String(h.command||"");
            const mt=c.match(/(^|[\s"'"'"'])(\/[^"'"'"'\s]+)/);
            out.push(ev+"\t"+(mt?mt[2]:""));
          }
        }
      }
      process.stdout.write(out.join("\n"));
    ' "$SETTINGS" 2>/dev/null)"

    if [[ -z "$hook_targets" ]]; then
      skip "no hooks configured in $SETTINGS — nothing to verify"
    else
      while IFS=$'\t' read -r ev target; do
        [[ -z "${ev:-}" ]] && continue
        if [[ -z "$target" ]]; then
          warn "hook $ev has no absolute path token — cannot verify it."
        elif [[ -e "$target" ]]; then
          ok "hook $ev -> $target"
        else
          fail "hook $ev target does not exist: $target"
        fi
      done <<< "$hook_targets"
    fi
  fi

  # ------------------------------------------------------------ S7 TIER GATE --
  step "S7  Tier gate"
  echo "The engine runs in two modes:"
  echo
  echo "  Tier 0 — design-only. Everything above is all you need. The full"
  echo "           specialist roster, the governance protocol and every design"
  echo "           deliverable work with NO ServiceNow instance and NO"
  echo "           credentials. This is a supported, complete configuration."
  echo
  echo "  Tier 1 — live instance. Adds the $MCP_NAME server so the engine can"
  echo "           read and (where you enable it) write real platform data."
  echo "           Needs an instance URL and a service-account credential."
  echo

  want_tier1=false
  if $FORCE_TIER0; then
    # --tier0 is a decision, not a suggestion: do not re-open the question.
    echo "--tier0 given — stopping here."
  elif [[ $INTERACTIVE -eq 0 ]]; then
    echo "Non-interactive (--yes or no TTY) — stopping at Tier 0 by design."
  elif ! have claude; then
    echo "NOTE: the 'claude' CLI is not on PATH, so an MCP server cannot be registered"
    echo "      from here. Staying in Tier 0; install Claude Code and re-run with --mcp."
  elif ask_yn "Configure a live ServiceNow instance now?" "N"; then
    want_tier1=true
  fi

  if $want_tier1; then
    TIER="1"
  else
    TIER="0"
    echo
    ok "engine ready in Tier 0 (design-only). No ServiceNow instance is required for design work."
    echo "Re-run 'bash scripts/setup.sh --mcp' later to add a live instance."
    echo
    step "S7  Closing verification"
    dout="$(run_doctor --tier0 2>&1)"; drc=$?
    doctor_ran=true
    if [[ $drc -eq 127 ]]; then
      warn "scripts/doctor.sh not found — skipping closing verification."
      drc=0
      doctor_ran=false
    else
      echo "$dout"
    fi
    echo
    echo "SETUP: Tier $TIER — setup steps: $errors failure(s), $warns warning(s);" \
         "closing health check: $($doctor_ran && { [[ $drc -eq 0 ]] && echo clean || echo "problems found (doctor exit $drc)"; } || echo "NOT RUN (scripts/doctor.sh absent)")."
    if [[ $errors -gt 0 ]]; then
      echo "FAIL: a setup step failed — see the FAIL lines above and re-run this script."
      exit 1
    fi
    if [[ $drc -ne 0 ]]; then
      echo "OK: every setup step succeeded — the engine IS usable in Tier 0 (design-only)."
      echo "FAIL: but scripts/doctor.sh still reports problems (its FAIL lines above)."
      echo "      These are repo-health findings setup does not fix by itself"
      echo "      (e.g. dead ServiceNowDocs citations). Address them, then re-run"
      echo "      'bash scripts/doctor.sh --tier0' to confirm a clean bill of health."
      exit 1
    fi
    echo "OK: setup complete (Tier 0, design-only)."
    exit 0
  fi
fi

# ========================================================== S8..S13 Tier 1 ====
TIER="1"

if ! have claude; then
  echo "FAIL: the 'claude' CLI is not on PATH — it is required to register an MCP server."
  echo "      Install Claude Code, or stay in Tier 0: bash scripts/setup.sh --tier0"
  echo "SETUP: aborted — required tooling missing."
  exit 3
fi

# ----------------------------------------------------------- S8 snow-mcp path --
step "S8  servicenow-mcp checkout"

resolve_dir() { # print an absolute path for an existing dir, else nothing
  [[ -d "$1" ]] || return 1
  (cd "$1" && pwd)
}

SNOW_MCP_ABS="$(resolve_dir "$SNOW_MCP" || true)"
if [[ -z "$SNOW_MCP_ABS" ]]; then
  echo "Not found: $SNOW_MCP"
  if [[ $INTERACTIVE -eq 1 ]]; then
    echo "Give the path to an existing servicenow-mcp checkout, or leave blank to"
    echo "clone one (you will be asked for the repository URL — this script does"
    echo "not guess it)."
    p="$(ask_val "  Path to the servicenow-mcp checkout" "")"
    if [[ -n "$p" ]]; then
      SNOW_MCP_ABS="$(resolve_dir "$p" || true)"
      [[ -z "$SNOW_MCP_ABS" ]] && fail "no such directory: $p"
    else
      url="$(ask_val "  servicenow-mcp git repository URL" "")"
      if [[ -n "$url" ]]; then
        dest="$(ask_val "  Clone into" "$SNOW_MCP_DEFAULT")"
        if git clone "$url" "$dest"; then
          SNOW_MCP_ABS="$(resolve_dir "$dest" || true)"
          ok "cloned into $SNOW_MCP_ABS"
        else
          fail "git clone failed"
        fi
      else
        fail "no path and no repository URL given — cannot locate the MCP server."
      fi
    fi
  else
    fail "servicenow-mcp checkout not found at $SNOW_MCP and the session is non-interactive."
  fi
fi

if [[ -n "$SNOW_MCP_ABS" ]]; then
  pkg_name="$(node -p 'require(process.argv[1]+"/package.json").name' "$SNOW_MCP_ABS" 2>/dev/null || true)"
  if [[ "$pkg_name" == "servicenow-mcp" ]]; then
    ok "servicenow-mcp checkout at $SNOW_MCP_ABS"
  elif [[ -z "$pkg_name" ]]; then
    fail "$SNOW_MCP_ABS has no readable package.json — that is not a servicenow-mcp checkout."
    SNOW_MCP_ABS=""
  else
    fail "$SNOW_MCP_ABS is the package '$pkg_name', not 'servicenow-mcp'."
    SNOW_MCP_ABS=""
  fi
fi

if [[ -z "$SNOW_MCP_ABS" ]]; then
  echo
  echo "SETUP: Tier 1 aborted at S8 — $errors failure(s), $warns warning(s)."
  echo "FAIL: cannot continue without a servicenow-mcp checkout. Tier 0 remains fully usable."
  exit 1
fi

# ---------------------------------------------------------------- S9 build ----
step "S9  Build the MCP server"
if $CREDS_ONLY; then
  skip "build skipped (--creds-only)"
  if [[ ! -f "$SNOW_MCP_ABS/dist/server.js" ]]; then
    fail "$SNOW_MCP_ABS/dist/server.js is missing — re-run without --creds-only to build it."
  fi
else
  do_build=true
  if [[ -f "$SNOW_MCP_ABS/dist/server.js" && -f "$SNOW_MCP_ABS/dist/tools-manifest.json" ]]; then
    skip "build already present ($SNOW_MCP_ABS/dist/server.js)"
    do_build=false
    if [[ $INTERACTIVE -eq 1 ]] && ask_yn "  Rebuild anyway?" "N"; then
      do_build=true
    fi
  fi
  if $do_build; then
    if (cd "$SNOW_MCP_ABS" && npm install && npm run build); then
      ok "npm install && npm run build completed"
    else
      fail "build failed in $SNOW_MCP_ABS — see the npm output above."
    fi
  fi
fi

if [[ -f "$SNOW_MCP_ABS/dist/server.js" ]]; then
  ok "dist/server.js present"
else
  fail "dist/server.js missing after build"
fi
if [[ -f "$SNOW_MCP_ABS/dist/tools-manifest.json" ]]; then
  tool_count="$(node -e '
    const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    process.stdout.write(String(Array.isArray(m)?m.length:Object.keys(m).length));
  ' "$SNOW_MCP_ABS/dist/tools-manifest.json" 2>/dev/null || true)"
  if [[ -n "$tool_count" ]]; then
    ok "dist/tools-manifest.json present — $tool_count tool(s) declared"
  else
    warn "dist/tools-manifest.json present but not parseable — tool count unknown"
  fi
else
  fail "dist/tools-manifest.json missing after build"
fi

if [[ $errors -gt 0 ]]; then
  echo
  echo "SETUP: Tier 1 aborted at S9 — $errors failure(s), $warns warning(s)."
  echo "FAIL: fix the build before registering the server. Tier 0 remains fully usable."
  exit 1
fi

# ---------------------------------------------------------- S10 credentials ---
step "S10 Credentials"
if [[ $INTERACTIVE -eq 0 ]]; then
  echo "FAIL: credentials require an interactive terminal; re-run without --yes."
  errors=$((errors + 1))
  echo
  echo "SETUP: Tier 1 aborted at S10 — $errors failure(s), $warns warning(s)."
  echo "FAIL: no credentials collected. Tier 0 remains fully usable."
  exit 1
fi

echo "Nothing you type below is echoed, stored in this repository, or written to"
echo "a temp file. It is passed once to 'claude mcp add' and then unset."
echo

SN_URL=""
tries=0
while [[ $tries -lt 3 ]]; do
  tries=$((tries + 1))
  raw="$(ask_val "  Instance URL (https://<instance>.service-now.com)" "")"
  raw="$(printf '%s' "$raw" | tr -d '[:space:]')"
  while [[ "$raw" == */ ]]; do raw="${raw%/}"; done
  if [[ "$raw" != https://* ]]; then
    echo "  Rejected: must start with https:// (http:// sends the credential in clear)."
    continue
  fi
  hostpart="${raw#https://}"
  if [[ -z "$hostpart" || "$hostpart" == */* ]]; then
    echo "  Rejected: give the host only, with no path (e.g. https://dev12345.service-now.com)."
    continue
  fi
  SN_URL="$raw"
  break
done
if [[ -z "$SN_URL" ]]; then
  fail "no valid instance URL after 3 attempts."
  echo
  echo "SETUP: Tier 1 aborted at S10 — $errors failure(s), $warns warning(s)."
  exit 1
fi
ok "instance URL accepted: $SN_URL"

echo
echo "  Auth method: 'basic' (username + password) or 'oauth' (client credentials"
echo "  + service account). OAuth is the safer choice for any non-PDI instance —"
echo "  tokens are short-lived and revocable without changing a user password."
SN_METHOD=""
tries=0
while [[ $tries -lt 3 ]]; do
  tries=$((tries + 1))
  m="$(ask_val "  Auth method (basic|oauth)" "basic")"
  case "$m" in
    basic|oauth) SN_METHOD="$m"; break ;;
    *) echo "  Rejected: must be 'basic' or 'oauth'." ;;
  esac
done
if [[ -z "$SN_METHOD" ]]; then
  fail "no valid auth method after 3 attempts."
  echo
  echo "SETUP: Tier 1 aborted at S10 — $errors failure(s), $warns warning(s)."
  exit 1
fi
ok "auth method: $SN_METHOD"

echo
echo "  Use a DEDICATED integration service account, not your personal SSO login."
SN_USER="$(ask_val "  ServiceNow username" "")"
if [[ -z "$SN_USER" ]]; then
  fail "username is required."
  echo
  echo "SETUP: Tier 1 aborted at S10 — $errors failure(s), $warns warning(s)."
  exit 1
fi

SN_CLIENT_ID=""
SN_CLIENT_SECRET=""
if [[ "$SN_METHOD" == "oauth" ]]; then
  SN_CLIENT_ID="$(ask_val "  OAuth client ID" "")"
  SN_CLIENT_SECRET="$(ask_secret "  OAuth client secret (not echoed):")"
fi
SN_PASS="$(ask_secret "  Password for $SN_USER (not echoed):")"

if [[ -z "$SN_PASS" ]] || { [[ "$SN_METHOD" == "oauth" ]] && [[ -z "$SN_CLIENT_ID" || -z "$SN_CLIENT_SECRET" ]]; }; then
  unset SN_PASS SN_CLIENT_SECRET
  fail "incomplete credentials — nothing was registered."
  echo
  echo "SETUP: Tier 1 aborted at S10 — $errors failure(s), $warns warning(s)."
  exit 1
fi
ok "credentials collected (never displayed, never written to this repo)"

# ----------------------------------------------------------- S11 tier flags ---
step "S11 Capability flags"
echo "Each flag gates a family of tools. All six are written EXPLICITLY as"
echo "\"true\"/\"false\" — never left absent to a default, because an absent flag"
echo "is exactly the drift that produces a mid-task SCRIPTING_NOT_ENABLED."
echo

echo "  WRITE_ENABLED — all create/update/delete tools. false = read-only engine."
F_WRITE="$(ask_bool "  WRITE_ENABLED?" "true")"

echo
echo "  SCRIPTING_ENABLED — the ENTIRE snow_scr_* domain (business rules, script"
echo "  includes, client scripts, UI actions/policies, ACLs) INCLUDING ITS READS,"
echo "  plus update-set writes. Requires WRITE_ENABLED=true. Leaving this off is"
echo "  why 'list the script includes' fails with SCRIPTING_NOT_ENABLED."
F_SCRIPT="$(ask_bool "  SCRIPTING_ENABLED?" "true")"
if [[ "$F_SCRIPT" == "true" && "$F_WRITE" != "true" ]]; then
  warn "SCRIPTING_ENABLED=true requires WRITE_ENABLED=true — forcing WRITE_ENABLED=true."
  F_WRITE="true"
fi

echo
echo "  CMDB_WRITE_ENABLED — gates ONLY the CMDB reconcile tool (the Identification"
echo "  and Reconciliation Engine entry point). Ordinary CI writes through the"
echo "  generic record-add tool are governed by WRITE_ENABLED, not by this flag."
echo "  Requires WRITE_ENABLED=true (snow-mcp .env.example, 'Tier 2')."
F_CMDB="$(ask_bool "  CMDB_WRITE_ENABLED?" "false")"
if [[ "$F_CMDB" == "true" && "$F_WRITE" != "true" ]]; then
  warn "CMDB_WRITE_ENABLED=true requires WRITE_ENABLED=true — forcing WRITE_ENABLED=true."
  F_WRITE="true"
fi

echo
echo "  ATF_ENABLED — Automated Test Framework tools. Needed by the ATF Author"
echo "  specialist to read and execute tests/suites on the instance."
F_ATF="$(ask_bool "  ATF_ENABLED?" "false")"

echo
echo "  NOW_ASSIST_ENABLED — Now Assist / generative-AI tools. Requires a Now"
echo "  Assist licence on the instance; the tools fail without one."
F_NA="$(ask_bool "  NOW_ASSIST_ENABLED?" "false")"

echo
echo "  FLUENT_ENABLED — Fluent / ServiceNow SDK (now-sdk) tooling."
F_FLUENT="$(ask_bool "  FLUENT_ENABLED?" "false")"

echo
echo "  MCP_TOOL_PACKAGE — role-scoped subset of the tool catalogue. NONE of the"
echo "  packages is read-only: the read-only control is WRITE_ENABLED=false."
echo "  Valid: $VALID_PACKAGES"
SN_PKG=""
tries=0
while [[ $tries -lt 3 ]]; do
  tries=$((tries + 1))
  p="$(ask_val "  MCP_TOOL_PACKAGE" "full")"
  if [[ " $VALID_PACKAGES " == *" $p "* ]]; then SN_PKG="$p"; break; fi
  echo "  Rejected: '$p' is not one of the 14 valid package names."
done
[[ -z "$SN_PKG" ]] && { SN_PKG="full"; warn "falling back to MCP_TOOL_PACKAGE=full"; }

echo
echo "  MAX_RECORDS — default page size when a tool call omits a limit. The"
echo "  server default of 10 silently truncates; 100 is the safe floor (cap 1000)."
SN_MAXR="$(ask_val "  MAX_RECORDS" "100")"
case "$SN_MAXR" in
  ''|*[!0-9]*) warn "MAX_RECORDS '$SN_MAXR' is not a number — using 100."; SN_MAXR="100" ;;
esac
# The server caps at 1000; 0 would make every limit-less query return nothing.
SN_MAXR="$((10#$SN_MAXR))"
if [[ $SN_MAXR -lt 1 ]]; then
  warn "MAX_RECORDS must be at least 1 — using 100."; SN_MAXR="100"
elif [[ $SN_MAXR -gt 1000 ]]; then
  warn "MAX_RECORDS is capped at 1000 by the server — using 1000 instead of $SN_MAXR."; SN_MAXR="1000"
fi

ok "flags: WRITE=$F_WRITE SCRIPTING=$F_SCRIPT CMDB_WRITE=$F_CMDB ATF=$F_ATF NOW_ASSIST=$F_NA FLUENT=$F_FLUENT PACKAGE=$SN_PKG MAX_RECORDS=$SN_MAXR"

# ------------------------------------------------------------- S12 register ---
step "S12 Register with Claude Code"

CFG="$HOME/.claude.json"
BACKUP=""
if [[ -f "$CFG" ]]; then
  if ! json_ok "$CFG"; then
    unset SN_PASS SN_CLIENT_SECRET
    fail "$CFG does not currently parse as JSON — refusing to touch it. Repair it first."
    echo
    echo "SETUP: Tier 1 aborted at S12 — $errors failure(s), $warns warning(s)."
    exit 1
  fi
  BACKUP="$CFG.bak-$(date +%Y%m%d%H%M%S)"
  # The backup inherits this file's plaintext credentials, so it is created
  # owner-only. `cp` applies the current umask, NOT the source file's mode —
  # without this a 0600 config would be copied to a world-readable 0644 backup.
  if (umask 077; cp "$CFG" "$BACKUP") && chmod 600 "$BACKUP" 2>/dev/null && json_ok "$BACKUP"; then
    ok "backed up $CFG -> $BACKUP (mode 600, verified parseable)"
  else
    unset SN_PASS SN_CLIENT_SECRET
    fail "could not take a verified backup of $CFG — aborting before any mutation."
    echo
    echo "SETUP: Tier 1 aborted at S12 — $errors failure(s), $warns warning(s)."
    exit 1
  fi
else
  skip "$CFG does not exist yet — nothing to back up"
fi

# Existing local-scope registration for THIS project directory?
already="no"
if [[ -f "$CFG" ]]; then
  already="$(node -e '
    const fs=require("fs");
    let j; try { j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch(e) { process.stdout.write("no"); process.exit(0); }
    const p=(j.projects||{})[process.argv[2]];
    const has = !!(p && p.mcpServers && p.mcpServers[process.argv[3]]);
    process.stdout.write(has ? "yes" : "no");
  ' "$CFG" "$REPO_ROOT" "$MCP_NAME" 2>/dev/null || echo "no")"
fi

if [[ "$already" == "yes" ]]; then
  echo "An existing '$MCP_NAME' registration for this project was found — removing"
  echo "it first so the new one is clean (this replaces it, it does not duplicate)."
  if claude mcp remove "$MCP_NAME" -s local >/dev/null 2>&1; then
    ok "previous registration removed"
  else
    warn "could not remove the previous registration — 'claude mcp add' may refuse to overwrite it."
  fi
else
  skip "no existing '$MCP_NAME' registration for this project"
fi

# Build argv. Each -e value is ONE argv item, so no shell/JSON escaping of the
# secret is needed or attempted. Registration runs from REPO_ROOT because local
# scope keys on the absolute working directory (see the header, point 3).
add_args=( mcp add "$MCP_NAME" -s local )
add_args+=( -e "SERVICENOW_INSTANCE_URL=$SN_URL" )
add_args+=( -e "SERVICENOW_AUTH_METHOD=$SN_METHOD" )
if [[ "$SN_METHOD" == "basic" ]]; then
  add_args+=( -e "SERVICENOW_BASIC_USERNAME=$SN_USER" )
  add_args+=( -e "SERVICENOW_BASIC_PASSWORD=$SN_PASS" )
else
  add_args+=( -e "SERVICENOW_OAUTH_CLIENT_ID=$SN_CLIENT_ID" )
  add_args+=( -e "SERVICENOW_OAUTH_CLIENT_SECRET=$SN_CLIENT_SECRET" )
  add_args+=( -e "SERVICENOW_OAUTH_USERNAME=$SN_USER" )
  add_args+=( -e "SERVICENOW_OAUTH_PASSWORD=$SN_PASS" )
fi
add_args+=( -e "WRITE_ENABLED=$F_WRITE" )
add_args+=( -e "SCRIPTING_ENABLED=$F_SCRIPT" )
add_args+=( -e "CMDB_WRITE_ENABLED=$F_CMDB" )
add_args+=( -e "ATF_ENABLED=$F_ATF" )
add_args+=( -e "NOW_ASSIST_ENABLED=$F_NA" )
add_args+=( -e "FLUENT_ENABLED=$F_FLUENT" )
add_args+=( -e "MCP_TOOL_PACKAGE=$SN_PKG" )
add_args+=( -e "MAX_RECORDS=$SN_MAXR" )
add_args+=( -- node "$SNOW_MCP_ABS/dist/server.js" )

# Keys the registration MUST carry afterwards. The tier flags are listed
# explicitly because an ABSENT flag is the exact drift this whole script exists
# to prevent (a mid-task SCRIPTING_NOT_ENABLED).
REQUIRED_KEYS="SERVICENOW_INSTANCE_URL,SERVICENOW_AUTH_METHOD,WRITE_ENABLED,SCRIPTING_ENABLED,CMDB_WRITE_ENABLED,ATF_ENABLED,NOW_ASSIST_ENABLED,FLUENT_ENABLED,MCP_TOOL_PACKAGE,MAX_RECORDS"
if [[ "$SN_METHOD" == "basic" ]]; then
  REQUIRED_KEYS="$REQUIRED_KEYS,SERVICENOW_BASIC_USERNAME,SERVICENOW_BASIC_PASSWORD"
else
  REQUIRED_KEYS="$REQUIRED_KEYS,SERVICENOW_OAUTH_CLIENT_ID,SERVICENOW_OAUTH_CLIENT_SECRET,SERVICENOW_OAUTH_USERNAME,SERVICENOW_OAUTH_PASSWORD"
fi

echo "Running: claude mcp add $MCP_NAME -s local -e <12 variables, values hidden> -- node $SNOW_MCP_ABS/dist/server.js"
if claude "${add_args[@]}"; then
  echo "'claude mcp add' exited 0 — verifying the registration actually landed."
else
  fail "'claude mcp add' failed — see its output above."
fi
unset add_args
unset SN_PASS
unset SN_CLIENT_SECRET

# Verify-after. `claude mcp add` exiting 0 is NOT proof that anything was
# written: the CLI could write to another scope, key the project under a
# different path, or be a shim. So the file itself is re-read and checked —
# by KEY NAME only. No value is ever read out of it or printed.
if [[ ! -f "$CFG" ]]; then
  fail "$CFG does not exist after 'claude mcp add' — registration did not take effect."
elif ! json_ok "$CFG"; then
  if [[ -n "$BACKUP" && -f "$BACKUP" ]]; then
    cp "$BACKUP" "$CFG" && chmod 600 "$CFG" 2>/dev/null
    fail "$CFG no longer parsed as JSON — RESTORED from $BACKUP. Nothing was registered."
  else
    fail "$CFG no longer parses as JSON and there is no backup to restore. Repair it by hand."
  fi
else
  ok "$CFG still parses as JSON after registration"
  verify_out="$(node -e '
    const fs = require("fs");
    const cfg = process.argv[1], root = process.argv[2], name = process.argv[3];
    const entry = process.argv[4], need = process.argv[5].split(",");
    let j;
    try { j = JSON.parse(fs.readFileSync(cfg, "utf8")); }
    catch (e) { process.stdout.write("ERR unparseable"); process.exit(0); }
    const p = (j.projects || {})[root];
    const s = p && p.mcpServers && p.mcpServers[name];
    if (!s) { process.stdout.write("ERR missing"); process.exit(0); }
    const args = Array.isArray(s.args) ? s.args : [];
    if (args.indexOf(entry) === -1) {
      process.stdout.write("ERR entry " + (args.length ? args[args.length - 1] : "<none>"));
      process.exit(0);
    }
    const env = s.env || {};
    const absent = need.filter(function (k) {
      return !Object.prototype.hasOwnProperty.call(env, k) || String(env[k]).length === 0;
    });
    process.stdout.write(absent.length ? "ERR flags " + absent.join(",") : "OK");
  ' "$CFG" "$REPO_ROOT" "$MCP_NAME" "$SNOW_MCP_ABS/dist/server.js" "$REQUIRED_KEYS" 2>/dev/null || printf 'ERR probe')"

  case "$verify_out" in
    OK)
      ok "'$MCP_NAME' registered in local scope for $REPO_ROOT"
      ok "entrypoint verified: node $SNOW_MCP_ABS/dist/server.js"
      ok "all $(printf '%s' "$REQUIRED_KEYS" | tr ',' '\n' | grep -c .) required env keys present (names checked, values never read)"
      ;;
    "ERR missing")
      fail "no '$MCP_NAME' entry under projects[\"$REPO_ROOT\"] in $CFG — 'claude mcp add' reported success but wrote nothing this script can find. Check 'claude mcp list' from $REPO_ROOT."
      ;;
    "ERR entry"*)
      fail "the '$MCP_NAME' entry points at '${verify_out#ERR entry }', not $SNOW_MCP_ABS/dist/server.js — a stale registration survived. Remove it with: claude mcp remove $MCP_NAME -s local, then re-run."
      ;;
    "ERR flags"*)
      fail "the '$MCP_NAME' entry is missing env key(s): ${verify_out#ERR flags } — this is exactly the drift that produces a mid-task *_NOT_ENABLED. Re-run: bash scripts/setup.sh --creds-only"
      ;;
    *)
      fail "could not verify the registration in $CFG ($verify_out). Run 'bash scripts/doctor.sh' for the full picture."
      ;;
  esac
fi

echo
echo "SECURITY NOTE: Claude Code stores MCP environment variables in PLAINTEXT in"
echo "$CFG. Prefer a dedicated integration service account with the minimum roles"
echo "the engine needs, and OAuth where the instance supports it. Older backups"
echo "($CFG.bak-*) also contain any previously stored secret — delete the ones you"
echo "no longer need."

# ---------------------------------------------------------------- S13 verify --
step "S13 Verify"
dout="$(run_doctor 2>&1)"; drc=$?
doctor_ran=true
if [[ $drc -eq 127 ]]; then
  warn "scripts/doctor.sh not found — cannot run the closing health check."
  drc=0
  doctor_ran=false
else
  echo "$dout"
fi

echo
echo "RESTART REQUIRED: Claude Code reads MCP registrations at start-up. Quit and"
echo "reopen Claude Code in $REPO_ROOT before the ServiceNow tools appear."
echo
echo "SETUP: Tier $TIER — setup steps: $errors failure(s), $warns warning(s);" \
     "closing health check: $($doctor_ran && { [[ $drc -eq 0 ]] && echo clean || echo "problems found (doctor exit $drc)"; } || echo "NOT RUN (scripts/doctor.sh absent)")."
if [[ $errors -gt 0 ]]; then
  echo "FAIL: a setup step failed — see the FAIL lines above. The registration may be"
  echo "      incomplete; re-run 'bash scripts/setup.sh --creds-only' once fixed."
  exit 1
fi
if [[ $drc -ne 0 ]]; then
  echo "OK: every setup step succeeded and the registration was verified in $CFG."
  echo "FAIL: but scripts/doctor.sh still reports problems (its FAIL lines above)."
  echo "      Some of those clear only after Claude Code is restarted; others are"
  echo "      repo-health findings setup does not fix. Re-run 'bash scripts/doctor.sh'"
  echo "      after restarting to confirm."
  exit 1
fi
echo "OK: setup complete (Tier 1, live instance registered and verified)."
exit 0
