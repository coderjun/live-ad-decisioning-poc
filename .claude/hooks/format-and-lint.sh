#!/bin/sh
# PostToolUse hook: format the file Claude just edited, then report any lint errors back to Claude.
# Exit code 2 sends stderr to Claude so it fixes the problem; anything else stays silent.
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts|*.tsx|*.js|*.mjs|*.json|*.jsonc) ;;
  *) exit 0 ;;
esac
cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! out=$(pnpm exec biome check --write --no-errors-on-unmatched "$file" 2>&1); then
  printf 'Biome found problems in %s:\n%s\n' "$file" "$out" >&2
  exit 2
fi
