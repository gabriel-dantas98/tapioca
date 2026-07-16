---
name: smoke-test-skills
description: >
  Roda validate + marketplace local + one-shot das skills shippadas nos dois
  CLIs (claude e cursor-agent). Use ao mexer em skill/manifest, antes de
  mergear, ou pra reproduzir o CI localmente. Nao e recheio distribuivel —
  workflow de dev do repo.
---

# smoke-test-skills

Harness unico de teste local do tapioca. Cobre o que o usuario final precisa funcionar:

1. **Manifesto marketplace** — sem isso, `/plugin marketplace add` falha com "no manifest found"
2. **Plugin load** — Claude via `--plugin-dir` / marketplace local; Cursor via `--plugin-dir` + symlink em `~/.cursor/plugins/local`
3. **One-shot real** — skill invocada como usuario faria, com verificador deterministico

Fonte unica: o CI em `.github/workflows/smoke-test.yml` chama o mesmo `run.sh`.

## Uso

```bash
# sintaxe: run.sh <modo> [skill] [engine]
#   modo   = marketplace | oneshot | all   (default: all)
#   skill  = humanizer-br                  (default: humanizer-br)
#   engine = claude | cursor | both        (default: both; so oneshot/all)

.agents/skills/smoke-test-skills/run.sh all humanizer-br both
.agents/skills/smoke-test-skills/run.sh marketplace
.agents/skills/smoke-test-skills/run.sh oneshot humanizer-br claude
```

Saida em `/tmp/tapioca-smoke/`. Exit: `0` passou, `1` falhou, `2` SKIP (binario ausente ou sem auth).

## O que cada modo faz

### `marketplace` (token-free)

1. `claude plugin validate .` — schema do marketplace + plugin
2. `jq` nos dois `marketplace.json` (`source == "./"`) e no `plugin.json` do Cursor (`skills`/`agents`)
3. `claude plugin marketplace add ./` — **tem que ser `./`, nao `.`** (o CLI rejeita `.`)
4. Symlink idempotente: `~/.cursor/plugins/local/tapioca` → raiz do repo ([docs Cursor](https://cursor.com/docs/plugins))

### `oneshot` (consome token)

1. Claude: prompt via **stdin** + `--plugin-dir` (arg posicional + stdin vazio falha no CLI)
2. Cursor: `cursor-agent -p --trust --sandbox disabled --plugin-dir <root>`
3. `scripts/check-output.sh` no output (>= 8 padroes, sem emoji decorativo)

### `all`

Roda `marketplace` depois `oneshot`.

## Gotchas verificados (2026-07-16)

| Gotcha | Sintoma | Fix no harness |
|---|---|---|
| `marketplace add .` | `Invalid marketplace source format` | usar `./` ou path absoluto |
| Claude `--print` com prompt posicional e stdin vazio | `Input must be provided...` apos timeout de 3s | pipe do prompt via stdin |
| Cursor IDE local | plugin nao aparece | symlink em `~/.cursor/plugins/local/<name>`, nao em `plugins/cache/` |
| Marketplace remoto | "no manifest found" | arquivo precisa estar em `main` (branch default) |

Docs oficiais:

- Claude: [Create plugins](https://code.claude.com/docs/en/plugins) (`--plugin-dir`), [Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) (`marketplace add ./`)
- Cursor: [Plugins — Test locally](https://cursor.com/docs/plugins) (`~/.cursor/plugins/local` + symlink)

## Adicionar skill ao catalogo

No `run.sh`, registre `(prompt, verificador)` no `case`. Skill so entra com verificador deterministico — senao o smoke vira teatro. Ver [`.agents/rules/local-testing.md`](../../rules/local-testing.md).

## Cobertura atual

- `humanizer-br` — completo (marketplace + oneshot nos dois engines).
- `usabilidade-br`, `multi-gen` — smoke estrutural so; verificador oneshot pendente.
