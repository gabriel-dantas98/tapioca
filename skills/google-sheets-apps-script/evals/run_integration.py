#!/usr/bin/env python3
"""Run live CLI integration evals for google-sheets-apps-script.

Requires:
  export GOOGLE_SHEETS_EVAL_SPREADSHEET_URL="https://docs.google.com/spreadsheets/d/.../edit"

Optional:
  export GOOGLE_SHEETS_EVAL_STRICT=1   # fail on optional case failures (tab actions)

Usage:
  python3 run_integration.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
CLI = SKILL_DIR / "scripts" / "sheets_agent.py"
CASES_PATH = Path(__file__).resolve().parent / "integration_cases.json"
OUT_DIR = Path(__file__).resolve().parent / "latest-results"


def expand_command(cmd: list[str]) -> list[str]:
    sheet_url = os.environ.get("GOOGLE_SHEETS_EVAL_SPREADSHEET_URL", "")
    doc_url = os.environ.get("GOOGLE_SHEETS_EVAL_DOCUMENT_URL", "")
    presentation_url = os.environ.get("GOOGLE_SHEETS_EVAL_PRESENTATION_URL", "")
    out = []
    for part in cmd:
        part = part.replace("${GOOGLE_SHEETS_EVAL_SPREADSHEET_URL}", sheet_url)
        part = part.replace("${GOOGLE_SHEETS_EVAL_DOCUMENT_URL}", doc_url)
        part = part.replace("${GOOGLE_SHEETS_EVAL_PRESENTATION_URL}", presentation_url)
        out.append(part)
    return out


def normalize_cli_payload(payload: dict) -> dict:
    """Unwrap browser CLI envelope: {deploymentId, result}."""
    inner = payload.get("result")
    if isinstance(inner, dict):
        return {**payload, **inner}
    if isinstance(inner, list):
        payload["result_count"] = len(inner)
    return payload


def json_path(data: dict | list, path: str):
    cur = data
    for key in path.split("."):
        if isinstance(cur, list):
            cur = cur[int(key)]
        else:
            cur = cur[key]
    return cur


def run_case(case: dict) -> dict:
    required_env = case.get("requires_env")
    if required_env and not os.environ.get(required_env, "").strip():
        return {
            "id": case["id"],
            "name": case["name"],
            "passed": True,
            "optional": case.get("optional", False),
            "skipped": f"{required_env} is not set",
        }
    cmd = ["python3", str(CLI), *expand_command(case["command"])]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    result = {
        "id": case["id"],
        "name": case["name"],
        "command": cmd,
        "exit_code": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
        "passed": False,
        "optional": case.get("optional", False),
    }
    if proc.returncode != 0:
        result["error"] = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
        if "browser-auth" in result["error"]:
            result["error"] = "Google login required — run: python3 scripts/sheets_agent.py browser-auth"
        if "respond_ is not defined" in result["error"] or "respond_ is not defined" in proc.stdout:
            result["error"] = "Deployed Code.gs is outdated — paste templates/Code.gs v1.2.0 and redeploy web app"
        accept = case.get("assert", {}).get("accept_error_contains")
        if accept and accept in (proc.stdout + proc.stderr):
            result["passed"] = True
            result["error"] = None
        return result

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raw = proc.stdout.strip()
        if "respond_ is not defined" in raw:
            result["error"] = "Deployed Code.gs is outdated — paste templates/Code.gs v1.2.0 and redeploy web app"
        else:
            result["error"] = f"Invalid JSON stdout: {exc}"
        return result

    assertion = case["assert"]
    payload = normalize_cli_payload(payload)
    key = assertion["json_path"]
    try:
        actual = json_path(payload, key)
    except (KeyError, IndexError, TypeError) as exc:
        result["error"] = f"Missing json_path {key!r}: {exc}"
        return result

    if "equals" in assertion:
        result["passed"] = actual == assertion["equals"]
    elif "matches" in assertion:
        result["passed"] = bool(re.match(assertion["matches"], str(actual)))
    elif "min" in assertion:
        result["passed"] = actual >= assertion["min"]
    else:
        result["error"] = "Unknown assert type"
        return result

    result["actual"] = actual
    result["expected"] = assertion.get("equals", assertion.get("matches"))
    return result


def main() -> None:
    url = os.environ.get("GOOGLE_SHEETS_EVAL_SPREADSHEET_URL", "").strip()
    if not url:
        print("SKIP: set GOOGLE_SHEETS_EVAL_SPREADSHEET_URL to run integration evals")
        sys.exit(0)

    if not CLI.is_file():
        sys.exit(f"CLI not found: {CLI}")

    spec = json.loads(CASES_PATH.read_text())
    strict = os.environ.get("GOOGLE_SHEETS_EVAL_STRICT", "").strip() in {"1", "true", "yes"}
    results = [run_case(case) for case in spec["cases"]]

    required = [r for r in results if not r.get("optional")]
    optional = [r for r in results if r.get("optional")]

    req_pass = sum(1 for r in required if r["passed"])
    opt_pass = sum(1 for r in optional if r["passed"])

    report = {
        "metadata": {
            "type": "integration",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "spreadsheet_url": url,
            "presentation_url": os.environ.get("GOOGLE_SHEETS_EVAL_PRESENTATION_URL", ""),
            "strict": strict,
        },
        "summary": {
            "required_passed": req_pass,
            "required_total": len(required),
            "optional_passed": opt_pass,
            "optional_total": len(optional),
        },
        "results": results,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "integration.json"
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report["summary"], indent=2))
    print(f"Wrote {out_path}")

    failed_required = [r for r in required if not r["passed"]]
    failed_optional = [r for r in optional if not r["passed"]]

    if failed_required:
        for r in failed_required:
            print(f"FAIL [required] {r['name']}: {r.get('error', r.get('actual'))}", file=sys.stderr)
        sys.exit(1)

    if strict and failed_optional:
        for r in failed_optional:
            print(f"FAIL [optional] {r['name']}: {r.get('error', r.get('actual'))}", file=sys.stderr)
        sys.exit(1)

    if failed_optional:
        print("WARN: optional tab-action cases failed — redeploy Code.gs 1.2.0+?")


if __name__ == "__main__":
    main()
