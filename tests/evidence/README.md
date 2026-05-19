# Evidências locais — `feat/humanizer-br`

Outputs reais de execução local da skill `humanizer-br` antes da abertura do PR. Validados em **2026-05-17** no macOS Darwin 25.3.0, claude CLI `--print` mode, sem nenhuma alteração no resultado pós-captura.

## Resultados

### 1. `claude plugin validate` (token-free)

Arquivo: [`claude-plugin-validate.txt`](./claude-plugin-validate.txt)

```
✔ Validation passed with warnings
```

- Validador nativo do Claude CLI; **não consome API token**.
- 1 warning informativo (CLAUDE.md na raiz do plugin não é carregado como contexto — mantido intencionalmente como pointer para AGENTS.md, padrão do autor).
- Esse mesmo validador roda no CI no job `claude-plugin-validate` antes de qualquer job pago.

### 2. Claude one-shot com a skill

Arquivo: [`claude-oneshot-output.txt`](./claude-oneshot-output.txt)

Comando:

```bash
echo "<prompt>" | claude --print --plugin-dir . --allowedTools "Read,Glob,Grep"
```

Resultado: **15/15 padrões do catálogo detectados** pelo nome (Inflação de significado, Linguagem promocional, Paralelismo negativo, Regra dos três, Gerúndio raso, Atribuição vaga, Vocabulário inflado, Evasão do verbo ser, Ganchos dramáticos, Travessão em excesso, Cobertura midiática listada, Aspas curvas, Negrito decorativo, Emojis decorativos, Title Case, Seção formulaica, Conclusão otimista, Rastros de chatbot, Qualificação empilhada).

Validação pelo `check-output.sh`: [`check-output-claude.txt`](./check-output-claude.txt) — **PASS**.

### 3. Maritaca `sabia-3` — rewrite direto

Arquivos: [`maritaca-rewrite.txt`](./maritaca-rewrite.txt) (texto), [`maritaca-raw-response.json`](./maritaca-raw-response.json) (response completa).

- Endpoint: `https://chat.maritaca.ai/api/chat/completions`
- Header: `Authorization: Key <token>`
- Model: `sabia-3`
- HTTP 200, 9 tokens prompt, ~150 tokens completion.

## Diferencial confirmado: Claude vs. Maritaca

A evidência revelou as forças e fraquezas reais de cada engine, justificando o **modo hybrid** documentado na skill:

| Aspecto | Claude (modo padrão) | Maritaca `sabia-3` |
|---|---|---|
| Detecção de padrões | 15/15 — excelente | N/A (não foi usado pra detectar) |
| Reescrita estrutural | Profunda (corta paralelismo, regra dos três, emojis) | Moderada (mantém algumas marcas) |
| Capitalização | Correta (sentence case nos headings, proper nouns ok) | **Bug**: lowercased tudo, inclusive proper nouns ("são paulo", "folha") |
| Hallucinação factual | **Problema**: inventou "relatório Gartner de março", "ISO 27001 em agosto" | Nenhuma — manteve só o que estava no input |

**Implicação prática:**

- Claude sozinho: melhor detecção e sanitização, mas precisa de guard contra alucinação. Endurecido no agent.md (commit subsequente).
- Maritaca sozinho: anti-hallucination natural, mas precisa de pós-processamento (capitalização) e detecção externa.
- **Hybrid (já documentado no SKILL.md):** Claude detecta + valida → Maritaca reescreve → Claude faz passe final de capitalização e sanity-check.

## Issues conhecidas pra v0.2

1. **Alucinação no rewrite via Claude.** A primeira passada da skill, mesmo com o aviso "não invente fatos", adicionou dados específicos falsos. Endurecido no `agents/humanizer-br.md` (seção Restrições, primeiro bullet). A reforçar com exemplos negativos no SKILL.md em v0.2.
2. **Maritaca quebra capitalização.** Precisa de prompt mais explícito sobre preservar capitalização e proper nouns, ou pós-processamento no passe final.
3. **`cursor-agent` não testado localmente** — requer `CURSOR_API_KEY` ou `agent login`. CI cobre quando a secret estiver no repo.

## Como reproduzir localmente

```bash
git clone https://github.com/gabriel-dantas98/tapioca
cd tapioca

# 1. Validação token-free
claude plugin validate .

# 2. One-shot com a skill (precisa Claude CLI autenticado)
cat <<'EOF' | claude --print --plugin-dir . --allowedTools "Read,Glob,Grep" > /tmp/out.txt
Você é o agent humanizer-br do plugin tapioca.
1. Leia tests/fixtures/ai-flavored.md
2. Leia skills/humanizer-br/SKILL.md
3. Aplique a skill. Liste padrões pelo nome do catálogo. Apresente a versão reescrita.
Sem emojis no output.
EOF
bash scripts/check-output.sh /tmp/out.txt

# 3. Maritaca direto (precisa MARITACA_API_KEY com créditos)
export MARITACA_API_KEY="..."
curl -sS https://chat.maritaca.ai/api/chat/completions \
  -H "Authorization: Key $MARITACA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"sabia-3","messages":[{"role":"user","content":"..."}]}'
```
