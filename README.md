<p align="center">
  <img src="./assets/banner.png" alt="tapioca — sabores brasileiros pro Claude Code" width="600" />
</p>

<h1 align="center">tapioca</h1>

<p align="center">
  <em>Sabores brasileiros para Claude Code — skills e agents PT-BR.</em>
</p>

<p align="center">
  <a href="https://github.com/gabriel-dantas98/tapioca/actions"><img src="https://github.com/gabriel-dantas98/tapioca/actions/workflows/smoke-test.yml/badge.svg" alt="smoke tests" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/plugin-claude--code-orange.svg" alt="claude-code plugin" />
</p>

---

Plugin distribuível nos formatos [Claude Code Plugin](https://code.claude.com/docs/en/plugins) e [Cursor Plugin](https://cursor.com/docs/reference/plugins). O nome `tapioca` é base neutra — pensada para receber vários recheios ao longo do tempo, todos com foco em PT-BR.

## Skills incluídas

### `/tapioca:multi-gen`

Dispara vários CLIs de IA em paralelo (mínimo `codex` e `cursor-agent`) a partir de um briefing de imagem, valida cada saída (SVG bem-formado) e monta um preview HTML comparativo com painel claro, escuro e tira de favicons (16/32/48/180px) pra escolher o vencedor antes do refino manual.

- Dispatch paralelo com timeout portável (macOS sem `gtimeout`)
- Pré-check de auth do `cursor-agent` (vira SKIP em vez de travar)
- Extração robusta do `<svg>` quando o CLI mistura log na stdout
- Saída por engine: `raw.txt`, `out.<ext>`, `status.json` no run-dir

```text
/tapioca:multi-gen "logo geometrico p/ Novarum, paleta azul" --palette "#2E5BFF,#FFFFFF"
```

Compõe com a skill `preview-server` (do control-plane) pra servir o `index.html`.

### `/tapioca:usabilidade-br`

Audita usabilidade de apps web contra as 10 heurísticas de Jakob Nielsen. Captura evidência via Chrome MCP, opcionalmente correlaciona com código fonte (`--code <path>`) e gera um HTML report local self-contained com:

- Score geral (0–100) e por heurística
- Evidência visual (screenshots embutidas)
- Snippet de código com `file:line` quando o componente é localizado
- **Fix prompt copiável** por violação — pronto pra colar em outro Claude Code

Companion agent paraleliza 10 passes (um por heurística) e monta o relatório.

```text
/tapioca:usabilidade-br http://localhost:3000 --code ./src
```

### `/tapioca:humanizer-br`

Remove traços de escrita gerada por IA em PT-BR e injeta voz humana real. Catálogo de 25+ padrões: linguagem promocional, gerúndios empilhados, paralelismo negativo, regra dos três, Title Case herdado do inglês, aspas curvas, ganchos dramáticos, rastros de chatbot, e mais.

**Modos:**
- Claude puro (padrão): roda na própria sessão, custo zero.
- Maritaca opcional: delega rewrite ao modelo `sabia-3`, treinado em PT-BR nativo. Ativado quando `MARITACA_API_KEY` está no ambiente.

Companion: agent `humanizer-br` (em `agents/`) que faz multi-pass com autoavaliação.

## Instalação

### Claude Code

```text
/plugin marketplace add gabriel-dantas98/tapioca
/plugin install tapioca@tapioca
```

### Cursor

Settings → Plugins → Add marketplace → `gabriel-dantas98/tapioca`, depois instale o plugin `tapioca` pela lista. O repo carrega o manifesto do Cursor em `.cursor-plugin/` com a mesma `skills/` e `agents/` por baixo.

### Claude Desktop

O Desktop não consome plugin nem marketplace — empacote a skill avulsa e suba em Settings → Capabilities → Skills:

```bash
zip -r humanizer-br.zip skills/humanizer-br/
```

Só `humanizer-br` é portável; as outras dependem de CLIs e Chrome MCP.

### Via --plugin-dir (desenvolvimento, Claude Code)

```bash
claude --plugin-dir /caminho/para/tapioca
```

## Uso

```text
/tapioca:humanizer-br Cole aqui o texto pra humanizar.
```

Ou em linguagem natural:

```text
Humaniza esse texto pra mim, tira o cheiro de IA.
```

Para revisão "séria" (multi-pass), o Claude vai invocar o agent companion automaticamente.

### Modo Maritaca

```bash
export MARITACA_API_KEY="sua-chave-aqui"
```

A skill detecta a variável e oferece o modo Maritaca quando o texto justifica (longo o suficiente, qualidade pedida explicitamente).

## Estrutura

```text
tapioca/
├── .claude-plugin/plugin.json
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── skills/
│   └── humanizer-br/SKILL.md
└── agents/
    └── humanizer-br.md
```

## Roadmap

| Versão | Conteúdo |
|---|---|
| **v0.1** | `humanizer-br` (skill + agent), formato de plugin, AGENTS.md |
| v0.2 | Skill `editor-br` (revisão geral de PT-BR — concordância, regência, regionalismos) |
| v0.3 | Skill `roteirista-br` (roteiros falados, transcrições, podcasts) |
| v0.4 | Submissão ao marketplace oficial Anthropic |

Sem hooks, MCP ou LSP no curto prazo. Foco em **skills e agents** até a coleção justificar mais.

## Crédito

A skill `humanizer-br` descende de duas linhagens:

- [blader/humanizer](https://github.com/blader/humanizer) (MIT, ~19k stars) — humanizer canônico **em inglês** para Claude Code e OpenCode. Estabeleceu o padrão skill + voice calibration que esta skill estende.
- [mackswendhell/humanizer-pt-br](https://github.com/mackswendhell/humanizer-pt-br) (MIT, 2026) — primeira adaptação direta do catálogo do WikiProject AI Cleanup para **PT-BR**.

Diferenciais do `tapioca`:

- **Plugin namespaceado** (não skill standalone): `/tapioca:humanizer-br`
- **Cross-platform** desde v0.1: Claude Code e Cursor
- **Engine PT-BR nativa opcional** (Maritaca `sabia-3`) além do default Claude
- **Agent companion** com multi-pass e autoavaliação
- **Voice presets** explicitamente documentados

## Licença

MIT — ver `LICENSE`.
