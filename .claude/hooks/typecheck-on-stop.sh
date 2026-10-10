#!/bin/sh
# Stop hook: before Claude finishes a turn, the workspace must typecheck.
# On failure, exit code 2 keeps Claude working with the errors; stop_hook_active prevents a loop.
[ "$(jq -r '.stop_hook_active')" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! out=$(pnpm -s typecheck 2>&1); then
  printf 'Typecheck failed. Fix these before finishing:\n%s\n' "$out" >&2
  exit 2
fi
