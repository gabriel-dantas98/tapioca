#!/usr/bin/env bash
# Idempotent machine setup for Google Sheets Agent skill.
# Agent runs this on a fresh machine — user never runs it manually.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

need() {
  command -v "$1" >/dev/null 2>&1
}

echo "== Google Sheets Agent setup =="

if ! need python3; then
  echo "ERROR: python3 not found. Install Python 3.10+ first."
  exit 1
fi

echo "python3: $(python3 --version)"

if ! python3 -m pip --version >/dev/null 2>&1; then
  echo "ERROR: pip not available for python3"
  exit 1
fi

echo "== playwright =="
python3 -m pip install -q --upgrade pip
python3 -m pip install -q playwright pillow
python3 -m playwright install chromium

echo "== skill paths =="
mkdir -p "$HOME/.config/google-sheets-agent"

if [[ ! -f "$SKILL_DIR/scripts/sheets_agent.py" ]]; then
  echo "WARN: skill not at $SKILL_DIR — run install.sh from gist first"
fi

echo "Setup complete."
python3 "$SKILL_DIR/scripts/sheets_agent.py" setup --check-only 2>/dev/null || true
