#!/usr/bin/env bash
# A stand-in for `./snowarch doctor`, so `.claude/skills/snowarch/SKILL.md` can be exercised in a
# real session before ARC-07/ARC-08 build the launcher and the doctor. Copy it into a scratch
# checkout as `./snowarch` (`chmod +x`) and set SNOWARCH_STUB_MODE to the scenario under test:
# live | design-only | unbootstrapped | absent. It answers only the three invocations the skill
# makes, and refuses anything else rather than inventing an answer the real doctor would not give.
set -euo pipefail

MODE="${SNOWARCH_STUB_MODE:-live}"

case "$MODE" in
  live)
    # ARC-06-S09 reconciliation: the BASE Mode line is `modeLine()`'s output and nothing else.
    # The ` — doctor <date> <n> ok` suffix belongs to ARC-08's `modeLineDetailed`, which is the
    # line below; a base line carrying a doctor's date made the two indistinguishable, and four
    # programs quote the base one.
    MODE_LINE='Mode: live — instance=pdi (pdi) preset=pdi-developer'
    DETAILED='Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · 398 tools'
    SUMMARY='DOCTOR: 41 ok, 0 warn, 0 fail' ;;
  design-only)
    MODE_LINE='Mode: design-only'
    DETAILED='Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance'
    SUMMARY='DOCTOR: 38 ok, 1 warn, 0 fail' ;;
  unbootstrapped)
    MODE_LINE='Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)'
    DETAILED="$MODE_LINE"
    SUMMARY='DOCTOR: 0 ok, 0 warn, 2 fail'
    # A summary that counts failures the report never prints is a fixture that teaches the skill
    # nothing — and a session reading it says so. The two FAIL lines carry remedies, one fixable
    # and one not, which is what `doctor --fix` has to be told apart by.
    FAILS='FAIL E-02 repo: vendor/ServiceNowDocs is not checked out — remedy: git submodule update --init (fixable)
FAIL E-05 host: .local/bootstrap-state.json is missing — remedy: run ./bootstrap.sh' ;;
  absent)
    # Node missing, or the launcher not installed: what the skill's step 3 has to handle.
    echo "snowarch: command not found" >&2
    exit 127 ;;
  *)
    echo "stub: unknown SNOWARCH_STUB_MODE '$MODE'" >&2
    exit 2 ;;
esac

[ "${1:-}" = "doctor" ] || { echo "stub: only 'doctor' is stubbed, got '${1:-}'" >&2; exit 2; }
shift

QUICK=no; JSON=no; SECTION=

while [ $# -gt 0 ]; do
  case "$1" in
    --quick) QUICK=yes ;;
    --json) JSON=yes ;;
    --section) SECTION="${2:-}"; shift ;;
    *) echo "stub: unknown flag '$1'" >&2; exit 2 ;;
  esac
  shift
done

if [ "$JSON" = yes ] && [ "$SECTION" = prereqs ]; then
  # The setup-instance prerequisite gate. `nodeMajor` is what decides the halt.
  printf '{"section":"prereqs","nodeMajor":%s,"serverDependencies":"%s","ok":%s}\n' \
    "${SNOWARCH_STUB_NODE_MAJOR:-22}" "${SNOWARCH_STUB_DEPS:-installed}" \
    "$([ "${SNOWARCH_STUB_NODE_MAJOR:-22}" -ge 20 ] && echo true || echo false)"
  exit 0
fi

if [ "$JSON" = yes ]; then
  printf '{"quick":%s,"report":{"modeLine":"%s","modeLineDetailed":"%s","ok":41,"warn":0,"fail":0}}\n' \
    "$([ "$QUICK" = yes ] && echo true || echo false)" "$MODE_LINE" "$DETAILED"
  exit 0
fi

# Text form: the sections the real doctor prints, then the summary, then the Mode line last.
for s in prereqs repo docs roster contract legacy host server; do
  echo "== $s: ok"
done
[ -n "${FAILS:-}" ] && echo "$FAILS"
echo "$SUMMARY"
echo "$MODE_LINE"
