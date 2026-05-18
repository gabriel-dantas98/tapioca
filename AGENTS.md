# AGENTS.md — tapioca

> Plugin Claude Code com sabor brasileiro. Reúne skills e agents focados em escrita, edição e fluxos editoriais em **português brasileiro**.

## O que é

`tapioca` é um plugin distribuível (formato [Claude Code Plugin](https://code.claude.com/docs/en/plugins)) que empacota skills e agents PT-BR sob um único namespace. O nome é base neutra que recebe recheio — combina com o propósito de hospedar várias capabilities sob a mesma marca.

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
│   └── humanizer-br/
│       └── SKILL.md          # Skill v0.1
└── agents/
    └── humanizer-br.md       # Agent companion (opcional)
```

## Skills

### `humanizer-br`

Remove traços de escrita gerada por IA em textos PT-BR e injeta voz humana. Detecta padrões típicos: linguagem promocional, gerúndios empilhados, paralelismo negativo, regra dos três, vocabulário inflado ("vale ressaltar", "neste contexto"), Title Case herdado do inglês, aspas curvas, ganchos dramáticos artificiais.

Invocação: `/tapioca:humanizer-br <texto>` ou via menção natural ("humanize esse texto", "tira o cheiro de IA daqui").

**Modos de operação:**

1. **Prompt-only** (padrão): roda inteiramente no Claude com o guia em `SKILL.md`. Custo zero, latência da própria sessão.
2. **Maritaca rewrite** (opcional): Claude faz a **detecção** dos padrões, mas o **rewrite final** é delegado ao modelo `sabia-3` da [Maritaca](https://www.maritaca.ai), treinado em PT-BR. Ativado quando `MARITACA_API_KEY` está no ambiente. Endpoint: `https://chat.maritaca.ai/api/chat/completions`, header `Authorization: Key <token>`.

Ver [`skills/humanizer-br/SKILL.md`](./skills/humanizer-br/SKILL.md) para o catálogo completo de padrões.

## Agents

### `humanizer-br`

Agent que orquestra a skill em multi-pass: detecta → reescreve → autoavalia (pontuação 1–10 em cinco dimensões) → reentra se score < 35. Usado quando o texto é longo ou quando o usuário pede revisão "séria".

## Prior art e crédito

A skill é tributária do trabalho de [Mackswendhell/humanizer-pt-br](https://github.com/mackswendhell/humanizer-pt-br) (MIT, 2026), que por sua vez adapta o [WikiProject AI Cleanup](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup) da Wikipedia para PT-BR. **Diferenciais do `tapioca`:**

| Eixo | mackswendhell/humanizer-pt-br | tapioca/humanizer-br |
|---|---|---|
| Distribuição | Skill standalone (`~/.claude/skills/`) | Plugin namespaceado (`/tapioca:humanizer-br`) |
| Engine de rewrite | Sempre Claude | Claude por padrão, **Maritaca sabia-3 opcional** |
| Companions | Apenas SKILL.md | Skill + agent multi-pass |
| Voice presets | Não | Sim (instruções por perfil de voz — ex. SOUL.md do autor) |
| Escopo | Único humanizer | Plugin extensível para outras skills PT-BR |

A licença MIT do prior art permite essa derivação; a atribuição é mantida em `SKILL.md`, `README.md` e neste documento.

## Convenções

- **PT-BR em tudo que é user-facing.** Comentários internos podem ser PT ou EN, sem mistura no mesmo arquivo.
- **Sem emojis** em SKILL.md, README, ou output da skill (a própria skill detecta emojis decorativos como traço de IA — seria contraditório usá-los).
- **Aspas retas** (`"`), nunca curvas (`"`).
- **Headings em sentence case**, nunca Title Case (regra que a própria skill aplica).
- **kebab-case ASCII** para nomes de skills, agents e arquivos. Nada de `ç`, `ã`, `é`. O nome do plugin (`tapioca`) já obedece.

## Distribuição

v0.1 distribuído por clone direto:

```bash
git clone https://github.com/gdantas/tapioca ~/.claude/plugins/tapioca
```

Submissão ao marketplace oficial Anthropic prevista para v0.2, quando houver pelo menos duas skills no plugin.

## Não-objetivos

- Reescrever conteúdo em **outras línguas** — escopo é PT-BR.
- Detectar IA **automaticamente** (classificador) — a skill assume que o texto foi gerado por IA ou precisa ser humanizado; não classifica.
- Substituir editor humano — a skill é assistiva, não autoritativa.
- Otimizar SEO ou copy de vendas — a meta é voz humana, não conversão.
