# DESIGN — google-sheets-apps-script

## Goal

Automatizar Google Sheets, Google Docs e Google Slides para usuários não técnicos via Apps Script + browser mode (sem GCP pro usuário final). O agent roda todo o terminal; o usuário só abre links, clica na UI do Google e cola URLs.

Docs são **markdown-first** (`appendMarkdown`, tabelas, imagens, abas de doc). Sheets cobre CRUD de células, estilo, comentários, abas e batch. Slides cobre inspeção, CRUD/reordenação, texto, imagens, backgrounds e cópia entre decks.

## Non-goals

- Não é substituto do Google Workspace Admin nem de integrações enterprise (Service Account em produção).
- Não expõe terminal, GCP, OAuth client setup ou `clasp` pro usuário final — só pro agent/maintainer.
- Não parseia `.canvas.tsx` — export PNG vem de manifest JSON agnóstico (`canvas-export`).
- Não é skill de PT-BR editorial — wizard fala PT-BR com usuário, mas a capability é workspace automation.

## Inputs

- URL completa de planilha (`/spreadsheets/d/...`), documento (`/document/d/...`) ou apresentação (`/presentation/d/...`).
- Payload JSON por action (`read`, `update`, `appendMarkdown`, `listDocTabs`, `copySlide`, etc.).
- Arquivos locais para `upload` ou manifest para `canvas-export`.

## Outputs

- Respostas JSON do web app Apps Script via `sheets_agent.py call`.
- Registry em `~/.config/google-sheets-agent/registry.json` (deployments de planilhas, documentos e apresentações registrados).
- PNG de canvas-export; imagens no Drive/Docs após upload.

## Voice/Tone

Wizard e mensagens ao usuário: **PT-BR coloquial**, uma pergunta por turno, sem jargão ("link da planilha", nunca "spreadsheetId"). Celebra wins curtos ("Aba criada ✓").

## Distribution

- **Upstream:** gist https://gist.github.com/gabriel-dantas98/6ad86b6bfab840703ec214f228c3004b (v3.0.0)
- **tapioca:** `skills/google-sheets-apps-script/` — invoke `/tapioca:google-sheets-apps-script`
- CLI resolve `SKILL_DIR` via `Path(__file__).parents[1]` — funciona em qualquer install path

## Smoke / evals

- `evals/run_static.py` — token-free: templates Apps Script, CLI parse, status JSON
- `evals/run_integration.py` — live Google (local/maintainer only)

## Open questions

- Companion agent (`agents/google-sheets-apps-script.md`) quando onboarding multi-planilha virar rotina?
- Sync automático gist ↔ tapioca via CI ou manual `scripts/publish_gist.sh`?
