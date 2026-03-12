#!/bin/bash
set -euo pipefail

GEMINI_CMD="${STRATUM_GEMINI_CMD:-gemini}"

die() { echo "ERROR: $*" >&2; exit 1; }

session_id() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import uuid
print("gemini-" + uuid.uuid4().hex[:12])
PY
  else
    echo "gemini-$(date +%s)"
  fi
}

run_prompt() {
  local prompt=$1
  "$GEMINI_CMD" -p "$prompt" 2>&1 || die "gemini invocation failed"
}

gemini_new() {
  local prompt=$1
  local sid
  sid=$(session_id)
  echo "$sid"
  run_prompt "$prompt"
}

gemini_resume() {
  local _session_id=$1 prompt=$2
  run_prompt "$prompt"
}

case "${1:-}" in
  new) shift; gemini_new "$@" ;;
  resume) shift; gemini_resume "$@" ;;
  *) echo "Usage: $0 {new|resume} ..." >&2; exit 1 ;;
esac
