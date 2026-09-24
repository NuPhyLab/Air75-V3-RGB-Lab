#!/bin/sh
# NuPhyLab Claude Code status hook launcher.
#
# Resolves a Node runtime, then hands the hook payload to the worker next to it.
# Exits 0 with an empty JSON object whenever anything is missing so Claude Code
# is never blocked and no permission decision is changed.
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || { printf '{}'; exit 0; }
SPOOL="$1"
NODE=""
if [ -r "$DIR/node-path" ]; then
  while IFS= read -r candidate || [ -n "$candidate" ]; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then NODE="$candidate"; break; fi
  done < "$DIR/node-path"
fi
if [ -z "$NODE" ]; then NODE=$(command -v node 2>/dev/null); fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then printf '{}'; exit 0; fi
NUPHYLAB_HOOK_PID=$PPID exec "$NODE" "$DIR/nuphylab-claude-hook.mjs" "$SPOOL"
