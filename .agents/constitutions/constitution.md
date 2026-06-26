# Constituição do tapioca

Leis do repositório. Não-negociáveis. Mudança aqui é decisão consciente, não conveniência.

## 0. Tese

tapioca é um **repositório central de capabilities de IA reusáveis** — skills, agents e MCPs — versionados, validados e instaláveis no Claude Code e no Cursor. A postura é de platform engineering: em vez de skill solta espalhada por repo, um hub único com manifesto, CI e padrão de contribuição. A massa é neutra; os recheios evoluem. O conteúdo de hoje é PT-BR, mas o repo não é PT-BR-locked.

## 1. Fonte de verdade vendor-neutral

`.agents/` é a fonte canônica de guidance pra qualquer agente (Claude, Cursor, Bugbot, etc.).
`AGENTS.md` e `CLAUDE.md` na raiz são **routers finos** — apontam pra cá, não repetem política.
Arquivos vendor-specific (`.cursor/`, adapters de review) são adapters: o mínimo pra cada ferramenta achar o canônico.

Não duplique regra durável entre vendors. Se duas ferramentas precisam da mesma instrução, ela mora uma vez em `.agents/` e os adapters apontam.

## 2. Produto vs. guia do repo

Distinção que sustenta o layout:

- `skills/` e `agents/` na raiz são **componentes shippados** do plugin (os "recheios"). O formato Claude Code / Cursor exige eles ali — `plugin.json` aponta pra `./skills/` e `./agents/`. **Não mover pra `.agents/`.**
- `.agents/skills/` e `.agents/commands/` são **workflows de dev** pra quem trabalha no repo (ex.: smoke-test). Não são distribuídos no plugin.

## 3. Voz e tipografia

- **Cada skill declara sua própria voz** no DESIGN.md. As skills de hoje são PT-BR; o repo aceita qualquer domínio/idioma desde que a skill diga qual é a voz dela. A guidance do repo (`.agents/`, README) é PT-BR.
- **Sem emojis** em SKILL.md, README ou output de skill. A própria `humanizer-br` trata emoji decorativo como traço de IA — usar seria contradição.
- **Aspas retas** (`"`), nunca curvas.
- **Headings em sentence case**, nunca Title Case.
- **kebab-case ASCII** pra nomes de skill, agent e arquivo. Sem `ç`, `ã`, `é`. O nome `tapioca` já obedece.

## 4. Processo por skill nova

- **DESIGN.md primeiro.** Cada skill começa por `skills/<nome>/DESIGN.md` (Goal · Non-goals · Inputs · Outputs · Voice · Open questions). Sem exceção.
- **Skill + agent companion** quando a tarefa pede multi-pass, autoavaliação ou raciocínio iterativo: skill é o entry point, agent vai em `agents/<nome>.md`.
- **Manifestos sincronizados.** Toda skill/agent nova aparece em `.claude-plugin/plugin.json` E `.cursor-plugin/plugin.json`. Marketplace nos dois: `.claude-plugin/marketplace.json` E `.cursor-plugin/marketplace.json`.
- **Smoke test antes de pronto.** Caso mínimo em `tests/` + entrada no harness de `.agents/skills/smoke-test-skills/`.
- **Texto user-facing passa pelo humanizer** antes de mergear.

## 5. Não-objetivos do repo

- **Não é dumping ground.** Toda capability entra com DESIGN.md, manifesto sincronizado e smoke test. Sem skill órfã ou não-validada.
- **Não acopla a serviço externo sem justificativa.** Capability deve rodar no Claude/CLI por padrão. Dependência de API de terceiro exige decisão explícita no DESIGN.md, nunca como default silencioso.
- **Não é vendor-locked.** O que serve aos dois alvos mora no canônico; adapters ficam mínimos.
- **Não substitui o humano.** As capabilities são assistivas, não autoritativas.
