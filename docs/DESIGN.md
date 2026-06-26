# DESIGN.md — Docs site (GitHub Pages)

## Goal
Página única, estática e auto-suficiente que serve como vitrine + documentação de instalação do tapioca, publicável no GitHub Pages sem build step. URL alvo: `https://gabriel-dantas98.github.io/tapioca`.

## Non-goals
- Não é um docs multi-página estilo Docusaurus/Mintlify (overkill pra 3 skills).
- Sem Jekyll/build (usa `.nojekyll`) — HTML+CSS puro, controle total da estética, zero CI de docs.
- Não documenta API interna nem código das skills — isso vive nos `SKILL.md`.

## Inputs
- Manifestos: `.claude-plugin/`, `.cursor-plugin/` (marketplace + plugin).
- Catálogo de skills: `skills/*/SKILL.md` (humanizer-br, usabilidade-br, multi-gen).
- Branding: `assets/banner.png`.

## Outputs
- `docs/index.html` — landing + docs (hero, skills, tabs de instalação por plataforma, roadmap, crédito).
- `docs/styles.css` — estilo self-contained (sem CDN).
- `docs/.nojekyll` — bypassa o Jekyll, serve os arquivos crus.
- `docs/assets/` — banner copiado (Pages não acessa `../assets`).

## Voice/Tone
PT-BR coloquial brasileiro sem ser caricato (voz do território). Direto, exemplo antes de explicação. Copy passa pelo `humanizer` antes de fechar.

## Estrutura de instalação documentada (corrigida)
- **Claude Code**: `/plugin marketplace add gabriel-dantas98/tapioca` → `/plugin install tapioca@tapioca`.
- **Cursor**: adicionar o marketplace `gabriel-dantas98/tapioca` e instalar o plugin `tapioca`.
- **Claude Desktop**: caminho separado — só `humanizer-br` como Skill avulsa (pasta/zip com `SKILL.md` via Settings → Capabilities → Skills). Agents e `/tapioca:*` não existem no Desktop.

## Deploy
GitHub Pages → Settings → Pages → Source: `Deploy from a branch` → branch `main`, pasta `/docs`. Sem Actions.

## Open questions
- Custom domain (ex.: `tapioca.gdantas.com.br`) no futuro? Por ora, project pages default.
- Bilíngue (PT/EN) pra alcance no marketplace internacional? v1 fica PT-BR only.
