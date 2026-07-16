#!/usr/bin/env bash
# Push full skill tree to private gist (flat filenames for GitHub gist limits).
set -euo pipefail

GIST_ID="${GIST_ID:-6ad86b6bfab840703ec214f228c3004b}"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI required"
  exit 1
fi

python3 - "$SKILL_DIR" "$GIST_ID" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

skill_dir = Path(sys.argv[1])
gist_id = sys.argv[2]

pairs = [
    ("SKILL.md", skill_dir / "SKILL.md"),
    ("README.md", skill_dir / "README.md"),
    ("reference.md", skill_dir / "reference.md"),
    ("wizard.md", skill_dir / "wizard.md"),
    ("docs-reference.md", skill_dir / "docs-reference.md"),
    ("canvas-export-reference.md", skill_dir / "canvas-export-reference.md"),
    ("install.sh", skill_dir / "install.sh"),
    ("install-claude.sh", skill_dir / "install-claude.sh"),
    ("templates-Code.gs", skill_dir / "templates/Code.gs"),
    ("templates-Docs.gs", skill_dir / "templates/Docs.gs"),
    ("templates-MarkdownDoc.gs", skill_dir / "templates/MarkdownDoc.gs"),
    ("templates-CommentsDoc.gs", skill_dir / "templates/CommentsDoc.gs"),
    ("templates-DriveUpload.gs", skill_dir / "templates/DriveUpload.gs"),
    ("templates-DocTabs.gs", skill_dir / "templates/DocTabs.gs"),
    ("templates-appsscript.json", skill_dir / "templates/appsscript.json"),
    ("examples-canvas-manifest.v1.json", skill_dir / "examples/canvas-manifest.v1.json"),
    ("scripts-sheets_agent.py", skill_dir / "scripts/sheets_agent.py"),
    ("scripts-setup.sh", skill_dir / "scripts/setup.sh"),
    ("scripts-clasp_bootstrap.sh", skill_dir / "scripts/clasp_bootstrap.sh"),
    ("scripts-apps_script_deploy.py", skill_dir / "scripts/apps_script_deploy.py"),
    ("scripts-publish_gist.sh", skill_dir / "scripts/publish_gist.sh"),
    ("scripts-canvas_export.py", skill_dir / "scripts/canvas_export.py"),
    ("scripts-canvas_export-__init__.py", skill_dir / "scripts/canvas_export/__init__.py"),
    ("scripts-canvas_export-cli.py", skill_dir / "scripts/canvas_export/cli.py"),
    ("scripts-canvas_export-manifest.py", skill_dir / "scripts/canvas_export/manifest.py"),
    ("scripts-canvas_export-renderer.py", skill_dir / "scripts/canvas_export/renderer.py"),
    ("scripts-canvas_export-__main__.py", skill_dir / "scripts/canvas_export/__main__.py"),
    ("config-oauth-client.json.example", skill_dir / "config/oauth-client.json.example"),
    ("evals-evals.json", skill_dir / "evals/evals.json"),
    ("evals-grade_runs.py", skill_dir / "evals/grade_runs.py"),
    ("evals-integration_cases.json", skill_dir / "evals/integration_cases.json"),
    ("evals-run_integration.py", skill_dir / "evals/run_integration.py"),
    ("evals-run_static.py", skill_dir / "evals/run_static.py"),
    ("evals-run_all.sh", skill_dir / "evals/run_all.sh"),
    ("evals-README.md", skill_dir / "evals/README.md"),
]

files = {}
for name, path in pairs:
    if not path.is_file():
        print(f"WARN: missing {path}", file=sys.stderr)
        continue
    files[name] = {"content": path.read_text(encoding="utf-8")}

payload = {
    "description": "Cursor + Claude skill: Google Sheets & Docs Agent v2.6 (tabs, upload, canvas-export, comments)",
    "files": files,
}

proc = subprocess.run(
    ["env", "-u", "GITHUB_TOKEN", "gh", "api", "-X", "PATCH", f"gists/{gist_id}", "--input", "-"],
    input=json.dumps(payload),
    text=True,
    capture_output=True,
)
if proc.returncode != 0:
    print(proc.stderr or proc.stdout, file=sys.stderr)
    sys.exit(proc.returncode)

print(f"Updated gist {gist_id} ({len(files)} files)")
print(f"https://gist.github.com/gabriel-dantas98/{gist_id}")
PY
