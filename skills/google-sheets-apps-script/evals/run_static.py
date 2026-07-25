#!/usr/bin/env python3
"""Static checks for google-sheets-apps-script (no live Google session)."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
CLI = SKILL_DIR / "scripts" / "sheets_agent.py"
DEPLOY = SKILL_DIR / "scripts" / "apps_script_deploy.py"
MANIFEST = SKILL_DIR / "templates" / "appsscript.json"
CODE_GS = SKILL_DIR / "templates" / "Code.gs"
DOCS_GS = SKILL_DIR / "templates" / "Docs.gs"
MARKDOWN_GS = SKILL_DIR / "templates" / "MarkdownDoc.gs"
SLIDES_GS = SKILL_DIR / "templates" / "Slides.gs"
OUT = Path(__file__).resolve().parent / "latest-results" / "static.json"

REQUIRED_FUNCTIONS = (
    "function runApi",
    "function doGet",
    "function doPost",
    "function respond_",
    "function listSheets_",
    "function createSheet_",
    "function authorizeWorkspace",
)

SLIDES_FUNCTIONS = (
    "function runSlidesApi_",
    "function slideIndex_",
    "function listSlides_",
    "function createSlide_",
    "function insertShape_",
    "function styleText_",
    "function copySlide_",
)
DOCS_FUNCTIONS = (
    "function readDoc_",
    "function appendDoc_",
    "function replaceDoc_",
    "case 'appendMarkdown'",
)

MARKDOWN_FUNCTIONS = (
    "function appendMarkdown_",
    "function appendTable_",
    "function appendImage_",
    "function renderMarkdownIntoBody_",
)


def check_code_gs() -> list[dict]:
    text = CODE_GS.read_text()
    results = []
    for fn in REQUIRED_FUNCTIONS:
        results.append({"check": f"Code.gs has {fn}", "passed": fn in text})
    results.append({"check": "Code.gs version 3.0.0", "passed": "3.0.0" in text})
    results.append(
        {
            "check": "authorizeWorkspace trashes Docs through DriveApp",
            "passed": "document.setTrashed" not in text
            and "DriveApp.getFileById(document.getId()).setTrashed(true)" in text,
        }
    )
    docs = DOCS_GS.read_text()
    for fn in DOCS_FUNCTIONS:
        results.append({"check": f"Docs.gs has {fn}", "passed": fn in docs})
    markdown = MARKDOWN_GS.read_text()
    for fn in MARKDOWN_FUNCTIONS:
        results.append({"check": f"MarkdownDoc.gs has {fn}", "passed": fn in markdown})
    slides = SLIDES_GS.read_text()
    for fn in SLIDES_FUNCTIONS:
        results.append({"check": f"Slides.gs has {fn}", "passed": fn in slides})
    deploy = DEPLOY.read_text()
    results.append({"check": "Apps Script deploy includes Slides.gs", "passed": '"Slides"' in deploy})
    manifest = json.loads(MANIFEST.read_text())
    results.append(
        {
            "check": "Apps Script manifest grants Slides scope",
            "passed": "https://www.googleapis.com/auth/presentations" in manifest.get("oauthScopes", []),
        }
    )
    return results


def check_cli_help() -> dict:
    proc = subprocess.run(["python3", str(CLI), "status"], capture_output=True, text=True)
    try:
        data = json.loads(proc.stdout)
        ok = proc.returncode == 0 and "browser_ready" in data
    except json.JSONDecodeError:
        ok = False
        data = proc.stdout[:200]
    return {"check": "CLI status returns JSON", "passed": ok, "detail": data if not ok else None}


def check_parse() -> dict:
    proc = subprocess.run(
        [
            "python3",
            str(CLI),
            "parse",
            "--spreadsheet",
            "https://docs.google.com/spreadsheets/d/1Lrh69E3Itysm_GtK4B2KhF-0Ok3V5Nd3-EgKrdVy1yc/edit",
        ],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(proc.stdout)
        ok = data.get("spreadsheetId") == "1Lrh69E3Itysm_GtK4B2KhF-0Ok3V5Nd3-EgKrdVy1yc"
    except json.JSONDecodeError:
        ok = False
    return {"check": "CLI parse spreadsheet URL", "passed": ok}


def check_parse_document() -> dict:
    proc = subprocess.run(
        [
            "python3",
            str(CLI),
            "parse",
            "--document",
            "https://docs.google.com/document/d/1T0BfQtTbe54rvVQWgfQIuSbGbJrIc7HZvU4oVk-2O_w/edit",
        ],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(proc.stdout)
        ok = data.get("documentId") == "1T0BfQtTbe54rvVQWgfQIuSbGbJrIc7HZvU4oVk-2O_w"
    except json.JSONDecodeError:
        ok = False
    return {"check": "CLI parse document URL", "passed": ok}


def check_parse_presentation() -> dict:
    proc = subprocess.run(
        [
            "python3",
            str(CLI),
            "parse",
            "--presentation",
            "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit",
        ],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(proc.stdout)
        ok = data.get("presentationId") == "1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890"
    except json.JSONDecodeError:
        ok = False
    return {"check": "CLI parse presentation URL", "passed": ok}


def main() -> None:
    results = check_code_gs() + [
        check_cli_help(),
        check_parse(),
        check_parse_document(),
        check_parse_presentation(),
    ]
    passed = sum(1 for r in results if r["passed"])
    report = {
        "metadata": {"type": "static", "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},
        "summary": {"passed": passed, "total": len(results)},
        "results": results,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["summary"], indent=2))
    print(f"Wrote {OUT}")
    if passed != len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
