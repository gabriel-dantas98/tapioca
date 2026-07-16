# Evidências locais — `humanizer-br`

Outputs reais de execução local da skill `humanizer-br`. Validados em **2026-05-17** no macOS Darwin 25.3.0, claude CLI `--print` mode, sem nenhuma alteração no resultado pós-captura.

## Resultados

### 1. `claude plugin validate` (token-free)

Arquivo: [`claude-plugin-validate.txt`](./claude-plugin-validate.txt)

```
✔ Validation passed with warnings
```

- Validador nativo do Claude CLI; **não consome API token**.
- 1 warning informativo (CLAUDE.md na raiz do plugin não é carregado como contexto — mantido intencionalmente como router pra AGENTS.md).
- Esse mesmo validador roda no CI antes de qualquer job pago.

### 2. Claude one-shot com a skill

Arquivo: [`claude-oneshot-output.txt`](./claude-oneshot-output.txt)

Comando:

```bash
echo "<prompt>" | claude --print --plugin-dir . --allowedTools "Read,Glob,Grep"
```

Resultado: **15/15 padrões do catálogo detectados** pelo nome (inflação de significado, linguagem promocional, paralelismo negativo, regra dos três, gerúndio raso, atribuição vaga, vocabulário inflado, evasão do verbo ser, ganchos dramáticos, travessão em excesso, cobertura midiática listada, aspas curvas, negrito decorativo, emojis decorativos, Title Case, seção formulaica, conclusão otimista, rastros de chatbot, qualificação empilhada).

Validação pelo `check-output.sh`: [`check-output-claude.txt`](./check-output-claude.txt) — **PASS**.

## Guard contra alucinação

A primeira passada da skill, mesmo com o aviso "não invente fatos", adicionou dados específicos falsos ("relatório Gartner de março", "ISO 27001 em agosto"). Endurecido no `agents/humanizer-br.md` (seção Restrições, primeiro bullet): trocar atribuição vaga por dado concreto **só** vale se o dado estava no texto original. Texto humano pode ser vago — alucinação é pior que vaga.

## Notas

- `cursor-agent` agora é coberto pelo harness compartilhado (`.agents/skills/smoke-test-skills/run.sh`) e pelo CI quando `CURSOR_API_KEY` está no repo.
- humanizer-br roda 100% no Claude/CLI — sem dependência externa nem API key de terceiros.

## Como reproduzir localmente

```bash
git clone https://github.com/gabriel-dantas98/tapioca
cd tapioca

# 1. Validação token-free
claude plugin validate .

# 2. One-shot com a skill via harness compartilhado (precisa Claude CLI autenticado)
.agents/skills/smoke-test-skills/run.sh humanizer-br claude
```
