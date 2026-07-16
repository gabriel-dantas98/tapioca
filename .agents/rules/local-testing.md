# Regra: teste local das skills

Toda skill shippada precisa rodar de verdade nos dois alvos do plugin — Claude Code e Cursor — via prompt one-shot, antes de considerar pronta. Marketplace precisa validar e carregar localmente antes do `marketplace add owner/repo` em `main`.

O harness mora em `.agents/skills/smoke-test-skills/`. Ele e a fonte unica: tanto o dev local quanto o CI (`.github/workflows/smoke-test.yml`) chamam o mesmo `run.sh`. Nao duplicar o prompt one-shot no YAML.

## Como rodar local

```bash
# validate + marketplace add ./ + symlink Cursor + oneshot nos dois CLIs
.agents/skills/smoke-test-skills/run.sh all humanizer-br both

# so estrutural (token-free)
.agents/skills/smoke-test-skills/run.sh marketplace

# so oneshot
.agents/skills/smoke-test-skills/run.sh oneshot humanizer-br claude
.agents/skills/smoke-test-skills/run.sh oneshot humanizer-br cursor
```

## Pre-requisitos

- `claude` no PATH (`npm i -g @anthropic-ai/claude-code`) + auth (`claude` logado ou `ANTHROPIC_API_KEY`).
- `cursor-agent` no PATH (`curl https://cursor.com/install -fsS | bash`) + auth (`cursor-agent login` ou `CURSOR_API_KEY`).
- `jq` no PATH.
- Engine sem auth no oneshot vira **SKIP** (exit 2), nao falha — espelha o `run_engines.py` do multi-gen.

## Gotchas

- `claude plugin marketplace add .` falha; use `./`.
- Claude `--print` precisa do prompt via stdin (arg posicional + stdin vazio quebra).
- Cursor IDE: symlink em `~/.cursor/plugins/local/tapioca`, nao em `plugins/cache/`.
- Marketplace remoto puxa da branch default (`main`).

## Contrato de verificacao

Cada skill registra no `run.sh` o par (prompt, verificador). `humanizer-br` usa `scripts/check-output.sh` (>= 8 padroes detectados, sem emoji decorativo). Skill nova so entra no catalogo de oneshot quando tem verificador deterministico.
