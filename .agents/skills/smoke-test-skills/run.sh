#!/usr/bin/env bash
# Smoke test local do tapioca: marketplace + one-shot nos dois CLIs.
# Fonte única: CI (.github/workflows/smoke-test.yml) e este script.
#
# Uso: run.sh <modo> [skill] [engine]
#   modo   = marketplace | oneshot | all   (default: all)
#   skill  = humanizer-br | aws-secrets    (default: humanizer-br)
#   engine = claude | cursor | both        (default: both)
#
# Exit: 0 passou · 1 falhou · 2 skip (binário ausente ou sem auth)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="/tmp/tapioca-smoke"
mkdir -p "$OUT_DIR"

MODE="${1:-all}"
SKILL="${2:-humanizer-br}"
ENGINE="${3:-both}"

log()  { printf '\033[1m[smoke]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[pass]\033[0m  %s\n' "$*"; }
warn() { printf '\033[33m[skip]\033[0m  %s\n' "$*"; }
die()  { printf '\033[31m[fail]\033[0m  %s\n' "$*" >&2; exit 1; }

# --- prompts / verificadores -----------------------------------------------

prompt_for() {
  local skill="$1" engine="$2"
  case "$skill" in
    humanizer-br)
      if [ "$engine" = "claude" ]; then
        printf '%s' "Use a skill /tapioca:humanizer-br para analisar e humanizar o texto em tests/fixtures/ai-flavored.md. Liste os padrões de IA detectados no texto (mencione cada categoria pelo nome) e em seguida apresente a versão reescrita. Não use emojis no output."
      else
        printf '%s' "Leia tests/fixtures/ai-flavored.md, leia skills/humanizer-br/SKILL.md, e aplique a skill no texto da fixture. Liste os padrões de IA detectados (mencione cada categoria pelo nome) e em seguida apresente a versão reescrita. Não use emojis no output."
      fi
      ;;
    aws-secrets)
      if [ "$engine" = "claude" ]; then
        printf '%s' "Use a skill /tapioca:aws-secrets para orientar um projeto com DATABASE_URL=secret://payments/prod/checkout-api/database-url no .env.template. Não acesse AWS nem revele valores. Dê os comandos exatos para autenticar, validar, gerar .env e abrir a UI. Explique o path <domain>/<env>/<product>/<key>, JSON em base64 e que delete/run não fazem parte da CLI."
      else
        printf '%s' "Leia skills/aws-secrets/SKILL.md e oriente um projeto com DATABASE_URL=secret://payments/prod/checkout-api/database-url no .env.template. Não acesse AWS nem revele valores. Dê os comandos exatos para autenticar, validar, gerar .env e abrir a UI. Explique o path <domain>/<env>/<product>/<key>, JSON em base64 e que delete/run não fazem parte da CLI."
      fi
      ;;
    usabilidade-br|multi-gen)
      die "skill '$skill' ainda não tem verificador deterministico (ver .agents/rules/local-testing.md)"
      ;;
    *)
      die "skill desconhecida: '$skill'"
      ;;
  esac
}

verify_for() {
  local skill="$1" out="$2"
  case "$skill" in
    humanizer-br) bash "$ROOT/scripts/check-output.sh" "$out" ;;
    aws-secrets) bash "$ROOT/scripts/check-aws-secrets-output.sh" "$out" ;;
    *) die "sem verificador pra '$skill'" ;;
  esac
}

# --- marketplace (token-free) ----------------------------------------------

run_marketplace() {
  command -v jq >/dev/null 2>&1 || die "jq não encontrado"
  command -v claude >/dev/null 2>&1 || die "binário 'claude' não encontrado (npm i -g @anthropic-ai/claude-code)"

  log "claude plugin validate ."
  ( cd "$ROOT" && claude plugin validate . ) | tee "$OUT_DIR/validate.txt"
  if grep -q '^✘' "$OUT_DIR/validate.txt"; then
    die "claude plugin validate encontrou erros"
  fi
  ok "validate"

  log "shape dos marketplace.json + cursor plugin.json"
  jq -e '.name == "tapioca" and (.plugins | length > 0) and (.plugins[0].source == "./")' \
    "$ROOT/.claude-plugin/marketplace.json" >/dev/null
  jq -e '.name == "tapioca" and (.plugins | length > 0) and (.plugins[0].source == "./")' \
    "$ROOT/.cursor-plugin/marketplace.json" >/dev/null
  jq -e '.skills == "./skills/" and .agents == "./agents/"' \
    "$ROOT/.cursor-plugin/plugin.json" >/dev/null
  ok "manifest shapes"

  # Gotcha: `add .` falha; precisa `./` ou path absoluto.
  log "claude plugin marketplace add ./"
  ( cd "$ROOT" && claude plugin marketplace add ./ ) | tee "$OUT_DIR/marketplace-add.txt"
  ok "marketplace add ./"

  log "symlink Cursor local (~/.cursor/plugins/local/tapioca)"
  mkdir -p "$HOME/.cursor/plugins/local"
  ln -sfn "$ROOT" "$HOME/.cursor/plugins/local/tapioca"
  test -f "$HOME/.cursor/plugins/local/tapioca/.cursor-plugin/plugin.json" \
    || die "symlink Cursor local quebrado"
  ok "Cursor local symlink"
}

# --- oneshot (paga token) --------------------------------------------------

run_claude() {
  command -v claude >/dev/null 2>&1 || { warn "binário 'claude' ausente"; return 2; }
  local out="$OUT_DIR/${SKILL}-claude.txt"
  local prompt
  prompt="$(prompt_for "$SKILL" claude)"
  log "claude one-shot → $out"
  # Gotcha: prompt posicional + stdin vazio falha apos timeout de 3s.
  # Pipe do prompt via stdin e o caminho estavel.
  ( cd "$ROOT" && printf '%s\n' "$prompt" | claude --print --plugin-dir "$ROOT" --allowedTools "Read,Glob,Grep" ) \
    > "$out" || die "claude saiu com erro (auth? claude login ou ANTHROPIC_API_KEY)"
  verify_for "$SKILL" "$out"
  ok "$SKILL via claude"
}

run_cursor() {
  command -v cursor-agent >/dev/null 2>&1 || { warn "binário 'cursor-agent' ausente"; return 2; }
  cursor-agent status >/dev/null 2>&1 || { warn "cursor-agent sem auth (cursor-agent login ou CURSOR_API_KEY)"; return 2; }
  local out="$OUT_DIR/${SKILL}-cursor.txt"
  local prompt
  prompt="$(prompt_for "$SKILL" cursor)"
  log "cursor-agent one-shot → $out"
  ( cd "$ROOT" && cursor-agent --print --trust --sandbox disabled --plugin-dir "$ROOT" --output-format text "$prompt" ) \
    > "$out" || die "cursor-agent saiu com erro"
  verify_for "$SKILL" "$out"
  ok "$SKILL via cursor-agent"
}

run_oneshot() {
  case "$ENGINE" in
    claude) run_claude ;;
    cursor) run_cursor ;;
    both)
      local rc=0
      run_claude || rc=$?
      # 2 = skip; nao propaga como falha se o outro passou
      if [ "$rc" -eq 2 ]; then rc=0; fi
      local rc2=0
      run_cursor || rc2=$?
      if [ "$rc2" -eq 2 ]; then rc2=0; fi
      if [ "$rc" -ne 0 ] || [ "$rc2" -ne 0 ]; then
        exit 1
      fi
      ;;
    *) die "engine inválido: '$ENGINE' (use claude | cursor | both)" ;;
  esac
}

# --- dispatch --------------------------------------------------------------

case "$MODE" in
  marketplace) run_marketplace ;;
  oneshot)     run_oneshot ;;
  all)
    run_marketplace
    run_oneshot
    ;;
  # atalho legado: run.sh humanizer-br both
  humanizer-br|aws-secrets|usabilidade-br|multi-gen)
    SKILL="$MODE"
    ENGINE="${2:-both}"
    MODE=oneshot
    run_oneshot
    ;;
  *) die "modo inválido: '$MODE' (use marketplace | oneshot | all)" ;;
esac
