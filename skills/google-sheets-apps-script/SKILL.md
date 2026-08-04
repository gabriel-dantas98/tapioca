---
name: google-sheets-apps-script
description: Self-service Google Sheets and Google Docs automation via Apps Script and browser mode (no GCP for end users). Prefer markdown for Google Docs (appendMarkdown, tables, images, doc tabs). Guides non-technical users on fresh machines, onboard unregistered files, and performs CRUD, styling, comments, tabs (Sheets + Docs), upload, and rich document editing. Use via /tapioca:google-sheets-apps-script (tapioca plugin) or standalone in Cursor/Claude Code when the user mentions Google Sheets, Google Docs, planilha, documento, markdown docs, or Apps Script web app setup.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Google Sheets & Docs Agent (Apps Script)

**Audience:** non-technical users. **Agent runs all terminal.** User opens links, clicks Google UI, pastes URLs.

**Onboarding:** [wizard.md](wizard.md) — Sheets **or** Docs, one question per turn.

## Runtime paths (tapioca plugin + standalone)

Both IDEs share the same registry and browser profile (`~/.config/google-sheets-agent/`).

**Resolve `SKILL_ROOT` before any CLI call** — directory that contains this `SKILL.md`:

| Install | `SKILL_ROOT` |
|---------|--------------|
| **tapioca plugin** (preferred) | `<plugin-root>/skills/google-sheets-apps-script` — invoke `/tapioca:google-sheets-apps-script` |
| tapioca dev (repo clone) | `skills/google-sheets-apps-script/` (relative to repo root) |
| Cursor standalone | `~/.cursor/skills/google-sheets-apps-script/` |
| Claude Code standalone | `~/.claude/skills/google-sheets-apps-script/` |

```bash
CLI="$SKILL_ROOT/scripts/sheets_agent.py"
```

Upstream gist (standalone install only): https://gist.github.com/gabriel-dantas98/6ad86b6bfab840703ec214f228c3004b

**Comment replies:** pass `"host": "cursor"` in Cursor or `"host": "claude"` in Claude Desktop/Code (CLI auto-injects when omitted).

---

## Resource types

| Type | User says | URL pattern | CLI flag |
|------|-----------|-------------|----------|
| Spreadsheet | planilha | `/spreadsheets/d/...` | `--spreadsheet-url` |
| Document | doc / Google Docs | `/document/d/...` | `--document-url` |

Check registration:

```bash
python3 .../sheets_agent.py status --document-url "https://docs.google.com/document/d/.../edit"
python3 .../sheets_agent.py status --spreadsheet-url "https://docs.google.com/spreadsheets/d/.../edit"
```

**Unregistered** → wizard. **Never `call` until `registered: true`.**

---

## Google Docs — prefer Markdown

**Write structured content with `appendMarkdown`**, not plain `appendDoc`. The agent drafts markdown; Apps Script renders headings, lists, bold, links, tables, and images into native Google Docs styling.

| action | purpose |
|--------|---------|
| **`appendMarkdown`** | **Preferred** — render markdown block at end (`markdown` or `text`) |
| `appendTable` | 2D `rows` array → styled table (`headerRow` default true) |
| `appendImage` | Image from public `url` or `driveFileId` (+ optional `maxWidth`, `alt`); pass `index` (0-based body child index) to insert at a position instead of appending, `tabId` to target a doc tab |
| `readDoc` | full text + optional paragraph structure |
| `listDoc` | headings, paragraph count (heading `index` is a **paragraph** index, not a body-child index) |
| `docChildren` / `listChildren` | list every body child with its 0-based **child index**, type, heading, and text preview — the map you need to compute safe `startChild`/`endChild` for `deleteElements` (paragraph indices from `listDoc` do NOT match child indices when tables/images exist); tab-aware via `tabId` |
| `appendDoc` | single plain paragraph only (fallback) |
| `insertDoc` / `replaceDoc` / `styleDoc` / `commentDoc` / `deleteDoc` | surgical edits |
| `deleteElements` / `deleteRange` | delete a contiguous range of top-level body children by index (`startChild`, `endChild`, inclusive, 0-based); tab-aware via `tabId`; keeps the body non-empty. Google Docs forbids removing the **terminal** paragraph of a section — insert content after it first, or exclude it from the range |
| `readDocComments` | read native Google Docs comment threads (+ replies) |
| `replyDocComment` | reply in a native comment thread (`commentId` + `text`) |
| `resolveDocComment` | mark thread resolved (`commentId`, optional `resolved`) |
| `batch` | mix markdown, tables, images, and low-level ops |

```bash
python3 .../sheets_agent.py call \
  --document-url "https://docs.google.com/document/d/.../edit" \
  --payload '{"action":"appendMarkdown","markdown":"# Report\n\n**Status:** green\n\n| KPI | Value |\n| --- | --- |\n| Uptime | 99.9% |"}'
```

Full markdown/table/image spec: [docs-reference.md](docs-reference.md)

---

## Golden rules

1. **One step per message** — ask, wait, confirm, next
2. **No jargon** — "link da planilha", "aba", never "spreadsheetId" or "deployment"
3. **User pastes full URLs** — agent parses IDs
4. **Agent runs all CLI** — never tell the user to run python, npm, or terminal
5. **When in doubt, ask** — destructive/ambiguous ops need confirmation
6. **Celebrate wins** — "Aba criada ✓", "Planilha conectada ✓"
7. **Unregistered sheet** — never call API until wizard completes
8. **Google Docs content** — draft markdown, call `appendMarkdown`; use `appendTable` / `appendImage` when data is structured or visual
9. **Native comment replies** — every `replyDocComment` **MUST** include host attribution. Pass `"host": "cursor"` in Cursor or `"host": "claude"` in Claude Desktop; CLI auto-injects when omitted. Apps Script appends `\n\n> replied from {host}` — never skip. After fixing doc feedback, reply **Fixed** (or equivalent) and set `"resolve": true`.

---

## Every request — decision flow

```
1. setup (silent on first use if not ready)
   bash .../scripts/setup.sh          # fresh machine
   python3 .../sheets_agent.py setup --check-only

2. status
   python3 .../sheets_agent.py status [--spreadsheet-url URL]

3. Branch:
   ├─ skill_ready: false     → skill missing on disk (tapioca: reinstall plugin; standalone: gist install.sh) — agent only
   ├─ registered: false    → wizard.md (one question per turn)
   ├─ browser_ready: false → browser-auth (explain login window to user)
   └─ all true               → understand intent → listSheets/read if needed → plan → call

4. On call errors → wizard.md error table → fix → retry
```

**User asks to edit a sheet without URL:** ask for link first, then `status --spreadsheet-url`.

**User gives URL but `registered: false`:** "Essa planilha ainda não está conectada" → wizard from step 0.

**User gives URL and `registered: true`:** skip onboarding, go to work (still confirm destructive ops).

---

## Fresh machine (agent only — user sees nothing technical)

Run once per machine before any spreadsheet work:

```bash
bash "$SKILL_ROOT/scripts/setup.sh"
python3 "$SKILL_ROOT/scripts/sheets_agent.py" setup --check-only
```

Installs: `python3`, `playwright`, chromium browser. No global npm required.

If `SKILL_ROOT` missing (not on tapioca plugin path):

```bash
# standalone fallback — tapioca users should clone the plugin instead
gh gist view 6ad86b6bfab840703ec214f228c3004b --filename install.sh > /tmp/gs-install.sh
# fetch gist files, then: bash /tmp/gs-install.sh ~/.cursor/skills/google-sheets-apps-script
```

---

## Onboarding unregistered spreadsheets

Follow [wizard.md](wizard.md). Summary:

| Step | User does | Agent does |
|------|-----------|------------|
| 0 | New sheet or paste URL | `parse`, `status --spreadsheet-url` |
| 1 | Paste spreadsheet URL | check `registered` |
| 2a | Paste script URL (if clasp) | `clasp_bootstrap.sh` — full deploy |
| 2b | Apps Script UI clicks | wait for web app `/exec` URL → `register` |
| 3 | Login in browser window | `browser-auth` |
| 4 | Confirm A1 test cell | `call` update A1 |

**Prefer clasp** when `clasp_logged_in: true` (agent deploys Code.gs — user only opens Apps Script once for script URL).

**Manual path** when no clasp: user clicks Extensions → Apps Script → Deploy; agent pastes Code.gs content in chat if needed.

---

## When to ask the user (mandatory)

| Situation | Example question |
|-----------|------------------|
| Unregistered spreadsheet | "Cola o **link da planilha** que ainda não conectamos." |
| Destructive action | "Posso **apagar a aba** `Sheet1`? Não tem undo fácil." |
| Ambiguous tab | "Vi `Finance` e `Financeiro` — qual aba?" |
| Vague request | "Quer kanban, financeiro, ou cap table?" |
| Overwrite content | "Já tem dados — **substituo** ou crio aba nova?" |
| Multiple spreadsheets | "Qual planilha? Cola o link." |

**OK without asking:** explicit values, read-only ops, user said "pode fazer", single registered sheet + clear target.

---

## Daily use (registered + browser ready)

```bash
python3 "$SKILL_ROOT/scripts/sheets_agent.py" call \
  --spreadsheet-url "https://docs.google.com/spreadsheets/d/.../edit" \
  --payload '{"action":"read","range":"A1:G10","sheetName":"Finance"}'
```

If only one spreadsheet registered, `--spreadsheet-url` optional.

Login expired → `browser-auth` → tell user: "Vou abrir o Google de novo."

---

## Capabilities

### Cells

| action | purpose | key fields |
|--------|---------|------------|
| `read` | read values/formulas/notes | `range`, `sheetName?`, `includeNotes?` |
| `update` | set cell(s) | `range`, `value` or `values`, `sheetName?` |
| `create` | append/insert row | `values`, `row?`, `sheetName?` |
| `delete` | clear/delete rows | `range`, `row`, `rows[]`, `sheetName?` |
| `style` | format | `range`, `style: { bold, background, fontColor, numberFormat, ... }` |
| `comment` | cell note | `range`, `text` |
| `batch` | many ops | `ops: [...]` |

### Tabs (Sheets) — v2.4.0+

Works with `--spreadsheet-url` **or** shared deploy via `--document-url` (routes by action, not URL).

| action | aliases | purpose |
|--------|---------|---------|
| `listSheets` | `listTabs` | list all tabs |
| `createSheet` | `createTab` | new tab (`name`, optional `tabColor`, `index`, `activate`) |
| `renameSheet` | `renameTab` | rename (`sheetName` + `newName`) |
| `deleteSheet` | `deleteTab` | remove — **ask first** |
| `tabColor` | `setTabColor` | tab color |

### Tabs (Google Docs) — v2.6.0+

Organizational doc tabs (URL `?tab=t.xxx`). Requires **Docs API** advanced service on the Apps Script project.

| action | purpose |
|--------|---------|
| `listDocTabs` | list tabs (`tabId`, `title`, `index`) |
| `createDocTab` | new tab (`name`) |
| `renameDocTab` | rename (`tabId`, `name`) |

Write into a specific tab: `appendMarkdown` with `tabId`.

```bash
python3 .../sheets_agent.py call --document-url "..." \
  --payload '{"action":"createDocTab","name":"Current Knowledge Ingestion"}'

python3 .../sheets_agent.py call --document-url "..." \
  --payload '{"action":"appendMarkdown","tabId":"t.xxx","markdown":"# Section\n\nContent..."}'
```

### Upload + canvas export — v2.5+

```bash
python3 .../sheets_agent.py upload --file image.png --document-url "..." --append
python3 .../sheets_agent.py canvas-export --manifest report.canvas.json
```

See [canvas-export-reference.md](canvas-export-reference.md) and [docs-reference.md](docs-reference.md).

```bash
python3 .../sheets_agent.py call --spreadsheet-url "..." \
  --payload '{"action":"createTab","name":"Runway","tabColor":"#059669"}'

python3 .../sheets_agent.py call --spreadsheet-url "..." \
  --payload '{"action":"renameTab","sheetName":"Sheet1","newName":"Finance"}'
```

Details + examples: [reference.md](reference.md)

---

## Agent recipes

**Read before write** on existing workbooks:

```bash
python3 .../sheets_agent.py call ... --payload '{"action":"listSheets"}'
python3 .../sheets_agent.py call ... --payload '{"action":"read","sheetName":"Finance","range":"A1:G30"}'
```

**Range width:** `A1:G7` = 7 columns — match `values` width.

**Redeploy / fix outdated script:**

```bash
bash .../scripts/clasp_bootstrap.sh --spreadsheet-url "..." --script-id "..." --update-only
# or user pastes new /exec URL → register
```

---

## Maintainer automation (agent only — never show to end users)

| Tool | When |
|------|------|
| `clasp_bootstrap.sh` | clasp logged in — push + deploy + register |
| `bootstrap` | OAuth client configured — Apps Script API |
| `setup.sh` | fresh machine |

---

## Rules

- Wizard = **one question per turn** — see [wizard.md](wizard.md)
- **Never** `call` on unregistered spreadsheet
- **Never** send end user to GCP / API tokens / terminal
- Prefer `--spreadsheet-url` over deployment ids
- Split large `batch` if payload too big

## Files

| File | Purpose |
|------|---------|
| [wizard.md](wizard.md) | Non-technical onboarding messages |
| [templates/Code.gs](templates/Code.gs) | Apps Script v1.2.0+ |
| [scripts/setup.sh](scripts/setup.sh) | Fresh machine deps |
| [scripts/clasp_bootstrap.sh](scripts/clasp_bootstrap.sh) | Automated deploy |
| [scripts/sheets_agent.py](scripts/sheets_agent.py) | CLI |
| [canvas-export-reference.md](canvas-export-reference.md) | Manifest → PNG (agnostic export) |
| [reference.md](reference.md) | Actions + troubleshooting |
