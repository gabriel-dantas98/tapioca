#!/usr/bin/env bash
# Verifica se o output do agent contém detecção dos padrões esperados.
# Uso: ./scripts/check-output.sh <arquivo-de-output>
# Sai 0 se >= 8 padrões detectados, 1 caso contrário.

set -euo pipefail

OUTPUT_FILE="${1:?usage: check-output.sh <output-file>}"

if [[ ! -f "$OUTPUT_FILE" ]]; then
  echo "ERROR: output file not found: $OUTPUT_FILE" >&2
  exit 2
fi

# Termos-chave (case-insensitive) que indicam que o agent identificou cada padrão.
# Cada linha é um termo; basta um match para contar o padrão.
PATTERNS=(
  "serve como|papel fundamental|cenário em constante|inflação|inflar"
  "fluida.*intuitiva|promocional|publicit"
  "gerúndio|garantindo"
  "paralelismo negativo|não se trata apenas|não apenas.*mas"
  "regra dos três|três adjetivos|três itens"
  "além disso|vocabulário|inflado|preenchimento"
  "atribuição vaga|especialistas? acreditam"
  "cobertura midi|veículos de mídia|folha.*estadão|listar.*mídia"
  "title case|sentence case|negociações estratégicas e parcerias"
  "aspas curvas|aspas tipográficas|aspas retas"
  "emoji"
  "ganchos? dramáti|muda tudo|começam a fazer sentido"
  "desafios e perspectivas|apesar de seus desafios|formulaica"
  "conclus.*genérica|futuro promissor|otimista"
  "rastro.*chatbot|espero ter ajudado|chatbot"
)

count=0
matched=()
for pat in "${PATTERNS[@]}"; do
  if grep -qiE "$pat" "$OUTPUT_FILE"; then
    count=$((count + 1))
    matched+=("$pat")
  fi
done

echo "Padrões detectados pelo agent: $count / ${#PATTERNS[@]}"
for m in "${matched[@]}"; do
  echo "  ✓ $m"
done

# Verifica que o output não contém emojis decorativos comuns
if grep -qE "🚀|💡|✅|🎯|🔥|✨" "$OUTPUT_FILE"; then
  echo "FAIL: output contains decorative emojis (skill should reject them)" >&2
  exit 1
fi

if [[ $count -lt 8 ]]; then
  echo "FAIL: detected $count patterns, need >= 8" >&2
  exit 1
fi

echo "PASS"
