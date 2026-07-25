# Google Workspace Agent — Cursor + Claude Code Skill

Self-service **Google Sheets**, **Google Docs**, and **Google Slides** automation via Apps Script (browser mode, no GCP for end users). Docs content is **Markdown-first**; Slides supports deck inspection, template copying, text, images, backgrounds, and slide management.

## Install

```bash
gh gist clone 6ad86b6bfab840703ec214f228c3004b /tmp/google-sheets-agent-skill
cd /tmp/google-sheets-agent-skill

# Cursor (default)
bash install.sh

# Claude Code (same registry, separate skill path)
bash install-claude.sh
```

Custom path:

```bash
bash install.sh ~/.cursor/skills/google-sheets-apps-script
bash install.sh ~/.claude/skills/google-sheets-apps-script
```

Gist files use **flat names** (`templates-Code.gs`, `docs-reference.md`, …). `install.sh` restores the directory layout.

## Shared config

Both Cursor and Claude Code use:

- `~/.config/google-sheets-agent/registry.json` — registered spreadsheets/docs/presentations + deployments
- `~/.config/google-sheets-agent/browser-profile/` — Google login for browser mode

Register once in either IDE; the other picks up the same deployments.

## Dependencies (agent runs once)

```bash
bash scripts/setup.sh
# pip: playwright + pillow
```

### clasp (maintainer — deploy)

```bash
npx @google/clasp@2.4.2 login

bash scripts/clasp_bootstrap.sh \
  --spreadsheet-url "https://docs.google.com/spreadsheets/d/.../edit" \
  --script-id "SCRIPT_ID" \
  --update-only
```

## CLI highlights

```bash
# Cursor or Claude — adjust SKILL_ROOT
CLI="$HOME/.cursor/skills/google-sheets-apps-script/scripts/sheets_agent.py"
# CLI="$HOME/.claude/skills/google-sheets-apps-script/scripts/sheets_agent.py"

python3 "$CLI" status --document-url "https://docs.google.com/document/d/.../edit"
python3 "$CLI" status --presentation-url "https://docs.google.com/presentation/d/.../edit"
python3 "$CLI" browser-auth
python3 "$CLI" call --document-url "..." --payload '{"action":"listDocTabs"}'
python3 "$CLI" call --document-url "..." --payload '{"action":"createDocTab","name":"New Tab"}'
python3 "$CLI" upload --file image.png --document-url "..." --append
python3 "$CLI" canvas-export --manifest report.canvas.json
```

## Files

| Path | Purpose |
|------|---------|
| `SKILL.md` | Agent instructions |
| `ARCHITECTURE.md` | Team-facing deep dive — architecture, dependencies, onboarding/daily-use flows (Mermaid diagrams, PT-BR) |
| `wizard.md` | Non-technical onboarding (PT-BR) |
| `reference.md` | Sheets actions + troubleshooting |
| `docs-reference.md` | Docs markdown / tables / images / upload |
| `canvas-export-reference.md` | Manifest → PNG (decoupled) |
| `templates/` | Apps Script v3.0 |
| `scripts/sheets_agent.py` | Browser/OAuth CLI |
| `scripts/canvas_export/` | Agnostic PNG export |
| `evals/` | Static + integration evals |

## Maintainer: update gist

```bash
bash scripts/publish_gist.sh
```

Gist: https://gist.github.com/gabriel-dantas98/6ad86b6bfab840703ec214f228c3004b

## Version

**v3.0.0** — Google Slides support: deck inspection, slide CRUD/reordering, text/image/background editing, replacement, and cross-deck template copying.
