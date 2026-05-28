---
name: multi-gen
description: Use quando Gabriel quer gerar uma imagem (logo, glifo, ícone, ilustração — SVG por padrão) a partir de um briefing e quer COMPARAR opções de vários motores de IA antes de escolher. Gatilhos — "gera um logo", "gera umas opções de", "quero comparar gerações", "dispara os engines pra essa imagem", trabalho de identidade visual. Não use pra editar/refinar imagem já escolhida.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# multi-gen

Gera uma imagem disparando **vários CLIs de IA em paralelo** (no mínimo `codex` e `cursor-agent`), valida cada saída, e monta um preview comparativo (claro + escuro + favicons) pra Gabriel escolher o vencedor.

Nasceu do trabalho do logo da Novarum. Design intent em `DESIGN.md` ao lado.

## When to use

- Gabriel pede uma imagem nova e quer ver opções de motores diferentes antes de fechar.
- Trabalho de identidade visual: logo, glifo, ícone, favicon.
- SVG é o caso primário (validável, rasteriza fácil); outros formatos via `--format`.

Não use pra: refinar o vencedor (passo manual depois), editar imagem existente, publicar.

## Mecânica (executar via scripts — não reinventar)

```bash
# 1. dispara os motores em paralelo, valida, grava status por engine
python3 skills/multi-gen/run_engines.py \
  --briefing "<descrição da imagem>" \
  [--palette "#2E5BFF,#FFFFFF"] \
  [--format svg] \
  [--engines codex,cursor] \
  [--timeout 180] \
  --out-dir /tmp/multi-gen-<slug>

# 2. monta o preview comparativo (claro/escuro + favicons p/ SVG)
python3 skills/multi-gen/build_preview.py --out-dir /tmp/multi-gen-<slug>
# imprime o caminho do index.html
```

Depois **componha com `preview-server`** pra servir o `index.html` e pegar o veredito do Gabriel. Não suba `http.server` na mão se a skill `preview-server` está disponível.

### O que o runner faz (pra debug/evolução)

1. **Pré-checa cada motor** antes de disparar (binário no PATH, auth). Motor indisponível vira SKIP com motivo — não trava o resto.
2. **Dispara em paralelo** (uma thread por motor) com timeout portável (macOS não tem `timeout`/`gtimeout`).
3. **Extrai e valida** a saída: pro SVG, pega o bloco `<svg>...</svg>` da stdout (ignora ruído de log) e confere boa-formação via ElementTree.
4. Grava `raw.txt`, `out.<ext>`, `status.json` por motor + `briefing.json` no run.

## Invocações corretas dos CLIs (gotchas verificados 2026-05-27)

Já embutidas no runner — documentadas aqui pra quando adicionar motor novo:

| Motor | Invocação | Por quê |
|---|---|---|
| `codex` | `codex exec --skip-git-repo-check "$PROMPT" < /dev/null` | Sem `< /dev/null` trava lendo stdin; fora de repo git exige `--skip-git-repo-check`. Stdout vem com banner + `tokens used` → **extrair** o `<svg>`. |
| `cursor-agent` | `cursor-agent -p "$PROMPT" --output-format text -f < /dev/null` | Exige auth (`cursor-agent login` ou `CURSOR_API_KEY`) e exige `-f`/`--trust` pra confiar no diretório, senão sai com erro. |

**Pré-check de auth do cursor:** o runner roda `cursor-agent status` antes. Se faltar auth, vira SKIP com a mensagem certa — **avise o Gabriel pra rodar `cursor-agent login`** em vez de tentar de novo.

## Adicionar um motor novo

Edite o dict `ENGINES` em `run_engines.py`: dê `available()` (pré-check), `cmd(prompt)` (args), `stdin_devnull` e `needs_extract`. Mais nada.

## Hard rules

- **Timeout generoso.** Modelos agênticos demoram 10–120s+. Default 180s/motor; suba se o briefing for complexo.
- **Paralelo, sempre.** Nunca disparar os motores em sequência.
- **Não trava em motor faltando.** Indisponível = SKIP com motivo, segue o baile.
- **Texto user-facing** (copy do `index.html`, mensagens) passa pelo `humanizer` antes de mergear.
- **Preview via `preview-server`.** Qualquer artefato visual é revisado em localhost antes de declarar pronto.

## Common mistakes

- Confiar na stdout crua do `codex` como SVG → tem ruído de log. Sempre extrair.
- Esquecer `< /dev/null` no codex → trava.
- Esquecer `-f` no cursor → erro de diretório não confiável.
- Rodar fora de auth do cursor e ficar retentando → pré-checar e avisar.

## Composição

- `preview-server` — serve o comparativo e coleta o veredito.
- `humanizer` — copy do report e mensagens user-facing.
- `find-skills` — antes de criar variação, checar se já existe.
