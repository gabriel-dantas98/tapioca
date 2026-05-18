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

Plugin distribuível no formato [Claude Code Plugin](https://code.claude.com/docs/en/plugins). O nome `tapioca` é base neutra — pensada para receber vários recheios ao longo do tempo, todos com foco em PT-BR.

> Imagem em `./assets/banner.png` — placeholder. Substituir pelo banner final antes do release público.

## Skills incluídas (v0.1)

### `/tapioca:humanizer-br`

Remove traços de escrita gerada por IA em PT-BR e injeta voz humana real. Catálogo de 25+ padrões: linguagem promocional, gerúndios empilhados, paralelismo negativo, regra dos três, Title Case herdado do inglês, aspas curvas, ganchos dramáticos, rastros de chatbot, e mais.

**Modos:**
- Claude puro (padrão): roda na própria sessão, custo zero.
- Maritaca opcional: delega rewrite ao modelo `sabia-3`, treinado em PT-BR nativo. Ativado quando `MARITACA_API_KEY` está no ambiente.

Companion: agent `humanizer-br` (em `agents/`) que faz multi-pass com autoavaliação.

## Instalação

### Via clone direto

```bash
git clone https://github.com/gabriel-dantas98/tapioca ~/.claude/plugins/tapioca
```

Reinicie o Claude Code ou rode `/reload-plugins`.

### Via --plugin-dir (desenvolvimento)

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

A skill `humanizer-br` é tributária de [mackswendhell/humanizer-pt-br](https://github.com/mackswendhell/humanizer-pt-br) (MIT), que adapta o [WikiProject AI Cleanup](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup) para PT-BR. Diferenciais do `tapioca`: formato de plugin namespaceado, suporte opcional a engine PT-BR nativa (Maritaca), agent companion com multi-pass, e voice presets.

## Licença

MIT — ver `LICENSE`.
