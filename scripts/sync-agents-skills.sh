#!/usr/bin/env bash
# sync-agents-skills.sh
#
# Keeps agents/ and skills/ (repo root mirrors) in sync with
# .claude/agents/ and .claude/skills/ (the source of truth).
#
# Usage:
#   bash scripts/sync-agents-skills.sh          # sync (copy source → mirror)
#   bash scripts/sync-agents-skills.sh --check  # check only, exit 1 if out of sync
#
# Source of truth : .claude/agents/  and  .claude/skills/
# Mirrors         : agents/          and  skills/
#
# Rationale: Claude Code reads skills and agents from .claude/ at runtime.
# The repo root mirrors exist so the files are visible in GitHub without
# navigating into the hidden .claude/ directory.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_AGENTS="$REPO_ROOT/.claude/agents"
SOURCE_SKILLS="$REPO_ROOT/.claude/skills"
MIRROR_AGENTS="$REPO_ROOT/agents"
MIRROR_SKILLS="$REPO_ROOT/skills"

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

errors=0

check_or_sync() {
  local src="$1"
  local dst="$2"
  local label="$3"

  if [[ ! -d "$src" ]]; then
    echo "SKIP: $label source directory not found ($src)"
    return
  fi

  # Find files in source
  while IFS= read -r -d '' src_file; do
    rel="${src_file#$src/}"
    dst_file="$dst/$rel"

    if [[ ! -f "$dst_file" ]]; then
      if $CHECK_ONLY; then
        echo "MISSING in mirror: $label/$rel"
        ((errors++)) || true
      else
        mkdir -p "$(dirname "$dst_file")"
        cp "$src_file" "$dst_file"
        echo "ADDED: $label/$rel"
      fi
    elif ! diff -q "$src_file" "$dst_file" > /dev/null 2>&1; then
      if $CHECK_ONLY; then
        echo "DIFFERS: $label/$rel"
        ((errors++)) || true
      else
        cp "$src_file" "$dst_file"
        echo "UPDATED: $label/$rel"
      fi
    fi
  done < <(find "$src" -type f -print0)

  # Find files in mirror that no longer exist in source
  if [[ -d "$dst" ]]; then
    while IFS= read -r -d '' dst_file; do
      rel="${dst_file#$dst/}"
      src_file="$src/$rel"
      if [[ ! -f "$src_file" ]]; then
        if $CHECK_ONLY; then
          echo "STALE in mirror: $label/$rel"
          ((errors++)) || true
        else
          rm "$dst_file"
          echo "REMOVED stale: $label/$rel"
        fi
      fi
    done < <(find "$dst" -type f -print0)
  fi
}

check_or_sync "$SOURCE_AGENTS" "$MIRROR_AGENTS" "agents"
check_or_sync "$SOURCE_SKILLS" "$MIRROR_SKILLS" "skills"

if $CHECK_ONLY; then
  if [[ $errors -eq 0 ]]; then
    echo "OK: agents/ and skills/ mirrors are in sync"
    exit 0
  else
    echo "FAIL: $errors file(s) out of sync — run: bash scripts/sync-agents-skills.sh"
    exit 1
  fi
else
  echo "Sync complete."
fi
