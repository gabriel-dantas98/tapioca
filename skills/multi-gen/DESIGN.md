# DESIGN — multi-gen

## Goal

Padronizar o fluxo que a gente repetia na mão (nasceu do logo da Novarum): dado um briefing de imagem + paleta opcional, disparar vários CLIs de IA **em paralelo**, coletar e validar as saídas, e montar um preview comparativo lado a lado (claro + escuro + tamanhos de favicon) pra Gabriel escolher o vencedor e pedir o refino.

## Non-goals

- Não é editor de imagem nem refinador. O refino do vencedor é um passo manual depois, fora do escopo desta rodada.
- Não reimplementa servidor de preview — compõe com a skill `preview-server`.
- Não amarra a um único motor. `codex` e `cursor-agent` são o mínimo; adicionar motor novo é editar uma lista no runner.
- Não é exclusivo de SVG. SVG é o caso primário (texto, validável, rasteriza fácil), mas o pipeline aceita outros formatos via adapter.
- Não publica nada, não commita o resultado, não toca em repos externos.

## Inputs

- **Briefing** (obrigatório): descrição textual da imagem desejada.
- **Paleta** (opcional): lista de cores hex ou nomes.
- **Formato** (opcional, default `svg`): formato-alvo da saída.
- **Engines** (opcional): subconjunto de motores a disparar; default = todos os habilitados.
- **Timeout** (opcional): segundos por engine; default generoso (modelos agênticos são lentos).

## Outputs

- Um diretório de run com, por engine: o artefato bruto (`raw.txt`), o artefato extraído/validado (`out.svg` etc.), e um `status.json` (ok / erro / timeout + motivo).
- Um `index.html` comparativo: cada candidato em fundo claro e escuro, mais tira de favicons (16/32/48/180px) pra SVG.
- O preview servido em localhost via `preview-server`.

## Voice/Tone

PT-BR coloquial, direto. Mensagens de status curtas ("engine codex: ok", "cursor: auth faltando — rode `cursor-agent login`"). O `index.html` é user-facing → copy passa pelo `humanizer` antes de mergear.

## Gotchas de CLI (verificados 2026-05-27)

- **codex**: trava lendo stdin se não fechar; fora de repo git exige flag. Forma certa:
  `codex exec --skip-git-repo-check "$PROMPT" < /dev/null`. Stdout vem com ruído de log (banner `codex`, trailer `tokens used`) — **precisa extrair** o bloco `<svg>...</svg>`.
- **cursor-agent**: exige auth (`cursor-agent login` ou `CURSOR_API_KEY`) e exige confiar no diretório (flag `-f`/`--trust`/`--yolo`), senão sai com erro. Forma certa:
  `cursor-agent -p "$PROMPT" --output-format text -f < /dev/null`. Pré-checar auth com `cursor-agent status` ANTES de disparar.
- Sem `timeout`/`gtimeout` no macOS por padrão → o runner implementa timeout portável (background + kill via Perl `alarm` ou loop de poll).
- Os CLIs demoram (10–120s+). Disparar em background paralelo, fazer poll com timeout generoso.

## Open questions

- Vale habilitar um terceiro motor por default (ex.: `gemini`, `claude` headless)? Hoje fica só no registry, comentado.
- Para formatos raster (PNG via modelo de imagem), qual CLI? Deixar adapter pronto mas sem engine default.
- Refino do vencedor: vira skill própria (`multi-gen:refine`) ou passo manual? Decidir depois da primeira rodada real.
