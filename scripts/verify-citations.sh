#!/usr/bin/env bash
# verify-citations.sh
#
# Verifies that every ServiceNowDocs citation path referenced under skills/
# resolves to a real file or directory in the ServiceNowDocs submodule.
# Handles {a,b,c} brace-expansion citations (each member is checked).
#
# Exit 0: all citations resolve (or submodule not populated — see below).
# Exit 1: one or more dead citations.
#
# Portability: if the ServiceNowDocs submodule is not populated (fresh clone
# without `git submodule update --init`), the check is SKIPPED (exit 0) so it
# never blocks a commit on a machine that has not fetched the docs.
#
# Usage: bash scripts/verify-citations.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS="$REPO_ROOT/ServiceNowDocs"
SCAN_DIR="$REPO_ROOT/skills"

if [[ ! -d "$DOCS/markdown" ]]; then
  echo "SKIP: ServiceNowDocs submodule not populated ($DOCS/markdown missing) — citation check skipped."
  exit 0
fi

tmp="$(mktemp)"
grep -rhoE '(ServiceNowDocs/)?markdown/[A-Za-z0-9_./{},-]+' "$SCAN_DIR" 2>/dev/null \
  | sed 's#^ServiceNowDocs/##' | sort -u > "$tmp"

total=0
miss=0
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  # strip trailing markdown/sentence punctuation
  clean="$(echo "$p" | sed 's/[).,;:]*$//')"
  total=$((total + 1))
  if [[ "$clean" == *"{"* ]]; then
    pre="${clean%%\{*}"
    opts="$(echo "$clean" | sed -E 's/.*\{([^}]*)\}.*/\1/')"
    post="${clean##*\}}"
    member_miss=0
    IFS=',' read -ra arr <<< "$opts"
    for o in "${arr[@]}"; do
      [[ -e "$DOCS/${pre}${o}${post}" ]] || { echo "DEAD (brace member): ${pre}${o}${post}"; member_miss=1; }
    done
    [[ $member_miss -eq 1 ]] && miss=$((miss + 1))
  else
    [[ -e "$DOCS/$clean" ]] || { echo "DEAD: $clean"; miss=$((miss + 1)); }
  fi
done < "$tmp"
rm -f "$tmp"

echo "Citations checked: $total | dead: $miss"
if [[ $miss -gt 0 ]]; then
  echo "FAIL: $miss dead ServiceNowDocs citation(s). Remap to a real path before commit."
  exit 1
fi
echo "OK: all ServiceNowDocs citations resolve."
exit 0
