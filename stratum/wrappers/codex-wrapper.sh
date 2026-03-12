#!/bin/bash
set -euo pipefail

MODEL="${STRATUM_CODEX_MODEL:-gpt-5.3-codex}"

die() { echo "ERROR: $*" >&2; exit 1; }

run_or_die() {
    local label=$1; shift
    local out
    out=$("$@" 2>&1) || die "$label: $out"
    [[ $out == Error:* ]] && die "$out"
    printf '%s' "$out"
}

extract_session_id() {
    sed -n 's/^session id: //p'
}

extract_response() {
    awk '/^codex$/{found=1; next} /^tokens used$/{found=0} found{print}'
}

codex_new() {
    local prompt=$1 effort=${2:-high}
    local out session_id response
    out=$(run_or_die "codex" codex e \
        --sandbox read-only \
        --skip-git-repo-check \
        -c "model=\"$MODEL\"" \
        -c "model_reasoning_effort=\"$effort\"" \
        -c 'model_reasoning_summary="none"' \
        -c 'hide_agent_reasoning=true' \
        -c 'model_verbosity="low"' \
        - <<<"$prompt")
    session_id=$(extract_session_id <<<"$out")
    [[ -n $session_id ]] || die "no session_id in output"
    response=$(extract_response <<<"$out")
    [[ -n $response ]] || die "no response in output"
    echo "$session_id"
    echo "$response"
}

codex_resume() {
    local session_id=$1 prompt=$2 effort=${3:-high}
    local out response
    out=$(run_or_die "codex resume" codex e \
        --sandbox read-only \
        --skip-git-repo-check \
        -c "model=\"$MODEL\"" \
        -c "model_reasoning_effort=\"$effort\"" \
        -c 'model_reasoning_summary="none"' \
        -c 'hide_agent_reasoning=true' \
        -c 'model_verbosity="low"' \
        resume "$session_id" \
        - <<<"$prompt")
    response=$(extract_response <<<"$out")
    if [[ -n $response ]]; then
        echo "$response"
    else
        echo "$out"
    fi
}

case "${1:-}" in
    new) shift; codex_new "$@" ;;
    resume) shift; codex_resume "$@" ;;
    *) echo "Usage: $0 {new|resume} ..." >&2; exit 1 ;;
esac
