#!/usr/bin/env bash
# scripts/context-builder.sh
# Generates a context slice (map + scope) from the codebase for a module.
#
# Usage — pre-planning (run BEFORE tasks exist, CLAUDE.md step 1):
#   context-builder.sh --module <name> [--repo <path>]
#
# Usage — post-batch (re-run after tasks/task-batch.json is written to enrich scope):
#   context-builder.sh --task <file.json>  [--module <name>] [--repo <path>]
#   context-builder.sh --batch <file.json> [--module <name>] [--repo <path>]
#
# Output:
#   modules/{module-name}/context-slice.json   (gitignored)
#
# Dependencies: jq, repomix
# Prefer bun/bash; no Node required.

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
REPO_ROOT="."
MODULE_NAME=""
TASK_FILE=""
BATCH_FILE=""

# ── argument parsing ──────────────────────────────────────────────────────────
usage() {
  echo "Usage:" >&2
  echo "  ${SCRIPT_NAME} --module <name> [--repo <path>]                        # pre-planning" >&2
  echo "  ${SCRIPT_NAME} --task  <file.json> [--module <name>] [--repo <path>]" >&2
  echo "  ${SCRIPT_NAME} --batch <file.json> [--module <name>] [--repo <path>]" >&2
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

# --module alone is valid (pre-planning mode); require at least one arg
if [[ -z "$TASK_FILE" && -z "$BATCH_FILE" && -z "$MODULE_NAME" ]]; then
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
MAP_SCHEMA="${REPO_ROOT}/config/repomix-map-schema.json"
SCOPE_SCHEMA="${REPO_ROOT}/config/repomix-scope-schema.json"

PRE_PLANNING=false
if [[ -z "$TASK_FILE" && -z "$BATCH_FILE" ]]; then
  PRE_PLANNING=true
fi

IS_BATCH=false
INPUT_FILE=""

if [[ "$PRE_PLANNING" == false ]]; then
  if [[ -n "$BATCH_FILE" ]]; then
    INPUT_FILE="$BATCH_FILE"
    IS_BATCH=true
  else
    INPUT_FILE="$TASK_FILE"
  fi

  if [[ ! -f "$INPUT_FILE" ]]; then
    echo "[${SCRIPT_NAME}] ERROR: input file not found: ${INPUT_FILE}" >&2
    exit 2
  fi
fi

# ── infer module name if not provided ─────────────────────────────────────────
if [[ -z "$MODULE_NAME" ]]; then
  if [[ "$IS_BATCH" == true ]]; then
    MODULE_NAME=$(jq -r '[.[].module // empty] | first // "unknown"' "$INPUT_FILE" 2>/dev/null || echo "unknown")
  elif [[ -n "$INPUT_FILE" ]]; then
    MODULE_NAME=$(jq -r '.module // "unknown"' "$INPUT_FILE" 2>/dev/null || echo "unknown")
  else
    echo "[${SCRIPT_NAME}] ERROR: --module is required when no task/batch file is provided." >&2
    exit 2
  fi
fi

MODULE_DIR="${REPO_ROOT}/modules/${MODULE_NAME}"
ARCH_MODULE="${MODULE_DIR}/architecture.md"
OUTPUT_FILE="${MODULE_DIR}/context-slice.json"

mkdir -p "$MODULE_DIR"

# ── collect files and key_functions from task(s) ──────────────────────────────
if [[ "$PRE_PLANNING" == true ]]; then
  RELEVANT_FILES=""
  KEY_FUNCTIONS=""
  TASK_IDS="pre-planning"
elif [[ "$IS_BATCH" == true ]]; then
  RELEVANT_FILES=$(jq -r '[.[].files // [] | .[]] | unique | .[]' "$INPUT_FILE" 2>/dev/null || true)
  KEY_FUNCTIONS=$(jq -r '[.[].key_functions // [] | .[]] | unique | .[]' "$INPUT_FILE" 2>/dev/null || true)
  TASK_IDS=$(jq -r '[.[].id] | join(", ")' "$INPUT_FILE" 2>/dev/null || echo "batch")
else
  RELEVANT_FILES=$(jq -r '.files // [] | .[]' "$INPUT_FILE" 2>/dev/null || true)
  KEY_FUNCTIONS=$(jq -r '.key_functions // [] | .[]' "$INPUT_FILE" 2>/dev/null || true)
  TASK_IDS=$(jq -r '.id // "unknown"' "$INPUT_FILE" 2>/dev/null || echo "unknown")
fi

# ── temp file setup ───────────────────────────────────────────────────────────
MAP_TMP="$(mktemp /tmp/repomix-map-XXXXXX.txt)"
SCOPE_TMP="$(mktemp /tmp/repomix-scope-XXXXXX.txt)"
SCOPE_CFG_TMP="$(mktemp /tmp/repomix-scope-cfg-XXXXXX.json)"
MAP_CFG_TMP="$(mktemp /tmp/repomix-map-cfg-XXXXXX.json)"
trap 'rm -f "$MAP_TMP" "$SCOPE_TMP" "$SCOPE_CFG_TMP" "$MAP_CFG_TMP"' EXIT

# ── map generation (compressed global view) ───────────────────────────────────
CODE_MAP=""
if [[ -f "$MAP_SCHEMA" ]]; then
  jq --arg out "$MAP_TMP" '.output.filePath = $out' "$MAP_SCHEMA" > "$MAP_CFG_TMP"
  repomix --config "$MAP_CFG_TMP" --compress 2>/dev/null || true
  [[ -f "$MAP_TMP" ]] && CODE_MAP=$(cat "$MAP_TMP")
else
  echo "[${SCRIPT_NAME}] WARN: map schema not found at ${MAP_SCHEMA}; skipping map generation." >&2
fi

# ── scope generation (dynamic, task-module-specific) ─────────────────────────
CODE_SCOPE=""
if [[ -f "$SCOPE_SCHEMA" ]]; then
  # Base includes: general/ always in scope
  DYNAMIC_INCLUDES='["general/**"]'

  # Add the module directory
  if [[ -n "$MODULE_NAME" && "$MODULE_NAME" != "unknown" ]]; then
    DYNAMIC_INCLUDES=$(echo "$DYNAMIC_INCLUDES" | jq --arg m "modules/${MODULE_NAME}/**" '. + [$m]')
  fi

  if [[ "$PRE_PLANNING" == true ]]; then
    # Pre-planning: include all packages so the Planner can see existing structure as reference
    DYNAMIC_INCLUDES=$(echo "$DYNAMIC_INCLUDES" | jq '. + ["packages/**"]')
  else
    # Task mode: add only the explicit file paths from the task
    while IFS= read -r f; do
      [[ -n "$f" ]] && DYNAMIC_INCLUDES=$(echo "$DYNAMIC_INCLUDES" | jq --arg f "$f" '. + [$f]')
    done <<< "$RELEVANT_FILES"
  fi

  jq --arg out "$SCOPE_TMP" \
     --argjson inc "$DYNAMIC_INCLUDES" \
     '.output.filePath = $out | .include = $inc' \
     "$SCOPE_SCHEMA" > "$SCOPE_CFG_TMP"

  repomix --config "$SCOPE_CFG_TMP" 2>/dev/null || true
  [[ -f "$SCOPE_TMP" ]] && CODE_SCOPE=$(cat "$SCOPE_TMP")
else
  echo "[${SCRIPT_NAME}] WARN: scope schema not found at ${SCOPE_SCHEMA}; skipping scope generation." >&2
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
# Filter empty lines before building arrays to avoid [""] in pre-planning mode
# (grep returns exit 1 on no match; suppress with || true inside subshell)
RELEVANT_FILES_ARR=$(echo "$RELEVANT_FILES" | { grep -v '^$' || true; } | jq -R . | jq -s .)
KEY_FUNCTIONS_ARR=$(echo "$KEY_FUNCTIONS"   | { grep -v '^$' || true; } | jq -R . | jq -s .)

jq -n \
  --arg task_ids         "$TASK_IDS" \
  --arg module           "$MODULE_NAME" \
  --argjson relevant_files "$RELEVANT_FILES_ARR" \
  --argjson key_functions  "$KEY_FUNCTIONS_ARR" \
  --arg code_map         "$CODE_MAP" \
  --arg code_scope       "$CODE_SCOPE" \
  --arg arch_general     "$ARCH_GENERAL_CONTENT" \
  --arg arch_module      "$ARCH_MODULE_CONTENT" \
  --arg generated_at     "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    generated_at:          $generated_at,
    task_ids:              $task_ids,
    module:                $module,
    relevant_files:        $relevant_files,
    key_functions:         $key_functions,
    code_map:              $code_map,
    code_scope:            $code_scope,
    architecture_summary: {
      general: $arch_general,
      module:  $arch_module
    }
  }' > "$OUTPUT_FILE"

echo "[${SCRIPT_NAME}] OK: context slice written to ${OUTPUT_FILE}"
