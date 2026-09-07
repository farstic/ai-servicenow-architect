#!/bin/sh
# ARC-00-S09 / S-07 recipe C (direct). Run from the root of a fresh clone of the spike branch.
set -e
cd "$(dirname "$0")/../.."
. spikes/S-07-docs-submodule/recipe-common.sh
AREAS=$(tr '\n' ' ' < spikes/S-07-docs-submodule/docs-areas.txt)
# Read the pin from the GITLINK the checkout actually carries, so running this on the tip-control
# branch measures the tip. Hardcoding a default made the tip-control C row silently measure the pin
# unless PIN= was exported (it was, for the recorded runs — but a stranger would not know to).
PIN=${PIN:-$(git rev-parse HEAD:vendor/ServiceNowDocs)}
URL=https://github.com/ServiceNow/ServiceNowDocs
assert_absent
T0=$(now_ms)
mkdir -p vendor
git clone --filter=blob:none --no-checkout --depth 1 --sparse --branch australia "$URL" vendor/ServiceNowDocs
git -C vendor/ServiceNowDocs sparse-checkout set --cone $AREAS
git -C vendor/ServiceNowDocs fetch --depth 1 origin "$PIN"
git -C vendor/ServiceNowDocs checkout "$PIN"
git submodule absorbgitdirs || echo "S07_NOTE=absorbgitdirs skipped (no gitlink yet)"
# A direct clone + absorbgitdirs never registers the submodule in .git/config, so the SUPERPROJECT
# reports it uninitialised ('-' prefix in `git submodule status`) even though the tree is complete.
# This fifth step is what ARC-03 must document; without it any `git submodule` command, and any doctor
# check built on `git submodule status`, reports a correctly populated corpus as missing.
git submodule init
T1=$(now_ms); report "C-direct" "$T0" "$T1"
echo "S07_SUBMODULE_STATUS=[$(git submodule status | head -1)]"
