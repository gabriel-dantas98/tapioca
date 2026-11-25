#!/usr/bin/env bash
# Valida shapes jq de plugin.json + marketplace (Claude + Cursor).
# Fonte única: CI (smoke-test.yml) e .agents/skills/smoke-test-skills/run.sh marketplace.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v jq >/dev/null 2>&1 || {
  echo "jq não encontrado no PATH" >&2
  exit 1
}

jq -e '.name == "tapioca" and (.version | length > 0)' .claude-plugin/plugin.json >/dev/null
jq -e '.name == "tapioca" and (.plugins | length > 0) and (.plugins[0].source == "./")' \
  .claude-plugin/marketplace.json >/dev/null
jq -e '.name == "tapioca" and (.plugins | length > 0) and (.plugins[0].source == "./")' \
  .cursor-plugin/marketplace.json >/dev/null
jq -e '.skills == "./skills/" and .agents == "./agents/"' .cursor-plugin/plugin.json >/dev/null