#!/usr/bin/env bash
# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
# render-pdf.sh — macOS/Linux companion to render-pdf-pages.ps1 (which uses Word COM on Windows).
# Renders a .docx (or .md, via md-to-docx.py) to PDF using LibreOffice headless, for visual QA.
#
# Usage:
#   scripts/render-pdf.sh <file.docx> [outdir]
#   scripts/render-pdf.sh <file.md>  [outdir]   # converts md -> docx -> pdf
#
# Requires LibreOffice: `soffice` on PATH, or on macOS the app in /Applications or, where a person without administrator rights copied it
# from its disk image, in ~/Applications.

# pick CANDIDATE — SOFFICE becomes CANDIDATE when nothing was found yet and CANDIDATE can be run. It always succeeds: the script runs under set -e.
pick() { if [[ -z "$SOFFICE" && -x "$1" ]]; then SOFFICE="$1"; fi; }

# find_soffice — set SOFFICE to LibreOffice's command line tool, or say why not and return 3. It only LOOKS: it never starts anything, which is
# what lets the tests source this file and ask where it would look (ARC-09-C301; scripts/render-drawio.sh does the same with find_drawio).
find_soffice() {
  # PATH first, then the places a Mac's install lands, in order. A variable that is unset or empty adds no place: it must never become a path at the root.
  SOFFICE="$(command -v soffice || true)"
  pick "/Applications/LibreOffice.app/Contents/MacOS/soffice"
  # The user's own Applications folder comes after the Mac's, so that a Mac which found LibreOffice before keeps finding the same one: the place only fills a gap.
  if [[ -n "${HOME:-}" ]]; then
    pick "$HOME/Applications/LibreOffice.app/Contents/MacOS/soffice"
  fi
  [[ -n "$SOFFICE" ]] && return 0
  echo "ERROR: LibreOffice (soffice) not found. Install it (brew install --cask libreoffice) to render PDFs on Mac." >&2
  return 3
}

# Sourced (the tests do), the file stops here: find_soffice is defined and nothing has run.
[[ "${BASH_SOURCE[0]:-}" != "$0" ]] && return 0

set -euo pipefail

SRC="${1:?usage: render-pdf.sh <file.docx|file.md> [outdir]}"
OUTDIR="${2:-$(dirname "$SRC")}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# locate soffice
find_soffice || exit $?

# if given a .md, convert to .docx first
if [[ "$SRC" == *.md ]]; then
  DOCX="${SRC%.md}.docx"
  python3 "$HERE/md-to-docx.py" --src "$SRC" --out "$DOCX"
  SRC="$DOCX"
fi

mkdir -p "$OUTDIR"
# headless conversion needs an isolated profile to avoid clashing with a running LibreOffice
PROFILE="$(mktemp -d)"
"$SOFFICE" --headless "-env:UserInstallation=file://$PROFILE" \
  --convert-to pdf --outdir "$OUTDIR" "$SRC" >/dev/null
rm -rf "$PROFILE"

PDF="$OUTDIR/$(basename "${SRC%.*}").pdf"
echo "OK: wrote $PDF ($(wc -c < "$PDF" | tr -d ' ') bytes)"
