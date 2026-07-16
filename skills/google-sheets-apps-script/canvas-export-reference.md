# Canvas export (agnostic PNG renderer)

Renders a **JSON manifest** to PNG. No Google APIs, no Cursor runtime, no `.canvas.tsx` parsing.

Use this when you want: **Cursor canvas (IDE preview) + manifest (export source) + optional Doc upload**.

## Commands

Standalone (no `sheets_agent`):

```bash
python3 .../scripts/canvas_export.py --manifest report.canvas.json
python3 .../scripts/canvas_export.py --manifest report.canvas.json --out /tmp/report.png --json
python3 -m canvas_export --manifest report.canvas.json   # from scripts/
```

Via agent CLI (thin wrapper, same behavior):

```bash
python3 .../scripts/sheets_agent.py canvas-export --manifest report.canvas.json
```

Upload to Google Doc stays **separate**:

```bash
PNG=$(python3 .../scripts/canvas_export.py --manifest report.canvas.json)
python3 .../scripts/sheets_agent.py upload \
  --file "$PNG" \
  --document-url "https://docs.google.com/document/d/.../edit" \
  --append \
  --share-domain quintoandar.com.br
```

## Manifest v1

Example: [examples/canvas-manifest.v1.json](../examples/canvas-manifest.v1.json)

| Field | Required | Description |
|-------|----------|-------------|
| `version` | yes | Must be `1` |
| `layout.width` | no | Default `960` |
| `layout.theme` | no | `dark` (default) or `light` |
| `header.title` | yes | Main heading |
| `header.subtitle` | no | Secondary line |
| `header.badge` | no | Pill label under title |
| `stats[]` | no | `{ label, value, emphasis? }` row |
| `blocks[]` | no | Content blocks (see below) |

### Block types

| type | keys |
|------|------|
| `table` | `title`, `headers`, `rows`, optional `trailing` |
| `bar_chart` | `title`, `categories`, `series[{name,data}]`, optional `valueSuffix`, `caption` |
| `callout` | `tone` (`success`/`warning`/`info`), `title`, `lines[]` |
| `tags` | optional `title`, `items[]`, optional `footer` |

## Agent workflow

1. Write `.canvas.tsx` for IDE preview (Cursor skill).
2. Write matching `.canvas.json` beside it (export source of truth).
3. `canvas-export` → PNG.
4. `upload --append` → Google Doc.

Keep manifest data in sync with the canvas manually for now — the export layer does not read TSX.

## Dependencies

- **Pillow** — installed by `scripts/setup.sh` (`pip install pillow`).
