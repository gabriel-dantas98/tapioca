#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVALS_DIR="$SKILL_DIR/evals"
WS="${GOOGLE_SHEETS_EVAL_WORKSPACE:-$HOME/.cursor/skills/google-sheets-apps-script-workspace/iteration-1}"
INTEGRATION_FAILED=0
INTEGRATION_FAILED=0

echo "== Static evals =="
python3 "$EVALS_DIR/run_static.py"

echo ""
echo "== Tab (tabId) behavior evals =="
node "$EVALS_DIR/run_tabid_behavior.js"

echo ""
echo "== Integration evals =="
python3 "$EVALS_DIR/run_integration.py" || INTEGRATION_FAILED=1

echo ""
echo "== Agent behavior evals =="
if [[ -d "$WS" ]]; then
  python3 "$EVALS_DIR/grade_runs.py" "$WS"
else
  echo "SKIP: workspace not found at $WS"
  echo "Create transcripts under {eval_name}/{with_skill|without_skill}/outputs/ then re-run."
fi

exit "$INTEGRATION_FAILED"
