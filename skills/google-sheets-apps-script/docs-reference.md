# Google Docs actions (Code.gs v2.1.0 + Docs.gs + MarkdownDoc.gs)

Always pass `documentId` via `--document-url` on CLI (auto-injected).

## Prefer Markdown

**Default for new content:** use `appendMarkdown` — not raw `appendDoc` — so headings, lists, bold, links, tables, and images render with proper Google Docs styling.

| Use | When |
|-----|------|
| `appendMarkdown` | Reports, specs, notes, anything with structure |
| `appendTable` | Spreadsheet-like data without markdown ceremony |
| `appendImage` | Single image from URL or Drive |
| `appendDoc` | One plain paragraph only (rare) |

---

## Markdown (`appendMarkdown`)

```json
{
  "action": "appendMarkdown",
  "markdown": "# Status Report\n\n**Owner:** Platform\n\n## Summary\n\n- Item one\n- Item **two**\n\n| Metric | Value |\n| --- | --- |\n| Uptime | 99.9% |\n\n![diagram](https://example.com/chart.png)"
}
```

Replace entire doc body:

```json
{ "action": "appendMarkdown", "clear": true, "markdown": "# Fresh doc\n\nContent..." }
```

### Supported syntax

| Markdown | Renders as |
|----------|------------|
| `#` … `######` | Heading 1–6 |
| `**bold**` / `__bold__` | Bold |
| `*italic*` / `_italic_` | Italic |
| `` `code` `` | Inline code (mono + gray bg) |
| `[label](https://…)` | Hyperlink |
| `- item` / `* item` | Bullet list |
| `1. item` | Numbered list |
| `> quote` | Blockquote (indented, gray) |
| ` ``` … ``` ` | Code block (mono + gray bg) |
| `---` | Horizontal rule |
| `\| a \| b \|` pipe table | Styled table (row 1 = header) |
| `![alt](url)` | Inline image + optional caption |

### Tables (markdown)

```markdown
| Name | Role | Status |
| --- | --- | --- |
| Ana | PM | Active |
| Bruno | Eng | OOO |
```

Separator row (`| --- |`) is ignored. All rows padded to same column count.

### Images (markdown)

```markdown
![Architecture diagram](https://example.com/diagram.png)
```

- URL must be **publicly fetchable** (or use `appendImage` with `driveFileId`).
- Optional width in explicit action: see below.

---

## Tables (`appendTable`)

When data is already structured (from Sheets, API, etc.):

```json
{
  "action": "appendTable",
  "rows": [
    ["Service", "Owner", "SLO"],
    ["checkout", "payments", "99.95%"],
    ["search", "discovery", "99.9%"]
  ],
  "headerRow": true
}
```

First row is bold + light gray background when `headerRow` is true (default).

---

## Images (`appendImage`)

### Public URL

```json
{
  "action": "appendImage",
  "url": "https://example.com/logo.png",
  "alt": "Company logo",
  "maxWidth": 480
}
```

### Google Drive file (same account)

```json
{
  "action": "appendImage",
  "driveFileId": "1abc…xyz",
  "alt": "Screenshot from Drive",
  "width": 600
}
```

| Field | Purpose |
|-------|---------|
| `url` / `imageUrl` | HTTPS image (png, jpg, gif, webp) |
| `driveFileId` / `driveUrl` | File the deployer can read |
| `width` / `height` | Fixed size (points) |
| `maxWidth` | Scale down keeping aspect ratio |
| `alt` | Caption below image (italic gray) |

**Limits:** Apps Script fetches via `UrlFetchApp` — auth-walled URLs fail. For private images, upload to Drive and pass `driveFileId`.

### Local file → Drive → Doc (v2.5+)

Use the **`google-drive-upload-for-docs`** skill or CLI:

```bash
python3 .../sheets_agent.py upload \
  --file "/path/to/image.png" \
  --document-url "https://docs.google.com/document/d/.../edit" \
  --append \
  --share-domain quintoandar.com.br
```

Or action `uploadAndAppendImage` with `base64`, `fileName`, `mimeType`, `shareDomain`, `alt`, `maxWidth`.

---

## Read native comments (`readDocComments`)

Reads **Google Docs comment threads** (other people's comments + replies) via Drive API.

```json
{
  "action": "readDocComments",
  "includeResolved": true,
  "includeReplies": true
}
```

| Field | Default | Purpose |
|-------|---------|---------|
| `includeResolved` | `true` | Include resolved threads |
| `includeReplies` | `true` | Fetch reply messages per thread |
| `pageSize` | `100` | Comments per API page |
| `maxPages` | `20` | Pagination cap |

Response includes per comment: `content`, `author`, `quotedText` (highlighted passage), `resolved`, `replies[]`.

Requires deploy **v2.2+** with Drive Advanced Service enabled. After upgrade run `authorize --auto` once.

---

## Reply to native comments (`replyDocComment`)

Posts a **reply in the Google Docs comment thread** (native sidebar comment, not inline body text).

```json
{
  "action": "replyDocComment",
  "commentId": "AAAB_FARCwE",
  "text": "Updated — Referências is now References.",
  "resolve": false
}
```

| Field | Required | Purpose |
|-------|----------|---------|
| `commentId` | yes | Thread id from `readDocComments` |
| `text` / `content` | yes | Reply message (signature appended automatically) |
| `host` | yes* | `cursor` or `claude` — *CLI auto-injects; agent MUST set explicitly when not using CLI |
| `resolve` | no | Mark thread resolved after reply (`true` / `false`) |

Every reply is suffixed with:

```
> replied from cursor
```

(or `claude`). Apps Script rejects `replyDocComment` without `host`.

Mark resolved without replying:

```json
{ "action": "resolveDocComment", "commentId": "AAAB_FARCwE", "resolved": true }
```

Requires deploy **v2.3+** and Drive API on the script GCP project (same as `readDocComments`).

**Resolve caveat:** `resolveDocComment` / `"resolve": true` call the Drive API, but Google Docs anchor comments may stay `open` in the UI. Always reply **Fixed** first; if resolve does not stick, tell the user to mark resolved manually in Docs.

---

## Read / structure

```json
{ "action": "readDoc", "includeParagraphs": true }
```

```json
{ "action": "listDoc" }
```

---

## Low-level write (avoid when markdown works)

```json
{ "action": "appendDoc", "text": "Plain paragraph." }
```

```json
{ "action": "appendDoc", "text": "Section title", "heading": "H1" }
```

```json
{ "action": "replaceDoc", "find": "old phrase", "replace": "new phrase" }
```

```json
{ "action": "styleDoc", "startIndex": 1, "endIndex": 10, "style": { "bold": true } }
```

---

## Batch example (markdown + table)

```json
{
  "action": "batch",
  "ops": [
    {
      "action": "appendMarkdown",
      "markdown": "# Sprint Review\n\n## Done\n\n- Feature A shipped\n- Bug fixes"
    },
    {
      "action": "appendTable",
      "rows": [["Ticket", "Points"], ["PRD-101", "3"], ["PRD-102", "5"]]
    }
  ]
}
```

---

## Agent workflow

1. Draft content in **markdown** in your reasoning.
2. Call `appendMarkdown` (or batch) — one payload, styled output.
3. For tabular exports from Sheets → build `rows` array → `appendTable`.
4. For screenshots → user shares Drive link or public URL → `appendImage`.
5. Verify with `readDoc`.

---

## Google Docs tabs (v2.6+)

Requires Docs API advanced service on the Apps Script project.

| action | fields |
|--------|--------|
| `listDocTabs` | — |
| `createDocTab` | `name` |
| `renameDocTab` | `tabId`, `name` |

Target a tab when writing:

```json
{
  "action": "appendMarkdown",
  "tabId": "t.ubacmwaw2cpc",
  "markdown": "# Section\n\nBody..."
}
```

---

## Local image upload (`upload` CLI)

Upload a local file to My Drive, share with domain, optionally append to a Doc:

```bash
python3 .../sheets_agent.py upload \
  --file /path/to/image.png \
  --document-url "https://docs.google.com/document/d/.../edit" \
  --append \
  --share-domain quintoandar.com.br
```

Uses Apps Script actions `uploadDriveFile` / `uploadAndAppendImage` (v2.5+).

---

## Canvas → PNG → Doc (decoupled)

Export is **agnostic** — see [canvas-export-reference.md](../canvas-export-reference.md).

```bash
# 1) manifest JSON → PNG (no Google auth)
python3 .../sheets_agent.py canvas-export --manifest report.canvas.json --json

# 2) PNG → Drive + Doc (separate step)
python3 .../sheets_agent.py upload --file report.png --document-url "..." --append
```

Pair `.canvas.tsx` (IDE preview) with `.canvas.json` (export source).

---

## Onboarding (Docs)

1. User pastes **link do Google Doc**
2. Agent: `status --document-url` → if not registered, wizard
3. Shared deploy or doc-bound script + `browser-auth`
4. Test: `appendMarkdown` with a short `# Hello`

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Unknown doc action | Redeploy v2.1.0 (Code.gs + Docs.gs + MarkdownDoc.gs) |
| DocumentApp permission | `authorize --auto` |
| Image fetch failed | Use public URL or `driveFileId`; redeploy v2.1+ and run `authorize --auto` (needs `external_request` scope) |
| Table columns misaligned | Pad empty cells; check pipe syntax |
| Markdown shows raw `**` | Redeploy MarkdownDoc.gs; use `appendMarkdown` not `appendDoc` |
