#!/bin/sh
# spikes/recipes/no-node.sh -- the macOS "no-node" state (ARC-00-S01 acceptance criterion 5,
# recipe form; architect ruling 2026-09-06 -- macOS is the owner's live laptop and offers no
# VM snapshots).
#
# Removes every PATH entry that contains a `node` executable, then execs the given command with
# the stripped PATH, so that EVERY descendant -- including the MCP server Claude Code spawns from
# .mcp.json with command "node" -- inherits an environment in which node cannot be found.
#
#   ./spikes/recipes/no-node.sh claude
#   ./spikes/recipes/no-node.sh sh -c 'command -v node || echo "node not found"'
#
# It REFUSES to run the command if node survives the strip: a spike must never record a verdict
# against an environment it believes is node-free when it is not.
#
# On Ubuntu the equivalent state is the real snapshot: `multipass restore arc00-ubuntu.no-node`.

# Strip trailing slashes so that "/usr/local/bin/" and "/usr/local/bin" compare equal.
norm() { n=$1; while [ "$n" != "/" ] && [ "${n%/}" != "$n" ]; do n=${n%/}; done; printf '%s\n' "$n"; }

# `while IFS= read -r ... || [ -n "$p" ]` keeps entries containing spaces intact and still
# processes a last line with no trailing newline.
node_dirs=$(which -a node 2>/dev/null | while IFS= read -r p || [ -n "$p" ]; do
    [ -n "$p" ] && norm "$(dirname "$p")"
  done | sort -u)

stripped=$(printf '%s\n' "$PATH" | tr ':' '\n' | while IFS= read -r e || [ -n "$e" ]; do
    if [ -n "$node_dirs" ] && printf '%s\n' "$(norm "$e")" | grep -qxF "$node_dirs"; then continue; fi
    printf '%s\n' "$e"
  done | paste -sd: -)

if ( PATH="$stripped"; export PATH; command -v node >/dev/null 2>&1 ); then
  printf 'no-node.sh: node is still on PATH after stripping -- refusing to run\n' >&2
  exit 1
fi

exec env PATH="$stripped" "$@"
