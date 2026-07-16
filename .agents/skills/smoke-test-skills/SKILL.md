---
name: smoke-test-skills
description: Roda as skills shippadas do tapioca via prompt one-shot nos dois CLIs alvo (claude-code e cursor-agent) e verifica a saída. Use ao mexer numa skill, antes de mergear, ou pra reproduzir local o que o CI faz. Não é um recheio distribuível — é workflow de dev do repo.
---

# smoke-test-skills

Harness de teste local das skills do tapioca. Invoca cada skill como um usuário faria — prompt one-shot, sessão limpa — nos dois alvos do plugin: `claude` (Claude Code) e `cursor-agent` (Cursor). É a fonte única: o CI em `.github/workflows/smoke-test.yml` chama o mesmo `run.sh`.

## Por que existe

Um plugin só está pronto quando roda de verdade nos dois CLIs, não só quando o `plugin.json` valida. Esse harness fecha o loop: dispara a skill via CLI, captura a saída e roda um verificador determinístico.

## Uso

```bash
# sintaxe: run.sh <skill> <engine>
#   skill  = humanizer-br | usabilidade-br | multi-gen
#   engine = claude | cursor | both   (default: both)

.agents/skills/smoke-test-skills/run.sh humanizer-br both
.agents/skills/smoke-test-skills/run.sh humanizer-br claude
```

Saída por engine em `/tmp/tapioca-smoke/<skill>-<engine>.txt`. Exit 0 = passou, 1 = falhou, 2 = SKIP (binário ausente ou sem auth).

## Como funciona

1. Resolve a raiz do repo a partir da localização do script.
2. Pra cada engine pedido, checa o binário e a auth. Sem auth → SKIP (não falha), espelhando o `run_engines.py` do multi-gen.
3. Monta o prompt one-shot específico do par (skill, engine) — o Claude carrega a skill via `--plugin-dir`; o cursor-agent recebe o caminho do `SKILL.md` no prompt.
4. Dispara:
   - `claude --print --plugin-dir <root> "<prompt>"`
   - `cursor-agent --print --trust --sandbox disabled "<prompt>"`
5. Roda o verificador registrado pra skill. Hoje: `humanizer-br` → `scripts/check-output.sh` (≥ 8 padrões, sem emoji decorativo).

## Adicionar skill ao catálogo

No `run.sh`, registre o par `(prompt, verificador)` no `case` por skill. A skill só entra quando tem verificador determinístico — senão o smoke vira teatro. Ver [`.agents/rules/local-testing.md`](../../rules/local-testing.md).

## Cobertura atual

- `humanizer-br` — completo (prompt + verificador nos dois engines).
- `usabilidade-br`, `multi-gen` — dependem de URL/Chrome MCP e de CLIs externos; smoke local fica como "carrega e produz plano plausível". Verificador determinístico pendente.
