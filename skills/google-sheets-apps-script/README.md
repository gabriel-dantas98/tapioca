# Google Workspace Agent — Cursor + Claude Code Skill

Self-service **Google Sheets**, **Google Docs**, and **Google Slides** automation via Apps Script (browser mode, no GCP for end users). Docs content is **Markdown-first**; Slides supports deck inspection, template copying, text, images, backgrounds, and slide management.

## Install

### As part of the `tapioca` plugin (preferred)

```bash
# Claude Code
git clone https://github.com/gabriel-dantas98/tapioca ~/.claude/plugins/tapioca

# Cursor
git clone https://github.com/gabriel-dantas98/tapioca ~/.cursor/plugins/tapioca
```

Restart the IDE (or `/reload-plugins` in Claude Code), then invoke `/tapioca:google-sheets-apps-script`.
This is the source of truth — see the [repo root README](../../README.md) for the full plugin install flow.

### Standalone (this skill only, no full plugin)

Clone straight from GitHub — no gist involved, so you always get the current version:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/gabriel-dantas98/tapioca /tmp/tapioca-skill
git -C /tmp/tapioca-skill sparse-checkout set skills/google-sheets-apps-script

# Cursor
cp -r /tmp/tapioca-skill/skills/google-sheets-apps-script ~/.cursor/skills/google-sheets-apps-script

# Claude Code
cp -r /tmp/tapioca-skill/skills/google-sheets-apps-script ~/.claude/skills/google-sheets-apps-script

rm -rf /tmp/tapioca-skill
```

A plain `git clone` already produces the right directory layout, so no separate `install.sh` step is needed — just copy (or symlink) the folder into place.

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

`SKILL_ROOT` depends on how you installed it — see the table in [SKILL.md](SKILL.md#runtime-paths-tapioca-plugin--standalone).

```bash
# tapioca plugin (Claude Code)
CLI="$HOME/.claude/plugins/tapioca/skills/google-sheets-apps-script/scripts/sheets_agent.py"
# tapioca plugin (Cursor)
# CLI="$HOME/.cursor/plugins/tapioca/skills/google-sheets-apps-script/scripts/sheets_agent.py"
# standalone install
# CLI="$HOME/.claude/skills/google-sheets-apps-script/scripts/sheets_agent.py"
# CLI="$HOME/.cursor/skills/google-sheets-apps-script/scripts/sheets_agent.py"

python3 "$CLI" status --document-url "https://docs.google.com/document/d/.../edit"
python3 "$CLI" status --presentation-url "https://docs.google.com/presentation/d/.../edit"
python3 "$CLI" browser-auth
python3 "$CLI" call --document-url "..." --payload '{"action":"listDocTabs"}'
python3 "$CLI" call --document-url "..." --payload '{"action":"createDocTab","name":"New Tab"}'
python3 "$CLI" call --presentation-url "..." --payload '{"action":"appendTextBox","slideIndex":0,"text":"Quarterly update","x":72,"y":72,"width":576,"height":48}'
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

## Maintainer: optional gist mirror

The GitHub repo (this folder) is the source of truth — installs above never touch the gist. The gist is kept only as a legacy single-file mirror for tooling that can't clone a repo; it is **not** required for the plugin or standalone installs and drifts if not republished after a feature change:

```bash
bash scripts/publish_gist.sh
```

Gist: https://gist.github.com/gabriel-dantas98/6ad86b6bfab840703ec214f228c3004b

## Version

**v3.0.0** — Google Slides support: deck inspection, slide CRUD/reordering, text/image/background editing, replacement, and cross-deck template copying.
