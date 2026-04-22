#!/usr/bin/env bash
# scripts/get-task.sh
# Looks up a Pi task JSON by Beads ID and prints it to stdout.
# Suitable for piping into validate-task.sh.
#
# Usage:
#   get-task.sh <beads-id>
#   get-task.sh <beads-id> | bash scripts/validate-task.sh -
#
# Mapping: tasks/beads-map.json  (beads-id → task-id)
# Source:  tasks/task-batch.json (array of task objects)

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
MAP_FILE="tasks/beads-map.json"
BATCH_FILE="tasks/task-batch.json"

if [[ $# -lt 1 ]]; then
  echo "Usage: ${SCRIPT_NAME} <beads-id>" >&2
  exit 2
fi

BEADS_ID="$1"

if [[ ! -f "$MAP_FILE" ]]; then
  echo "[${SCRIPT_NAME}] ERROR: map file not found: ${MAP_FILE}" >&2
  exit 2
fi

if [[ ! -f "$BATCH_FILE" ]]; then
  echo "[${SCRIPT_NAME}] ERROR: batch file not found: ${BATCH_FILE}" >&2
  exit 2
fi

TASK_ID=$(jq -r --arg id "$BEADS_ID" '.[$id] // empty' "$MAP_FILE")

if [[ -z "$TASK_ID" ]]; then
  echo "[${SCRIPT_NAME}] ERROR: no mapping found for beads ID: ${BEADS_ID}" >&2
  echo "[${SCRIPT_NAME}] Known IDs: $(jq -r 'keys[]' "$MAP_FILE" | tr '\n' ' ')" >&2
  exit 1
fi

TASK_JSON=$(jq --arg tid "$TASK_ID" '.[] | select(.id == $tid)' "$BATCH_FILE")

if [[ -z "$TASK_JSON" ]]; then
  echo "[${SCRIPT_NAME}] ERROR: task ${TASK_ID} not found in ${BATCH_FILE}" >&2
  exit 1
fi

echo "$TASK_JSON"
