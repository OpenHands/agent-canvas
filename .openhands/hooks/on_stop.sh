#!/usr/bin/env bash
# Stop hook: runs the repo quality gate before allowing OpenHands to finish.
#
# Hooks can block agent completion by exiting with code 2 and returning JSON.
# Keep this aligned with the checks that should run before an agent declares
# repository work complete.

set -o pipefail

PROJECT_DIR="${OPENHANDS_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 1

run_check() {
  local name="$1"
  shift

  echo "=== Running ${name} ===" >&2
  local output
  output=$("$@" 2>&1)
  local exit_code=$?
  echo "$output" >&2

  if [ "$exit_code" -ne 0 ]; then
    local escaped_output
    escaped_output=$(printf '%s' "$output" | jq -Rs .)
    printf '{"decision":"deny","reason":"%s failed","additionalContext":%s}\n' "$name" "$escaped_output"
    exit 2
  fi
}

run_check "npm run lint" npm run lint
run_check "npm test" npm test

echo '{"decision":"allow"}'
