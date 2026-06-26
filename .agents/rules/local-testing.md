# Regra: teste local das skills

Toda skill shippada precisa rodar de verdade nos dois alvos do plugin — Claude Code e Cursor — via prompt one-shot, antes de considerar pronta.

O harness mora em `.agents/skills/smoke-test-skills/`. Ele é a fonte única: tanto o dev local quanto o CI (`.github/workflows/smoke-test.yml`) chamam o mesmo `run.sh`. Não duplicar o prompt one-shot no YAML.

## Como rodar local

```bash
# uma skill, um engine
.agents/skills/smoke-test-skills/run.sh humanizer-br claude
.agents/skills/smoke-test-skills/run.sh humanizer-br cursor

# os dois engines
.agents/skills/smoke-test-skills/run.sh humanizer-br both
```

## Pré-requisitos

- `claude` no PATH (`npm i -g @anthropic-ai/claude-code`) + `ANTHROPIC_API_KEY`.
- `cursor-agent` no PATH (`curl https://cursor.com/install -fsS | bash`) + auth (`cursor-agent login` ou `CURSOR_API_KEY`).
- Engine sem auth vira **SKIP**, não falha — espelha o comportamento do `run_engines.py` do multi-gen.

## Contrato de verificação

Cada skill registra no `run.sh` o par (prompt, verificador). humanizer-br usa `scripts/check-output.sh` (≥ 8 padrões detectados, sem emoji decorativo). Skill nova só entra no catálogo de smoke quando tem verificador determinístico.
