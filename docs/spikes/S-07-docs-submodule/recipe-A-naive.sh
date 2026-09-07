#!/bin/sh
# ARC-00-S09 / S-07 recipe A (naive). Run from the root of a fresh clone of the spike branch.
set -e
cd "$(dirname "$0")/../.."
. spikes/S-07-docs-submodule/recipe-common.sh
AREAS=$(tr '\n' ' ' < spikes/S-07-docs-submodule/docs-areas.txt)
PIN=${PIN:-ba513f2c62d3698ef5bfdd8044110226b8419689}
URL=https://github.com/ServiceNow/ServiceNowDocs
assert_absent
T0=$(now_ms)
git submodule update --init --depth 1 vendor/ServiceNowDocs
git -C vendor/ServiceNowDocs sparse-checkout set --cone $AREAS
T1=$(now_ms); report "A-naive" "$T0" "$T1"
