#!/usr/bin/env bash
# scripts/context-builder.sh
# Prerequisite for Claude planning sessions.
# Generates a minimal context slice from the codebase for a given task (or task batch).
#
# Usage:
#   context-builder.sh --task <task-file.json> [--module <module-name>] [--repo <repo-root>]
#   context-builder.sh --batch <task-batch.json> [--module <module-name>] [--repo <repo-root>]
#
# Output:
#   modules/{module-name}/context-slice.json   (gitignored)
#
# Dependencies: jq, repomix (with --tree-sitter support)
# Prefer bun/bash; no Node required.

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
REPO_ROOT="."
MODULE_NAME=""
TASK_FILE=""
BATCH_FILE=""

# ── argument parsing ──────────────────────────────────────────────────────────
usage() {
  echo "Usage: ${SCRIPT_NAME} --task <file.json> | --batch <file.json> [--module <name>] [--repo <path>]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)    TASK_FILE="$2";   shift 2 ;;
    --batch)   BATCH_FILE="$2";  shift 2 ;;
    --module)  MODULE_NAME="$2"; shift 2 ;;
    --repo)    REPO_ROOT="$2";   shift 2 ;;
    *)         usage ;;
  esac
done

if [[ -z "$TASK_FILE" && -z "$BATCH_FILE" ]]; then
  usage
fi

# ── dependency checks ─────────────────────────────────────────────────────────
for dep in jq repomix; do
  if ! command -v "$dep" &>/dev/null; then
    echo "[${SCRIPT_NAME}] ERROR: '${dep}' is required but not found in PATH." >&2
    exit 2
  fi
done

# ── resolve paths ─────────────────────────────────────────────────────────────
ARCH_GENERAL="${REPO_ROOT}/general/ARCHITECTURE.md"

if [[ -n "$BATCH_FILE" ]]; then
  INPUT_FILE="$BATCH_FILE"
  IS_BATCH=true
else
  INPUT_FILE="$TASK_FILE"
  IS_BATCH=false
fi

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "[${SCRIPT_NAME}] ERROR: input file not found: ${INPUT_FILE}" >&2
  exit 2
fi

# ── infer module name if not provided ─────────────────────────────────────────
if [[ -z "$MODULE_NAME" ]]; then
  if [[ "$IS_BATCH" == true ]]; then
    MODULE_NAME=$(jq -r '[.[].module // empty] | first // "unknown"' "$INPUT_FILE" 2>/dev/null || echo "unknown")
  else
    MODULE_NAME=$(jq -r '.module // "unknown"' "$INPUT_FILE" 2>/dev/null || echo "unknown")
  fi
fi

MODULE_DIR="${REPO_ROOT}/modules/${MODULE_NAME}"
ARCH_MODULE="${MODULE_DIR}/architecture.md"
OUTPUT_FILE="${MODULE_DIR}/context-slice.json"

mkdir -p "$MODULE_DIR"

# ── collect files and key_functions from task(s) ──────────────────────────────
if [[ "$IS_BATCH" == true ]]; then
  RELEVANT_FILES=$(jq -r '[.[].files // [] | .[]] | unique | .[]' "$INPUT_FILE" 2>/dev/null || true)
  KEY_FUNCTIONS=$(jq -r '[.[].key_functions // [] | .[]] | unique | .[]' "$INPUT_FILE" 2>/dev/null || true)
  TASK_IDS=$(jq -r '[.[].id] | join(", ")' "$INPUT_FILE" 2>/dev/null || echo "batch")
else
  RELEVANT_FILES=$(jq -r '.files // [] | .[]' "$INPUT_FILE" 2>/dev/null || true)
  KEY_FUNCTIONS=$(jq -r '.key_functions // [] | .[]' "$INPUT_FILE" 2>/dev/null || true)
  TASK_IDS=$(jq -r '.id // "unknown"' "$INPUT_FILE" 2>/dev/null || echo "unknown")
fi

# ── build repomix include list ─────────────────────────────────────────────────
REPOMIX_TMP="$(mktemp /tmp/repomix-out-XXXXXX.txt)"
trap 'rm -f "$REPOMIX_TMP"' EXIT

INCLUDE_PATHS=()
while IFS= read -r f; do
  [[ -n "$f" ]] && INCLUDE_PATHS+=("${REPO_ROOT}/${f}")
done <<< "$RELEVANT_FILES"

if [[ ${#INCLUDE_PATHS[@]} -eq 0 ]]; then
  echo "[${SCRIPT_NAME}] WARN: no files listed in task(s); running repomix on full repo." >&2
  repomix --tree-sitter --output "$REPOMIX_TMP" "$REPO_ROOT" 2>/dev/null || true
else
  repomix --tree-sitter --output "$REPOMIX_TMP" "${INCLUDE_PATHS[@]}" 2>/dev/null || true
fi

RAW_SKELETON=""
if [[ -f "$REPOMIX_TMP" ]]; then
  RAW_SKELETON=$(cat "$REPOMIX_TMP")
fi

# ── load architecture summaries ───────────────────────────────────────────────
ARCH_GENERAL_CONTENT=""
if [[ -f "$ARCH_GENERAL" ]]; then
  ARCH_GENERAL_CONTENT=$(cat "$ARCH_GENERAL")
else
  echo "[${SCRIPT_NAME}] WARN: general/ARCHITECTURE.md not found at ${ARCH_GENERAL}" >&2
fi

ARCH_MODULE_CONTENT=""
if [[ -f "$ARCH_MODULE" ]]; then
  ARCH_MODULE_CONTENT=$(cat "$ARCH_MODULE")
else
  echo "[${SCRIPT_NAME}] WARN: module architecture not found at ${ARCH_MODULE}" >&2
fi

# ── build output JSON ─────────────────────────────────────────────────────────
# jq handles all JSON escaping; bash variables are passed via --arg / --argjson.

RELEVANT_FILES_ARR=$(echo "$RELEVANT_FILES" | jq -R . | jq -s .)
KEY_FUNCTIONS_ARR=$(echo "$KEY_FUNCTIONS"   | jq -R . | jq -s .)

jq -n \
  --arg task_ids         "$TASK_IDS" \
  --arg module           "$MODULE_NAME" \
  --argjson relevant_files "$RELEVANT_FILES_ARR" \
  --argjson key_functions  "$KEY_FUNCTIONS_ARR" \
  --arg skeleton         "$RAW_SKELETON" \
  --arg arch_general     "$ARCH_GENERAL_CONTENT" \
  --arg arch_module      "$ARCH_MODULE_CONTENT" \
  --arg generated_at     "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    generated_at:          $generated_at,
    task_ids:              $task_ids,
    module:                $module,
    relevant_files:        $relevant_files,
    key_functions:         $key_functions,
    code_skeleton:         $skeleton,
    architecture_summary: {
      general: $arch_general,
      module:  $arch_module
    }
  }' > "$OUTPUT_FILE"

echo "[${SCRIPT_NAME}] OK: context slice written to ${OUTPUT_FILE}"