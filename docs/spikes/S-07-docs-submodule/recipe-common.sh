#!/bin/sh
# Shared measurement tail for the three S-07 recipes (ARC-00-S09).
# Prints one machine-readable line per field so a CI log can be scraped.
report() {
  RECIPE=$1; T0=$2; T1=$3
  echo "S07_RECIPE=$RECIPE"
  echo "S07_WALL_MS=$((T1 - T0))"
  echo "S07_SIZE_TOTAL=$(du -sk vendor/ServiceNowDocs 2>/dev/null | cut -f1) KB"
  if [ -d vendor/ServiceNowDocs/.git ]; then
    echo "S07_SIZE_GIT=$(du -sk vendor/ServiceNowDocs/.git | cut -f1) KB (in-tree .git)"
  else
    echo "S07_SIZE_GIT=$(du -sk .git/modules/vendor/ServiceNowDocs 2>/dev/null | cut -f1) KB (.git/modules)"
  fi
  echo "S07_FILES_TRACKED=$(git -C vendor/ServiceNowDocs ls-files | wc -l | tr -d ' ')"
  # -not -path '*/.git/*' excludes the CONTENTS of a .git directory, but after `absorbgitdirs` the
  # submodule's .git is a 49-byte pointer FILE, so it must be excluded by name as well. Without this the
  # count is one higher than `git ls-files -v | grep -vc '^S'`, which is the number it should match.
  echo "S07_FILES_ON_DISK=$(find vendor/ServiceNowDocs -type f -not -path '*/.git/*' -not -name .git | wc -l | tr -d ' ')"
  echo "S07_FILES_MATERIALISED=$(git -C vendor/ServiceNowDocs ls-files -v | grep -vc '^S')"
  echo "S07_HEAD=$(git -C vendor/ServiceNowDocs rev-parse HEAD)"
  echo "S07_STATUS_PORCELAIN=[$(git -C vendor/ServiceNowDocs status --porcelain | head -3 | tr '\n' ';')]"
  echo "S07_GIT_VERSION=$(git --version)"
  # The superproject's view, not the submodule's. A leading '-' from `git submodule status` means the
  # submodule is NOT initialised -- which a clean `git status` inside the submodule does not reveal.
  echo "S07_SUPERPROJECT_STATUS=[$(git status --porcelain | head -3 | tr '\n' ';')]"
  echo "S07_SUBMODULE_STATUS=[$(git submodule status 2>&1 | head -1)]"
}
# Every recipe asserts a clean start (acceptance criterion 5).
assert_absent() {
  rm -rf vendor/ServiceNowDocs .git/modules/vendor 2>/dev/null || true
  [ ! -e vendor/ServiceNowDocs ] || { echo "ABORT: vendor/ServiceNowDocs still present"; exit 1; }
  echo "S07_PRECHECK=vendor/ServiceNowDocs absent"
}
now_ms() { node -e 'console.log(Date.now())' 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))'; }
