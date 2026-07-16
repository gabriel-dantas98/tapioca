# Regra: catálogo de skills (comportamento durável)

Referência de comportamento por skill. O detalhe completo mora em cada `SKILL.md`/`DESIGN.md`; aqui ficam os fatos não-inferíveis que orientam evolução.

## humanizer-br

Remove traços de IA em PT-BR e injeta voz humana. Invocação: `/tapioca:humanizer-br <texto>` ou menção natural. Roda 100% no Claude/CLI — sem dependência externa nem API key. Aceita voice preset opcional (arquivo de exemplo) pra calibrar a voz.

Companion `agents/humanizer-br.md`: multi-pass detecta → reescreve → autoavalia (1–10 em cinco dimensões) → reentra se score < 35.

## usabilidade-br

Audita app web contra as 10 heurísticas de Nielsen → HTML report self-contained com score por heurística, screenshots via Chrome MCP e fix prompt copiável por violação (com `file:line` quando `--code` é informado).

Invocação: `/tapioca:usabilidade-br <url> [--code <path>] [--rotas <r1,r2>]`. Companion paraleliza 10 passes.

## multi-gen

Dispara CLIs de IA em paralelo a partir de um briefing de imagem, valida cada saída e monta preview HTML comparativo (claro/escuro + tira de favicons). Não é editor — compara e mostra.

Pipeline (rodar via script, não reinventar):
1. `python3 skills/multi-gen/run_engines.py --briefing "<texto>" [--palette] [--format svg] [--engines codex,cursor] [--timeout 180] --out-dir <dir>`
2. `python3 skills/multi-gen/build_preview.py --out-dir <run-dir>`

Gotchas de invocação de CLI (verificados, embutidos no runner — replicar ao adicionar motor):
- `codex exec --skip-git-repo-check "$PROMPT" < /dev/null` — sem `/dev/null` trava lendo stdin; fora de repo git exige a flag. Stdout tem ruído de log → extrair `<svg>...</svg>`.
- `cursor-agent -p "$PROMPT" --output-format text -f < /dev/null` — exige auth prévia (`cursor-agent login` ou `CURSOR_API_KEY`) e `-f` pra confiar no diretório. Pré-check via `cursor-agent status`.
