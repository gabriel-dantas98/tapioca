# Evals — Google Sheets Agent skill

Two layers: **agent behavior** (transcript grading) and **CLI integration** (live spreadsheet).

## 1. Agent behavior evals

### Cases

Defined in [evals.json](evals.json). Six prompts covering wizard discipline, ask-before-delete, redeploy register, read-before-write, batch column width, and no-GCP default.

### Run workflow

1. Create workspace (sibling of skill dir):

```bash
WS=~/.cursor/skills/google-sheets-apps-script-workspace/iteration-1
mkdir -p "$WS"
```

2. For each eval in `evals.json`, run the **same prompt** twice in Cursor:
   - **with_skill** — attach `@google-sheets-apps-script` (or skill path)
   - **without_skill** — same prompt, skill disabled

3. Save the assistant output (messages + tool calls) as markdown:

```
$WS/wizard-first-step/with_skill/outputs/transcript.md
$WS/wizard-first-step/without_skill/outputs/transcript.md
... repeat for each eval_name ...
```

4. Grade:

```bash
python3 ~/.cursor/skills/google-sheets-apps-script/evals/grade_runs.py "$WS"
```

Output: `evals/latest-results/benchmark.json` + `$WS/benchmark.json`

**Goal:** `with_skill` pass rate >> `without_skill` (delta in `run_summary`).

### Test the grader locally

```bash
mkdir -p /tmp/gs-eval-test/wizard-first-step/with_skill/outputs
cat > /tmp/gs-eval-test/wizard-first-step/with_skill/outputs/transcript.md <<'EOF'
Para começar, cola a **URL da planilha** (link completo do Google Sheets).
Vou rodar o setup por você — browser mode, sem GCP.
EOF
python3 evals/grade_runs.py /tmp/gs-eval-test
```

## 2. CLI integration evals

Requires browser-auth + registered spreadsheet.

```bash
export GOOGLE_SHEETS_EVAL_SPREADSHEET_URL="https://docs.google.com/spreadsheets/d/.../edit"
python3 ~/.cursor/skills/google-sheets-apps-script/evals/run_integration.py
```

Optional tab-action cases (`createSheet`, update/read on `_EvalScratch`) need Code.gs **1.2.0+** deployed. They are skipped unless strict:

```bash
export GOOGLE_SHEETS_EVAL_STRICT=1
python3 evals/run_integration.py
```

Output: `evals/latest-results/integration.json`

## 3. Run all

```bash
bash evals/run_all.sh
```

Integration runs only when `GOOGLE_SHEETS_EVAL_SPREADSHEET_URL` is set.

## Adding evals

1. Add entry to `evals/evals.json` (`id`, `eval_name`, `prompt`, `expectations`)
2. Add grader function + entry in `GRADERS` / `EVAL_IDS` in `grade_runs.py`
3. Re-run workspace iteration and compare benchmark delta
