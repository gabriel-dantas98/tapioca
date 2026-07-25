# Actions catalog (Code.gs v1.2.0+)

## Cells

```json
{ "action": "read", "sheetName": "Finance", "range": "A1:G20", "includeNotes": true }
```

```json
{ "action": "update", "sheetName": "Finance", "range": "A1", "value": "Title" }
```

```json
{ "action": "update", "sheetName": "Finance", "range": "A3:G3", "values": [["Metric","Jan","Feb","Mar","Apr","May","Jun"]] }
```

```json
{ "action": "create", "sheetName": "Finance", "values": [["New row","100","200"]] }
```

```json
{ "action": "delete", "sheetName": "Finance", "range": "A10:G10" }
```

```json
{ "action": "delete", "sheetName": "Finance", "row": 10 }
```

```json
{
  "action": "style",
  "sheetName": "Finance",
  "range": "A1:G1",
  "style": { "bold": true, "background": "#1e293b", "fontColor": "#ffffff", "horizontalAlign": "center" }
}
```

```json
{ "action": "comment", "sheetName": "Finance", "range": "B4", "text": "revisar valor" }
```

## Tabs

```json
{ "action": "listSheets" }
```

Aliases: `listTabs`, `createTab`, `renameTab`, `deleteTab`, `setTabColor`.

```json
{ "action": "createSheet", "name": "Runway", "tabColor": "#059669", "index": 1, "activate": false }
```

```json
{ "action": "renameSheet", "sheetName": "Sheet1", "newName": "Finance" }
```

```json
{ "action": "tabColor", "sheetName": "Finance", "tabColor": "#0f172a" }
```

```json
{ "action": "tabColor", "sheetName": "Finance", "tabColor": null }
```

```json
{ "action": "deleteSheet", "sheetName": "Old Draft" }
```

## Batch

```json
{
  "action": "batch",
  "commentPrefix": "claude: ",
  "ops": [
    { "action": "createSheet", "name": "Cap Table", "tabColor": "#7c3aed" },
    { "action": "renameSheet", "sheetName": "Sheet1", "newName": "Finance" },
    { "action": "update", "sheetName": "Finance", "range": "A1", "value": "Dashboard" },
    { "action": "comment", "sheetName": "Finance", "range": "A1", "text": "gerado pelo agent" }
  ]
}
```

---

## Google Slides

All Slides calls use `--presentation-url`; coordinates are points. Inspect existing decks first.

```json
{ "action": "listSlides" }
```

```json
{ "action": "getSlide", "slideIndex": 0 }
```

```json
{ "action": "createSlide", "index": 2, "layout": "BLANK" }
```

```json
{ "action": "appendTextBox", "slideIndex": 0, "text": "Quarterly update", "x": 72, "y": 72, "width": 576, "height": 48, "style": { "fontSize": 28, "bold": true } }
```

```json
{ "action": "styleText", "slideIndex": 0, "objectId": "SLIDES_API123_0", "style": { "fontFamily": "Archivo Black", "fontSize": 28, "bold": true } }
```

```json
{ "action": "insertShape", "slideIndex": 0, "shapeType": "ROUND_RECTANGLE", "x": 72, "y": 144, "width": 240, "height": 80, "fill": "#0f172a", "text": "Palestra", "style": { "fontSize": 18, "bold": true, "foregroundColor": "#ffffff" } }
```

```json
{ "action": "insertImage", "slideIndex": 0, "url": "https://example.com/chart.png", "x": 72, "y": 144, "width": 240, "height": 160 }
```

```json
{ "action": "replaceText", "find": "{{client}}", "replace": "Tapioca" }
```

```json
{ "action": "copySlide", "sourcePresentationId": "SOURCE_DECK_ID", "sourceSlideIndex": 1, "insertionIndex": 3 }
```

`deleteSlide` is destructive: ask for confirmation first. `copySlide` copies the source master, layout, and assets when needed.

---

# Style object fields

| field | type | example |
|-------|------|---------|
| `bold` | bool | `true` |
| `italic` | bool | `true` |
| `fontSize` | number | `12` |
| `fontFamily` | string | `"Arial"` |
| `fontColor` | hex | `"#ffffff"` |
| `background` | hex | `"#0f172a"` |
| `horizontalAlign` | string | `"center"` / `"left"` / `"right"` |
| `verticalAlign` | string | `"top"` / `"middle"` / `"bottom"` |
| `wrap` | bool | `true` |
| `numberFormat` | string | `"\"R$\"#,##0"` / `"0.0%"` |

---

# End user checklist (browser mode)

See [wizard.md](wizard.md) for agent message templates. Summary:

| Step | User | Agent |
|------|------|-------|
| 0 | — | `setup.sh` + `setup --check-only` |
| 1 | Open [sheets.new](https://sheets.new) or paste sheet URL | `status --spreadsheet-url` |
| 2 | Apps Script + deploy **or** paste script URL | `clasp_bootstrap.sh` or manual + `register` |
| 3 | Google login in browser window | `browser-auth` |
| 4 | Confirm test cell | `call` update A1 |

---

# Fresh machine (agent)

```bash
bash scripts/setup.sh
python3 scripts/sheets_agent.py setup --check-only
python3 scripts/sheets_agent.py status
```

---

# Unregistered spreadsheet

```bash
python3 scripts/sheets_agent.py status --spreadsheet-url "https://docs.google.com/spreadsheets/d/.../edit"
# registered: false → wizard.md
```

---

# CLI

```bash
CLI="$SKILL_ROOT/scripts/sheets_agent.py"

python3 "$CLI" status
python3 "$CLI" browser-auth
python3 "$CLI" register --spreadsheet-url "..." --web-app-url "..."
python3 "$CLI" call --spreadsheet-url "..." --payload '{...}'
python3 "$CLI" parse --spreadsheet "..." --web-app "..." --script "..."
```

---

# Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Unknown action: listSheets` | Update Code.gs to v1.2.0 → redeploy new version |
| `Unknown action: undefined` | POST payload must be direct JSON (not wrapped) — fixed in CLI |
| Column count mismatch | `A1:G1` needs 7 values in the row |
| Redirect to login | `browser-auth` again |
| Sheet already exists | Ask user: use existing or pick another name |
| Cannot delete only sheet | Create another tab first |
| Playwright missing | `pip3 install playwright && python3 -m playwright install chromium` |

---

# When agent should ask (quick ref)

- delete tab / clear large range
- ambiguous tab name
- vague "organize" / "improve" requests
- overwrite vs new tab
- color/branding not specified
- multiple spreadsheets in registry
