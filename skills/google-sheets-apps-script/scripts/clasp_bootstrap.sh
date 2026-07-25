#!/usr/bin/env bash
# Push Workspace Apps Script files + deploy web app via clasp (npx).
#
# Spreadsheet:
#   bash scripts/clasp_bootstrap.sh --spreadsheet-url "..." --script-id "..."
# Google Doc:
#   bash scripts/clasp_bootstrap.sh --document-url "..." [--script-id "..."] [--create-project]
# Google Slides:
#   bash scripts/clasp_bootstrap.sh --presentation-url "..." [--script-id "..."] [--create-project]
#
# One-time: npx @google/clasp@2.4.2 login

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$SKILL_DIR/scripts/sheets_agent.py"
CLASP_DIR="${GOOGLE_SHEETS_CLASP_DIR:-$HOME/.config/google-sheets-agent/clasp}"
CLASP_BIN="${CLASP_BIN:-npx --yes @google/clasp@2.4.2}"

SPREADSHEET_URL=""
DOCUMENT_URL=""
PRESENTATION_URL=""
SCRIPT_ID=""
DOMAIN="quintoandar.com.br"
UPDATE_ONLY=false
CREATE_PROJECT=false
DEPLOYMENT_ID=""
DESCRIPTION="workspace-agent deploy"
LABEL="Workspace Agent"

usage() {
  sed -n '2,12p' "$0"
  exit 1
}

clasp_logged_in() {
  local status
  status="$($CLASP_BIN login --status 2>&1 || true)"
  [[ "$status" != *"not logged in"* ]]
}

resolve_latest_deployment_id() {
  python3 - "$SPREADSHEET_URL" "$DOCUMENT_URL" "$PRESENTATION_URL" <<'PY'
import json, re, sys
from pathlib import Path

spreadsheet_url, document_url, presentation_url = sys.argv[1], sys.argv[2], sys.argv[3]
registry = json.loads(Path.home().joinpath(".config/google-sheets-agent/registry.json").read_text())
if presentation_url:
    m = re.search(r"/presentation/d/([a-zA-Z0-9-_]+)", presentation_url)
    if m:
        dep = registry.get("presentations", {}).get(m.group(1), {}).get("latestDeploymentId", "")
        if dep:
            print(dep)
            sys.exit(0)
if document_url:
    m = re.search(r"/document/d/([a-zA-Z0-9-_]+)", document_url)
    if m:
        dep = registry.get("documents", {}).get(m.group(1), {}).get("latestDeploymentId", "")
        if dep:
            print(dep)
            sys.exit(0)
if spreadsheet_url:
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", spreadsheet_url)
    if m:
        dep = registry.get("spreadsheets", {}).get(m.group(1), {}).get("latestDeploymentId", "")
        if dep:
            print(dep)
sys.exit(1)
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --spreadsheet-url) SPREADSHEET_URL="$2"; shift 2 ;;
    --document-url) DOCUMENT_URL="$2"; shift 2 ;;
    --presentation-url) PRESENTATION_URL="$2"; shift 2 ;;
    --script-id) SCRIPT_ID="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --update-only) UPDATE_ONLY=true; shift ;;
    --create-project) CREATE_PROJECT=true; shift ;;
    --deployment-id) DEPLOYMENT_ID="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1"; usage ;;
  esac
done

[[ -n "$SPREADSHEET_URL" || -n "$DOCUMENT_URL" || -n "$PRESENTATION_URL" ]] || usage

if ! clasp_logged_in; then
  echo "clasp not logged in. Run: npx @google/clasp@2.4.2 login"
  exit 1
fi

mkdir -p "$CLASP_DIR"
cp "$SKILL_DIR/templates/Code.gs" "$SKILL_DIR/templates/Docs.gs" "$SKILL_DIR/templates/MarkdownDoc.gs" "$SKILL_DIR/templates/CommentsDoc.gs" "$SKILL_DIR/templates/DriveUpload.gs" "$SKILL_DIR/templates/DocTabs.gs" "$SKILL_DIR/templates/Slides.gs" "$SKILL_DIR/templates/appsscript.json" "$CLASP_DIR/"

if [[ -z "$SCRIPT_ID" && "$CREATE_PROJECT" == true ]]; then
  echo "== clasp create =="
  if [[ -n "$PRESENTATION_URL" ]]; then
    PRESENTATION_ID="$(python3 "$CLI" parse --presentation "$PRESENTATION_URL" | python3 -c 'import json,sys; print(json.load(sys.stdin)["presentationId"])')"
    CREATE_OUT="$(cd "$CLASP_DIR" && $CLASP_BIN create --type slides --title "$LABEL" --parentId "$PRESENTATION_ID" --rootDir .)"
  elif [[ -n "$DOCUMENT_URL" ]]; then
    DOC_ID="$(python3 "$CLI" parse --document "$DOCUMENT_URL" | python3 -c 'import json,sys; print(json.load(sys.stdin)["documentId"])')"
    CREATE_OUT="$(cd "$CLASP_DIR" && $CLASP_BIN create --type docs --title "$LABEL" --parentId "$DOC_ID" --rootDir .)"
  else
    SHEET_ID="$(python3 "$CLI" parse --spreadsheet "$SPREADSHEET_URL" | python3 -c 'import json,sys; print(json.load(sys.stdin)["spreadsheetId"])')"
    CREATE_OUT="$(cd "$CLASP_DIR" && $CLASP_BIN create --type sheets --title "$LABEL" --parentId "$SHEET_ID" --rootDir .)"
  fi
  echo "$CREATE_OUT"
  SCRIPT_ID="$(echo "$CREATE_OUT" | grep -Eo 'script\.google\.com/d/[a-zA-Z0-9_-]+' | head -1 | sed 's|.*/||')"
  if [[ -z "$SCRIPT_ID" ]]; then
    SCRIPT_ID="$(echo "$CREATE_OUT" | grep -Eo 'projects/[a-zA-Z0-9_-]+' | head -1 | sed 's|projects/||')"
  fi
fi

[[ -n "$SCRIPT_ID" ]] || { echo "Need --script-id or --create-project"; exit 1; }

cat > "$CLASP_DIR/.clasp.json" <<EOF
{
  "scriptId": "$SCRIPT_ID",
  "rootDir": "."
}
EOF

echo "== clasp push =="
( cd "$CLASP_DIR" && $CLASP_BIN push --force )

echo "== clasp deploy =="
DEPLOY_ARGS=(--description "$DESCRIPTION")
if $UPDATE_ONLY; then
  if [[ -z "$DEPLOYMENT_ID" ]]; then
    DEPLOYMENT_ID="$(resolve_latest_deployment_id || true)"
  fi
  [[ -n "$DEPLOYMENT_ID" ]] || { echo "Need --deployment-id or registered resource for --update-only"; exit 1; }
  DEPLOY_ARGS+=(--deploymentId "$DEPLOYMENT_ID")
fi

DEPLOY_OUT="$(cd "$CLASP_DIR" && $CLASP_BIN deploy "${DEPLOY_ARGS[@]}")"
echo "$DEPLOY_OUT"

NEW_DEPLOYMENT_ID="$DEPLOYMENT_ID"
if [[ -z "$NEW_DEPLOYMENT_ID" ]]; then
  NEW_DEPLOYMENT_ID="$(echo "$DEPLOY_OUT" | grep -Eo 'AKfycb[a-zA-Z0-9_-]+' | head -1 || true)"
fi
[[ -n "$NEW_DEPLOYMENT_ID" ]] || { echo "Could not parse deployment id"; exit 1; }

if [[ "$DOMAIN" == "google.com" || -z "$DOMAIN" ]]; then
  WEB_APP_URL="https://script.google.com/macros/s/${NEW_DEPLOYMENT_ID}/exec"
else
  WEB_APP_URL="https://script.google.com/a/macros/${DOMAIN}/s/${NEW_DEPLOYMENT_ID}/exec"
fi

echo "== register =="
REGISTER_ARGS=(--script-id "$SCRIPT_ID" --web-app-url "$WEB_APP_URL" --domain "$DOMAIN" --label "$LABEL")
if [[ -n "$PRESENTATION_URL" ]]; then
  REGISTER_ARGS+=(--presentation-url "$PRESENTATION_URL")
elif [[ -n "$DOCUMENT_URL" ]]; then
  REGISTER_ARGS+=(--document-url "$DOCUMENT_URL")
else
  REGISTER_ARGS+=(--spreadsheet-url "$SPREADSHEET_URL")
fi
python3 "$CLI" register "${REGISTER_ARGS[@]}"

echo ""
echo "Done. web app: $WEB_APP_URL"
