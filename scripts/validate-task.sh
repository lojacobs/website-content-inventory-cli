#!/usr/bin/env bash
# scripts/validate-task.sh
# Validates a single task object against config/task-schema.json.
# Used by Claude (pre-add) and the Orchestrator (pre-assign).
#
# Usage:
#   validate-task.sh <task-file.json>          # validate a file on disk
#   echo '<json>' | validate-task.sh -          # validate from stdin
#
# Exit codes:
#   0  — valid
#   1  — validation failure (human-readable errors printed to stderr)
#   2  — usage / dependency error

set -euo pipefail

SCHEMA_PATH="$(dirname "$0")/../config/task-schema.json"
SCRIPT_NAME="$(basename "$0")"

# ── dependency check ──────────────────────────────────────────────────────────
if ! command -v bun &>/dev/null && ! command -v node &>/dev/null; then
  echo "[${SCRIPT_NAME}] ERROR: bun or node is required but not found in PATH." >&2
  exit 2
fi

if ! command -v ajv &>/dev/null; then
  # Try npx / bunx as fallback
  if command -v bunx &>/dev/null; then
    AJV="bunx ajv-cli"
  elif command -v npx &>/dev/null; then
    AJV="npx --yes ajv-cli"
  else
    echo "[${SCRIPT_NAME}] ERROR: ajv-cli not found. Install with: bun add -g ajv-cli" >&2
    exit 2
  fi
else
  AJV="ajv"
fi

# ── input handling ────────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: ${SCRIPT_NAME} <task-file.json | ->" >&2
  exit 2
fi

if [[ "$1" == "-" ]]; then
  TASK_FILE="$(mktemp /tmp/task-validate-XXXXXX.json)"
  trap 'rm -f "$TASK_FILE"' EXIT
  cat > "$TASK_FILE"
else
  TASK_FILE="$1"
  if [[ ! -f "$TASK_FILE" ]]; then
    echo "[${SCRIPT_NAME}] ERROR: file not found: ${TASK_FILE}" >&2
    exit 2
  fi
fi

# ── schema existence check ────────────────────────────────────────────────────
if [[ ! -f "$SCHEMA_PATH" ]]; then
  echo "[${SCRIPT_NAME}] ERROR: schema not found at ${SCHEMA_PATH}" >&2
  exit 2
fi

# ── structural pre-check (bash-level, no deps) ────────────────────────────────
# Catch the most common issues before invoking ajv, so error messages are clear.

TASK_ID=""
if command -v jq &>/dev/null; then
  TASK_ID=$(jq -r '.id // "unknown"' "$TASK_FILE" 2>/dev/null || echo "unknown")

  # Title length guard
  TITLE_LEN=$(jq -r '.title // "" | length' "$TASK_FILE" 2>/dev/null || echo 0)
  if [[ "$TITLE_LEN" -gt 80 ]]; then
    echo "[${SCRIPT_NAME}] FAIL [${TASK_ID}]: title exceeds 80 characters (${TITLE_LEN})." >&2
    exit 1
  fi

  # dependency self-reference guard
  SELF_DEP=$(jq --arg id "$TASK_ID" '
    .dependencies // [] | map(select(. == $id)) | length
  ' "$TASK_FILE" 2>/dev/null || echo 0)
  if [[ "$SELF_DEP" -gt 0 ]]; then
    echo "[${SCRIPT_NAME}] FAIL [${TASK_ID}]: task lists itself as a dependency." >&2
    exit 1
  fi
fi

# ── JSON Schema validation ────────────────────────────────────────────────────
ERRORS=$(${AJV} validate -s "$SCHEMA_PATH" -d "$TASK_FILE" 2>&1) || {
  echo "[${SCRIPT_NAME}] FAIL [${TASK_ID:-?}]: schema validation errors:" >&2
  echo "$ERRORS" >&2
  exit 1
}

echo "[${SCRIPT_NAME}] OK [${TASK_ID:-?}]: task is valid."
exit 0