#!/usr/bin/env bash
set -euo pipefail

SKILL_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
INSTALL_PREFIX="${TAPIOCA_PREFIX:-$HOME/.local}"

case "$INSTALL_PREFIX" in
  /*) ;;
  *)
    echo "Erro: TAPIOCA_PREFIX precisa ser um path absoluto." >&2
    exit 2
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "Erro: Node.js 22 ou superior não está instalado." >&2
  exit 2
fi
NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Erro: Node.js 22 ou superior é obrigatório; encontrado $(node --version)." >&2
  exit 2
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "Erro: AWS CLI 2.32 ou superior não está instalada." >&2
  exit 2
fi
AWS_VERSION=$(aws --version 2>&1)
if [[ ! "$AWS_VERSION" =~ aws-cli/2\.([0-9]+)\. ]] || [[ "${BASH_REMATCH[1]}" -lt 32 ]]; then
  echo "Erro: AWS CLI 2.32 ou superior é obrigatória; encontrado $AWS_VERSION." >&2
  exit 2
fi

EXPECTED_BIN="$INSTALL_PREFIX/bin/tapioca"
if EXISTING_BIN=$(command -v tapioca 2>/dev/null); then
  EXISTING_DIR=$(cd "$(dirname "$EXISTING_BIN")" && pwd -P)
  EXISTING_PATH="$EXISTING_DIR/$(basename "$EXISTING_BIN")"
  EXPECTED_DIR=$(mkdir -p "$(dirname "$EXPECTED_BIN")" && cd "$(dirname "$EXPECTED_BIN")" && pwd -P)
  EXPECTED_PATH="$EXPECTED_DIR/$(basename "$EXPECTED_BIN")"
  if [[ "$EXISTING_PATH" != "$EXPECTED_PATH" ]]; then
    echo "Erro: já existe outro executável tapioca em $EXISTING_PATH." >&2
    echo "Remova a colisão ou escolha outro TAPIOCA_PREFIX." >&2
    exit 3
  fi
fi

echo "Instalando dependências de aws-secrets..."
npm --loglevel=error ci --prefix "$SKILL_ROOT"
npm --loglevel=error run --prefix "$SKILL_ROOT" build
npm --loglevel=error install --global --prefix "$INSTALL_PREFIX" "$SKILL_ROOT"

echo "Tapioca instalado em $EXPECTED_BIN"
case ":$PATH:" in
  *":$INSTALL_PREFIX/bin:"*) ;;
  *)
    echo "Adicione ao PATH: export PATH=\"$INSTALL_PREFIX/bin:\$PATH\""
    ;;
esac
echo "Próximo passo: aws login && tapioca secrets doctor"
