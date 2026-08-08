#!/usr/bin/env bash
set -euo pipefail

OUT="${1:?uso: check-aws-secrets-output.sh <arquivo>}"
test -f "$OUT"

require() {
  grep -Eqi -- "$1" "$OUT" || { echo "[fail] ausente: $2" >&2; exit 1; }
}

require 'aws login' 'aws login'
require 'tapioca secrets doctor' 'doctor'
require 'tapioca secrets inject .env.template --output .env' 'inject'
require 'tapioca secrets ui' 'ui'
require 'domain.*/.*env.*/.*product.*/.*key|<domain>/<env>/<product>/<key>' 'path de quatro segmentos'
require 'base64' 'JSON em base64'

if grep -Eqi 'tapioca secrets (delete|run)([[:space:]]|$)' "$OUT"; then
  echo "[fail] output recomendou comando proibido" >&2
  exit 1
fi

echo "[pass] aws-secrets output"
