#!/usr/bin/env bash
# verify-structure.sh
#
# Mechanical integrity audit of the agents/ and skills/ roster. Catches the
# class of structural drift that behavioural tests (VALIDATION-TESTS.md) do not:
#   1. agents/ + skills/ mirror parity against the .claude/ source of truth
#   2. frontmatter validity (--- + name: + description:) on every SKILL.md + agent
#   3. skill `name:` matches its directory name
#   4. every skills/ + agents/ path referenced in the governing docs exists
#   5. every agent -> adopted skill reference exists
#
# Exit 0: all checks pass. Exit 1: one or more problems (listed).
#
# Usage: bash scripts/verify-structure.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
errors=0

# 1. Mirror parity (delegates to the sync script's check mode)
if ! bash scripts/sync-agents-skills.sh --check > /dev/null 2>&1; then
  echo "FAIL: agents/ and skills/ mirrors out of sync — run: bash scripts/sync-agents-skills.sh"
  errors=$((errors + 1))
fi

# 2. Frontmatter validity: every SKILL.md and agent file
for f in skills/*/SKILL.md agents/*.md; do
  [[ -f "$f" ]] || continue
  [[ "$(head -1 "$f")" == "---" ]] || { echo "FAIL frontmatter (missing ---): $f"; errors=$((errors + 1)); }
  grep -q '^name:' "$f"        || { echo "FAIL frontmatter (missing name:): $f"; errors=$((errors + 1)); }
  grep -q '^description:' "$f" || { echo "FAIL frontmatter (missing description:): $f"; errors=$((errors + 1)); }
done

# 3. skill name: matches directory name
for d in skills/*/; do
  dir="$(basename "$d")"
  nm="$(grep -m1 '^name:' "$d/SKILL.md" 2>/dev/null | sed 's/^name:[[:space:]]*//' | tr -d '\r')"
  [[ "$dir" == "$nm" ]] || { echo "FAIL name/dir mismatch: dir='$dir' name='$nm'"; errors=$((errors + 1)); }
done

# 4. referenced skills/ + agents/ paths in governing docs exist
for doc in CLAUDE.md taxonomy.md governance-rules.md prompt-patterns.md; do
  [[ -f "$doc" ]] || continue
  for p in $(grep -oE '(skills|agents)/[A-Za-z0-9_./-]+\.md' "$doc" | sort -u); do
    [[ -f "$p" ]] || { echo "FAIL dead path ref in $doc: $p"; errors=$((errors + 1)); }
  done
done

# 5. agent -> adopted skill references exist
for a in agents/*.md; do
  for p in $(grep -oE 'skills/[A-Za-z0-9_./-]+\.md' "$a" | sort -u); do
    [[ -f "$p" ]] || { echo "FAIL agent->skill ref in $a: $p"; errors=$((errors + 1)); }
  done
done

# 6. AGENT frontmatter YAML-registration hazard: an unquoted `name:`/`description:`
#    value containing ": " (colon-space) is an invalid YAML plain scalar and
#    silently breaks SUB-AGENT registration (this once made now-assist-specialist
#    non-dispatchable). Empirically agents-only — the skill loader tolerates it
#    (e.g. atf-author "modes: inline" registers fine), so scope to agents/.
for f in agents/*.md; do
  [[ -f "$f" ]] || continue
  while IFS= read -r line; do
    val="${line#*: }"                          # value after the first "key: "
    case "$val" in \"*|\'*) continue ;; esac   # quoted scalar — colons are legal
    if printf '%s' "$val" | grep -qE ': '; then
      echo "FAIL agent frontmatter colon-space (breaks sub-agent registration) in $f: ${line:0:70}..."
      errors=$((errors + 1))
    fi
  done < <(grep -nE '^(name|description): ' "$f" | sed -E 's/^[0-9]+://')
done

if [[ $errors -gt 0 ]]; then
  echo "STRUCTURE: $errors problem(s) found."
  exit 1
fi
echo "OK: structure audit passed (parity, frontmatter, name-match, path refs, agent->skill refs)."
exit 0
