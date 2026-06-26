#!/usr/bin/env bash
# Smoke test local das skills do tapioca via prompt one-shot nos dois CLIs alvo.
# Fonte única: o CI (.github/workflows/smoke-test.yml) chama este mesmo script.
#
# Uso: run.sh <skill> <engine>
#   skill  = humanizer-br | usabilidade-br | multi-gen
#   engine = claude | cursor | both   (default: both)
#
# Exit: 0 passou · 1 falhou · 2 skip (binário ausente ou sem auth)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"   # .agents/skills/smoke-test-skills -> raiz do repo
OUT_DIR="/tmp/tapioca-smoke"
mkdir -p "$OUT_DIR"

SKILL="${1:-humanizer-br}"
ENGINE="${2:-both}"

log()  { printf '\033[1m[smoke]\033[0m %s\n' "$*"; }
skip() { printf '\033[33m[skip]\033[0m  %s\n' "$*"; exit 2; }
fail() { printf '\033[31m[fail]\033[0m  %s\n' "$*" >&2; exit 1; }
pass() { printf '\033[32m[pass]\033[0m  %s\n' "$*"; }

# prompt one-shot por (skill, engine). Claude carrega via --plugin-dir;
# cursor-agent recebe o caminho do SKILL.md no próprio prompt.
prompt_for() {
  local skill="$1" engine="$2"
  case "$skill" in
    humanizer-br)
      if [ "$engine" = "claude" ]; then
        echo "Use a skill /tapioca:humanizer-br para analisar e humanizar o texto em tests/fixtures/ai-flavored.md. Liste os padrões de IA detectados no texto (mencione cada categoria pelo nome) e em seguida apresente a versão reescrita. Não use emojis no output."
      else
        echo "Leia tests/fixtures/ai-flavored.md, leia skills/humanizer-br/SKILL.md, e aplique a skill no texto da fixture. Liste os padrões de IA detectados (mencione cada categoria pelo nome) e em seguida apresente a versão reescrita. Não use emojis no output."
      fi
      ;;
    usabilidade-br|multi-gen)
      fail "skill '$skill' ainda não tem verificador determinístico no harness (ver .agents/rules/local-testing.md)"
      ;;
    *)
      fail "skill desconhecida: '$skill'"
      ;;
  esac
}

# verificador por skill
verify_for() {
  local skill="$1" out="$2"
  case "$skill" in
    humanizer-br) bash "$ROOT/scripts/check-output.sh" "$out" ;;
    *) fail "sem verificador pra '$skill'" ;;
  esac
}

run_claude() {
  command -v claude >/dev/null 2>&1 || skip "binário 'claude' não encontrado (npm i -g @anthropic-ai/claude-code)"
  local out="$OUT_DIR/${SKILL}-claude.txt"
  local prompt; prompt="$(prompt_for "$SKILL" claude)"
  log "claude one-shot → $out"
  ( cd "$ROOT" && claude --print --plugin-dir "$ROOT" "$prompt" ) > "$out" || fail "claude saiu com erro (auth? rode 'claude' logado ou exporte ANTHROPIC_API_KEY)"
  verify_for "$SKILL" "$out" && pass "humanizer-br via claude"
}

run_cursor() {
  command -v cursor-agent >/dev/null 2>&1 || skip "binário 'cursor-agent' não encontrado (curl https://cursor.com/install -fsS | bash)"
  cursor-agent status >/dev/null 2>&1 || skip "cursor-agent sem auth (cursor-agent login ou CURSOR_API_KEY)"
  local out="$OUT_DIR/${SKILL}-cursor.txt"
  local prompt; prompt="$(prompt_for "$SKILL" cursor)"
  log "cursor-agent one-shot → $out"
  ( cd "$ROOT" && cursor-agent --print --trust --sandbox disabled "$prompt" ) > "$out" || fail "cursor-agent saiu com erro"
  verify_for "$SKILL" "$out" && pass "humanizer-br via cursor-agent"
}

case "$ENGINE" in
  claude) run_claude ;;
  cursor) run_cursor ;;
  both)
    rc=0
    ( run_claude ) || rc=$?
    ( run_cursor ) || rc=$?
    exit "$rc"
    ;;
  *) fail "engine inválido: '$ENGINE' (use claude | cursor | both)" ;;
esac
