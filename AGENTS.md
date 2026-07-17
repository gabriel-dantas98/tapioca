# AGENTS.md — tapioca

> We bring the base. You pick the filling. / A nossa base, o seu recheio.
>
> Plugin de skills e agents para Claude Code e Cursor. A marca é a base; cada skill é um recheio.

## O que é

`tapioca` é um plugin distribuível (formato [Claude Code Plugin](https://code.claude.com/docs/en/plugins) e [Cursor Plugin](https://cursor.com/docs/reference/plugins)) que empacota skills e agents sob um único namespace. O nome é base neutra que recebe recheio — hospeda várias capabilities (editorial PT-BR, UX, geração de imagem, workspace Google, etc.) sob a mesma marca.

**Cross-platform desde v0.1.** Ambos os manifestos vivem na raiz:

- `.claude-plugin/plugin.json` — Claude Code
- `.cursor-plugin/plugin.json` — Cursor

Os componentes (`skills/`, `agents/`) são idênticos. Os schemas dos manifestos são compatíveis o suficiente que mantemos os dois arquivos sincronizados manualmente; quando divergirem, AGENTS.md fica como fonte de verdade.

**Por que plugin em vez de skills soltas:**

- Namespace previne colisão (`/tapioca:humanizer-br` não conflita com outros humanizers)
- Versionamento explícito (`plugin.json` → `version`)
- Distribuição via marketplace ou clone direto
- Bundle coerente: skills + agents que se conhecem

## Escopo atual (v0.1)

Somente **skills** e **agents**. Sem hooks, sem MCP, sem LSP por enquanto. Esses podem entrar em versões futuras se houver caso de uso real.

## Estrutura

```text
tapioca/
├── .claude-plugin/
│   └── plugin.json           # Manifesto (name, version, author)
├── AGENTS.md                 # Este arquivo — fonte de verdade
├── CLAUDE.md                 # Aponta pra AGENTS.md
├── README.md                 # Vitrine pública
├── skills/
│   ├── humanizer-br/
│   │   └── SKILL.md          # Skill prompt-only
│   ├── usabilidade-br/
│   │   ├── SKILL.md
│   │   └── DESIGN.md
│   └── multi-gen/
│       ├── SKILL.md
│       ├── DESIGN.md
│       ├── run_engines.py
│       ├── build_preview.py
│       └── tests/smoke_test.py
│   └── google-sheets-apps-script/
│       ├── SKILL.md
│       ├── DESIGN.md
│       ├── wizard.md
│       ├── scripts/sheets_agent.py
│       ├── templates/
│       └── evals/
└── agents/
    ├── humanizer-br.md
    └── usabilidade-br.md
```

## Skills

### `multi-gen`

Dispara vários CLIs de IA em paralelo (mínimo `codex` e `cursor-agent`) a partir de um briefing de imagem, valida cada saída (SVG bem-formado), e monta um preview HTML comparativo (claro + escuro + tira de favicons 16/32/48/180) pra escolher o vencedor antes do refino manual. Não é editor — só compara e mostra.

Pipeline em dois passos (rodar via scripts, não reinventar):

1. `python3 skills/multi-gen/run_engines.py --briefing "<texto>" [--palette "#hex,#hex"] [--format svg] [--engines codex,cursor] [--timeout 180] --out-dir /tmp/multi-gen-<slug>` — pré-checa auth de cada motor, dispara em paralelo (timeout portável macOS via Popen+killpg), extrai e valida o artefato, grava `raw.txt` + `out.<ext>` + `status.json` por engine. Motor indisponível vira SKIP, não trava o resto.
2. `python3 skills/multi-gen/build_preview.py --out-dir <run-dir>` — gera `index.html` self-contained com painéis claro/escuro.

Compõe com `preview-server` (do control-plane do Gabriel) pra servir o comparativo e coletar o veredito. Ver [`skills/multi-gen/SKILL.md`](./skills/multi-gen/SKILL.md), [`skills/multi-gen/DESIGN.md`](./skills/multi-gen/DESIGN.md), smoke test em `skills/multi-gen/tests/smoke_test.py` (rápido, determinístico, não chama os CLIs reais).

Gotchas verificados dos invocadores (já embutidos no runner, documentados pra quando adicionar motor novo):

- `codex exec --skip-git-repo-check "$PROMPT" < /dev/null` — sem o `/dev/null` trava lendo stdin; fora de repo git exige a flag. Stdout tem ruído de log (banner, `tokens used`) → extrair `<svg>...</svg>`.
- `cursor-agent -p "$PROMPT" --output-format text -f < /dev/null` — exige auth prévia (`cursor-agent login` ou `CURSOR_API_KEY`) e `-f` pra confiar no diretório. Pré-check via `cursor-agent status`.

### `usabilidade-br`

Audita usabilidade de apps web contra as 10 heurísticas de Jakob Nielsen e gera um HTML report local self-contained com pontuação por heurística, evidência visual (screenshots via Chrome MCP) e um **fix prompt copiável por violação** — pronto pra colar em outro Claude Code apontando `file:line` quando `--code` é informado.

Invocação: `/tapioca:usabilidade-br <url> [--code <path>] [--rotas <r1,r2>]`.

Companion agent `usabilidade-br` paraleliza 10 passes (um por heurística) e correlaciona código ↔ evidência. Ver [`skills/usabilidade-br/SKILL.md`](./skills/usabilidade-br/SKILL.md) e [`skills/usabilidade-br/DESIGN.md`](./skills/usabilidade-br/DESIGN.md).

### `humanizer-br`

Remove traços de escrita gerada por IA em textos PT-BR e injeta voz humana. Detecta padrões típicos: linguagem promocional, gerúndios empilhados, paralelismo negativo, regra dos três, vocabulário inflado ("vale ressaltar", "neste contexto"), Title Case herdado do inglês, aspas curvas, ganchos dramáticos artificiais.

Invocação: `/tapioca:humanizer-br <texto>` ou via menção natural ("humanize esse texto", "tira o cheiro de IA daqui").

**Modos de operação:**

1. **Prompt-only** (padrão): roda inteiramente no Claude com o guia em `SKILL.md`. Custo zero, latência da própria sessão.
2. **Maritaca rewrite** (opcional): Claude faz a **detecção** dos padrões, mas o **rewrite final** é delegado ao modelo `sabia-3` da [Maritaca](https://www.maritaca.ai), treinado em PT-BR. Ativado quando `MARITACA_API_KEY` está no ambiente. Endpoint: `https://chat.maritaca.ai/api/chat/completions`, header `Authorization: Key <token>`.

Ver [`skills/humanizer-br/SKILL.md`](./skills/humanizer-br/SKILL.md) para o catálogo completo de padrões.

### `google-sheets-apps-script`

Automação self-service de **Google Sheets** e **Google Docs** via Apps Script + browser mode (sem GCP pro usuário final). Docs são markdown-first (`appendMarkdown`, tabelas, imagens, abas de doc). Invocação: `/tapioca:google-sheets-apps-script`.

Upstream: [gist v2.6](https://gist.github.com/gabriel-dantas98/6ad86b6bfab840703ec214f228c3004b). Registry: `~/.config/google-sheets-agent/`. Evals comportamentais em `evals/evals.json` + `evals/grade_runs.py`; static smoke em `evals/run_static.py`.

Ver [`skills/google-sheets-apps-script/SKILL.md`](./skills/google-sheets-apps-script/SKILL.md) e [`skills/google-sheets-apps-script/DESIGN.md`](./skills/google-sheets-apps-script/DESIGN.md).

## Agents

### `usabilidade-br`

Companion da skill `usabilidade-br`. Paraleliza os 10 passes (um por heurística), correlaciona violações com componentes via grep no `--code` informado, calcula scores e monta o HTML report. Invocado automaticamente quando o usuário passa `--code`, múltiplas rotas, ou pede "audit sério".

### `humanizer-br`

Agent que orquestra a skill em multi-pass: detecta → reescreve → autoavalia (pontuação 1–10 em cinco dimensões) → reentra se score < 35. Usado quando o texto é longo ou quando o usuário pede revisão "séria".

## Prior art e crédito

Dois trabalhos seminais na linhagem:

1. **[blader/humanizer](https://github.com/blader/humanizer)** (MIT, ~19k stars) — o humanizer canônico para Claude Code e OpenCode. Foco em **inglês**. Introduziu o padrão "skill standalone + voice calibration" e prova que o catálogo do WikiProject AI Cleanup vira skill efetiva. Não cobre PT-BR.

2. **[mackswendhell/humanizer-pt-br](https://github.com/mackswendhell/humanizer-pt-br)** (MIT, 2026) — primeira adaptação direta do catálogo para PT-BR. Skill standalone, single-file. É o nosso prior art direto.

Ambos derivam do [WikiProject AI Cleanup](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup) da Wikipedia.

**Diferenciais do `tapioca`:**

| Eixo | blader/humanizer | mackswendhell/humanizer-pt-br | tapioca/humanizer-br |
|---|---|---|---|
| Idioma | Inglês | PT-BR | PT-BR |
| Distribuição | Skill standalone | Skill standalone | **Plugin namespaceado** |
| Plataformas | Claude Code + OpenCode | Claude Code | **Claude Code + Cursor** |
| Engine de rewrite | Claude | Claude | Claude + **Maritaca sabia-3 opcional** |
| Companions | SKILL.md | SKILL.md | Skill + **agent multi-pass** |
| Voice presets | Sim (voice calibration) | Não | Sim |
| Escopo do repo | Skill única | Skill única | **Plugin extensível** (fillings além de escrita) |

A licença MIT dos prior arts permite essa derivação; atribuição mantida em `SKILL.md`, `README.md` e neste documento.

## Convenções

- **Superfície do plugin em EN** (README hero, `plugin.json`, marketplace). Bloco PT curto e ok (dual surface).
- **Nas sessões de skill: match user language.** Fillings de domínio PT-BR (`humanizer-br`, wizard Sheets, etc.) continuam em PT-BR no miolo.
- **Sem emojis** em SKILL.md, README, ou output da skill (a própria skill detecta emojis decorativos como traço de IA — seria contraditório usá-los).
- **Aspas retas** (`"`), nunca curvas (`"`).
- **Headings em sentence case**, nunca Title Case (regra que a própria skill aplica).
- **kebab-case ASCII** para nomes de skills, agents e arquivos. Nada de `ç`, `ã`, `é`. O nome do plugin (`tapioca`) já obedece. Slugs `-br` existentes ficam (sem rename breaking).

## Distribuição

v0.1 distribuído por clone direto:

```bash
# Claude Code
git clone https://github.com/gabriel-dantas98/tapioca ~/.claude/plugins/tapioca

# Cursor (formato compatível — mesmo repo)
git clone https://github.com/gabriel-dantas98/tapioca ~/.cursor/plugins/tapioca
```

Submissão aos marketplaces oficiais (Anthropic e Cursor) prevista para v0.2, quando houver pelo menos duas skills no plugin.

## Não-objetivos

- Fazer do plugin um "produto só de português" — PT-BR é domínio de algumas fillings, não a tese da marca.
- Em `humanizer-br`: reescrever conteúdo em **outras línguas**; detectar IA **automaticamente** (classificador); substituir editor humano; otimizar SEO ou copy de vendas.
