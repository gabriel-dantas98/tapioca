<p align="center">
  <img src="./assets/banner.jpg" alt="tapioca — We bring the base. You pick the filling." width="600" />
</p>

<h1 align="center">tapioca</h1>

<p align="center">
  <em>We bring the base. You pick the filling.</em>
</p>

<p align="center">
  <a href="https://github.com/gabriel-dantas98/tapioca/actions"><img src="https://github.com/gabriel-dantas98/tapioca/actions/workflows/smoke-test.yml/badge.svg" alt="smoke tests" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/plugin-claude--code-orange.svg" alt="claude-code plugin" />
  <img src="https://img.shields.io/badge/plugin-cursor-blue.svg" alt="cursor plugin" />
</p>

---

Distributable plugin for [Claude Code](https://code.claude.com/docs/en/plugins) and [Cursor](https://cursor.com/docs/reference/plugins). `tapioca` is a neutral base — you add fillings (skills + companion agents) under one namespace.

<details>
<summary><strong>PT</strong> — A nossa base, o seu recheio.</summary>

Plugin com skills e agents sob o namespace `tapioca`. A marca é a base; cada skill é um recheio. Algumas fillings são de domínio PT-BR (ex.: `humanizer-br`); outras são agnósticas (ex.: `multi-gen`, `google-sheets-apps-script`).

</details>

## Included skills

### `/tapioca:multi-gen`

Runs multiple AI CLIs in parallel (at least `codex` and `cursor-agent`) from an image briefing, validates each artifact (well-formed SVG), and builds a comparative HTML preview (light + dark + favicon strip at 16/32/48/180px) so you can pick a winner before manual polish.

- Portable parallel dispatch (macOS without `gtimeout`)
- Auth pre-check for `cursor-agent` (SKIP instead of hanging)
- Robust `<svg>` extraction when CLI stdout mixes logs
- Per-engine output: `raw.txt`, `out.<ext>`, `status.json` in the run dir

```text
/tapioca:multi-gen "geometric logo for Novarum, blue palette" --palette "#2E5BFF,#FFFFFF"
```

Pairs with a `preview-server` skill (control-plane) to serve `index.html`.

### `/tapioca:usabilidade-br`

Audits web app usability against Jakob Nielsen's 10 heuristics. Captures evidence via Chrome MCP, optionally correlates with source (`--code <path>`), and writes a local self-contained HTML report with:

- Overall score (0–100) and per-heuristic scores
- Visual evidence (embedded screenshots)
- Code snippets with `file:line` when the component is found
- **Copyable fix prompt** per violation — paste into another Claude Code session

Companion agent parallelizes 10 passes (one per heuristic) and builds the report.

```text
/tapioca:usabilidade-br http://localhost:3000 --code ./src
```

### `/tapioca:humanizer-br`

Removes AI writing tells from Brazilian Portuguese and injects a human voice. Catalog of 25+ patterns: promotional tone, stacked gerunds, negative parallelism, rule of three, English-style Title Case, curly quotes, dramatic hooks, chatbot residue, and more.

**Modes:**
- Claude-only (default): runs in-session, zero extra cost.
- Optional Maritaca: delegates rewrite to `sabia-3` (native PT-BR). Enabled when `MARITACA_API_KEY` is set.

Companion: `humanizer-br` agent (under `agents/`) for multi-pass with self-scoring.

### `/tapioca:google-sheets-apps-script`

Google Sheets and Google Docs automation via Apps Script (browser mode — no GCP for the end user). Docs are markdown-first. The agent runs the CLI; the user pastes links and confirms in Google's UI.

```text
/tapioca:google-sheets-apps-script
```

Upstream: [gist v2.6](https://gist.github.com/gabriel-dantas98/6ad86b6bfab840703ec214f228c3004b).

## Install

### Claude Code

```bash
git clone https://github.com/gabriel-dantas98/tapioca ~/.claude/plugins/tapioca
```

Restart Claude Code or run `/reload-plugins`.

### Cursor

```bash
git clone https://github.com/gabriel-dantas98/tapioca ~/.cursor/plugins/tapioca
```

The repo ships manifests for both platforms (`.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`) over the same `skills/` and `agents/`.

### Via --plugin-dir (Claude Code, local dev)

```bash
claude --plugin-dir /path/to/tapioca
```

### Local smoke (marketplace + dual-CLI)

Harness in `.agents/skills/smoke-test-skills/` — same source as CI:

```bash
.agents/skills/smoke-test-skills/run.sh marketplace                 # token-free
.agents/skills/smoke-test-skills/run.sh oneshot humanizer-br both   # uses tokens
.agents/skills/smoke-test-skills/run.sh all humanizer-br both
```

Cursor IDE: the harness creates `~/.cursor/plugins/local/tapioca` (symlink). Then: Developer → Reload Window.

## Usage

```text
/tapioca:humanizer-br Paste the text to humanize here.
```

Or natural language:

```text
Humanize this text, strip the AI smell.
```

For a serious multi-pass review, the companion agent is invoked automatically.

### Maritaca mode

```bash
export MARITACA_API_KEY="your-key-here"
```

The skill detects the env var and offers Maritaca when the text justifies it (long enough, or quality explicitly requested).

## Layout

```text
tapioca/
├── .claude-plugin/plugin.json
├── .cursor-plugin/plugin.json
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── skills/
│   ├── humanizer-br/
│   ├── usabilidade-br/
│   ├── multi-gen/
│   └── google-sheets-apps-script/
└── agents/
    ├── humanizer-br.md
    └── usabilidade-br.md
```

## Roadmap

| Version | Content |
|---|---|
| **v0.1** | `humanizer-br` (skill + agent), plugin format, AGENTS.md |
| **v0.2** | `usabilidade-br`, `multi-gen` |
| **v0.3** | `google-sheets-apps-script`, marketplace manifests |
| next | More fillings; official marketplace submissions |

No hooks, MCP, or LSP in the short term. Skills and agents until the collection justifies more.

## Credit

`humanizer-br` descends from:

- [blader/humanizer](https://github.com/blader/humanizer) (MIT) — canonical English humanizer for Claude Code / OpenCode.
- [mackswendhell/humanizer-pt-br](https://github.com/mackswendhell/humanizer-pt-br) (MIT, 2026) — first direct WikiProject AI Cleanup adaptation to PT-BR.

What `tapioca` adds: namespaced plugin, Claude Code + Cursor, optional Maritaca `sabia-3`, multi-pass companion agents, and room for fillings beyond writing.

## License

MIT — see `LICENSE`.
