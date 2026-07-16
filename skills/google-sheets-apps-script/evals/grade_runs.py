#!/usr/bin/env python3
"""Grade google-sheets-apps-script agent eval outputs and emit benchmark.json.

Usage:
  python3 grade_runs.py [workspace/iteration-N]

Workspace layout (one folder per eval, two configs):
  {workspace}/{eval_name}/with_skill/outputs/*.md
  {workspace}/{eval_name}/without_skill/outputs/*.md

Save agent transcripts (assistant messages + tool calls) as markdown under outputs/.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SKILL_NAME = "google-sheets-apps-script"
SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_WS = (SKILL_DIR.parent / "google-sheets-apps-script-workspace" / "iteration-1").resolve()

EVAL_IDS = {
    "wizard-first-step": 1,
    "ask-before-delete-sheet": 2,
    "redeploy-register": 3,
    "read-before-overwrite": 4,
    "batch-column-width": 5,
    "no-gcp-default": 6,
    "unregistered-spreadsheet": 7,
}


def load_run_data(eval_name: str, config: str, ws: Path) -> dict:
    out = ws / eval_name / config / "outputs"
    texts: dict[str, str] = {}
    if out.is_dir():
        for f in sorted(out.rglob("*")):
            if f.is_file() and f.suffix.lower() in {".md", ".txt", ".json", ".log"}:
                texts[str(f.relative_to(out))] = f.read_text(encoding="utf-8", errors="replace")
    all_text = "\n".join(texts.values())
    user_facing = all_text
    if "## user-facing message" in all_text.lower():
        parts = re.split(r"(?i)##\s*user-facing message", all_text, maxsplit=1)
        if len(parts) > 1:
            tail = parts[1]
            user_facing = re.split(r"(?i)##\s*agent actions", tail, maxsplit=1)[0]
    return {
        "all_text": all_text,
        "user_facing": user_facing,
        "files": texts,
        "lower": all_text.lower(),
        "user_lower": user_facing.lower(),
    }


def _has_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(p in text for p in patterns)


def _asks_one_question(text: str) -> bool:
    """Heuristic: at most one question mark block in user-facing text."""
    questions = text.count("?")
    numbered_steps = len(re.findall(r"(?m)^\s*\d+[\.)]\s", text))
    return questions <= 2 and numbered_steps <= 2


def _user_runs_terminal(text: str) -> bool:
    """True when agent tells the USER to run CLI (bad)."""
    bad = (
        "run this in your terminal",
        "open your terminal",
        "execute in terminal",
        "you should run",
        "run the following command",
        "paste this in terminal",
        "no seu terminal",
        "abra o terminal",
        "execute no terminal",
        "rode no terminal",
        "você deve rodar",
    )
    if not _has_any(text, bad):
        return False
    # Agent saying "I'll run" is fine
    agent_runs = ("i'll run", "i will run", "vou rodar", "vou executar", "agent runs")
    return not _has_any(text, agent_runs)


def grade_wizard_first_step(d: dict) -> list[tuple[str, bool, str]]:
    t = d["user_lower"]
    full = d["lower"]
    return [
        (
            "Asks for spreadsheet URL (or link da planilha) as the first onboarding step",
            _has_any(t, ("spreadsheet url", "url da planilha", "link da planilha", "docs.google.com/spreadsheets")),
            "spreadsheet ask",
        ),
        (
            "Asks only one question in this turn — not multiple wizard steps at once",
            _asks_one_question(d["user_facing"]),
            "one question",
        ),
        (
            "Does not instruct the user to run python, terminal, or sheets_agent.py",
            not _user_runs_terminal(t),
            "no user terminal",
        ),
        (
            "Does not send the user to GCP Console or OAuth client setup as default path",
            not _has_any(t, ("console.cloud.google.com", "create oauth", "crie um projeto gcp", "api token")),
            "no gcp default",
        ),
        (
            "Mentions browser mode or that the agent runs CLI on the user's behalf",
            _has_any(full, ("browser", "playwright", "vou rodar", "agent runs", "eu rodo", "por você", "para você", "bastidores", "cuido de tudo")),
            "browser/agent runs",
        ),
    ]


def grade_ask_before_delete(d: dict) -> list[tuple[str, bool, str]]:
    t = d["lower"]
    confirms = _has_any(
        t,
        (
            "confirma",
            "confirm",
            "posso apagar",
            "can i delete",
            "tem certeza",
            "before deleting",
            "antes de apagar",
            "sem undo",
            "não tem undo",
        ),
    )
    immediate_delete = _has_any(
        t,
        ('"action": "deletesheet"', '"action":"deletesheet"', "deletesheet", "--action delete"),
    ) and not confirms
    return [
        (
            "Asks for confirmation before deleting the tab",
            confirms,
            "confirm ask",
        ),
        (
            "Mentions deleteSheet or that deleting a tab is hard to undo",
            _has_any(t, ("deletesheet", "delete sheet", "apagar a aba", "undo", "sem volta")),
            "delete context",
        ),
        (
            "Does not execute deleteSheet immediately without confirmation",
            not immediate_delete,
            "no immediate delete",
        ),
        (
            "Uses spreadsheet URL or asks which spreadsheet if ambiguous",
            _has_any(t, ("spreadsheet-url", "spreadsheet url", "url da planilha", "qual planilha", "docs.google.com")),
            "spreadsheet target",
        ),
        (
            "Does not tell the user to run terminal commands themselves",
            not _user_runs_terminal(t),
            "no user terminal",
        ),
    ]


def grade_redeploy_register(d: dict) -> list[tuple[str, bool, str]]:
    t = d["lower"]
    has_register = _has_any(t, ("register", "--web-app-url", "web-app-url"))
    manual_registry = _has_any(
        t,
        ("edit registry.json", "abra registry.json", "open registry.json", "edite registry.json"),
    )
    return [
        (
            "Runs or proposes register with --web-app-url (not manual registry edit)",
            has_register and not manual_registry,
            "register",
        ),
        (
            "Uses --spreadsheet-url or asks for spreadsheet URL if missing",
            _has_any(t, ("--spreadsheet-url", "spreadsheet-url", "url da planilha", "spreadsheet url")),
            "spreadsheet-url",
        ),
        (
            "Does not ask user to edit registry.json manually",
            not _has_any(t, ("edit registry.json", "abra registry.json", "open registry.json")),
            "no manual registry",
        ),
        (
            "Confirms latest deployment will be used for future calls",
            _has_any(t, ("latest", "último deploy", "ultimo deploy", "latest deployment", "novo deploy")),
            "latest deploy",
        ),
        (
            "Does not instruct the user to run the register command themselves",
            not _user_runs_terminal(t),
            "no user terminal",
        ),
    ]


def grade_read_before_overwrite(d: dict) -> list[tuple[str, bool, str]]:
    t = d["lower"]
    blind_batch = '"action": "batch"' in t or '"action":"batch"' in t
    reads_first = _has_any(
        t,
        ("listsheets", "list sheets", "read", "ler", "antes de", "before writing", "conferir", "verificar"),
    )
    return [
        (
            "Proposes listSheets or read before writing",
            reads_first,
            "read first",
        ),
        (
            "Asks which tab or clarifies Finance vs other tabs if ambiguous",
            _has_any(t, ("finance", "aba", "tab", "sheet", "qual aba")),
            "tab clarify",
        ),
        (
            "Asks before overwriting existing content or proposes a plan",
            _has_any(t, ("confirma", "confirm", "substituo", "overwrite", "substituir", "plano", "plan")),
            "confirm overwrite",
        ),
        (
            "Uses call with --spreadsheet-url or --payload with read/listSheets",
            _has_any(t, ("--spreadsheet-url", "listsheets", '"action":"read"', '"action": "read"')),
            "cli call",
        ),
        (
            "Does not fire a large batch update without checking existing data",
            not blind_batch or reads_first,
            "no blind batch",
        ),
    ]


def grade_batch_column_width(d: dict) -> list[tuple[str, bool, str]]:
    t = d["lower"]
    bad_range = _has_any(t, ("a1:h1", "a:h", "a1:h"))
    good_range = _has_any(t, ("a1:g1", "a1:g", "a:g"))
    seven_values = bool(re.search(r"jan.*feb.*mar.*apr.*may.*jun", t, re.I | re.S))
    return [
        (
            "Uses range A1:G1 or equivalent 7-column range — not A1:H1",
            good_range and not bad_range,
            "range width",
        ),
        (
            "Payload uses update or batch with exactly 7 values",
            seven_values or _has_any(t, ('"action": "update"', '"action":"update"', '"action": "batch"')),
            "seven values",
        ),
        (
            "Includes sheetName Finance when targeting a named tab",
            _has_any(t, ("finance", "sheetname", "sheet_name")),
            "sheet name",
        ),
        (
            "Does not mismatch column count between range and values",
            not bad_range,
            "no mismatch",
        ),
        (
            "Agent runs CLI — user is not asked to run python",
            not _user_runs_terminal(t),
            "no user terminal",
        ),
    ]


def grade_no_gcp_default(d: dict) -> list[tuple[str, bool, str]]:
    t = d["lower"]
    return [
        (
            "Says end users do not need GCP Console or API tokens",
            _has_any(t, ("não precisa", "nao precisa", "don't need", "do not need", "no gcp", "sem gcp"))
            and not _has_any(t, ("you must create", "você precisa criar", "create a gcp project")),
            "no gcp user",
        ),
        (
            "Browser mode or Playwright session is the default auth path",
            _has_any(t, ("browser", "playwright", "browser-auth", "browser auth")),
            "browser default",
        ),
        (
            "OAuth/GCP is optional maintainer setup — not required for the user",
            _has_any(t, ("optional", "opcional", "maintainer", "admin", "maintenedor")) or "oauth" not in t,
            "oauth optional",
        ),
        (
            "Does not ask user to create OAuth client credentials",
            not _has_any(t, ("create oauth", "crie oauth", "client secret", "client_secret.json")),
            "no oauth ask",
        ),
        (
            "Does not suggest scraping browser cookies or keychain",
            not _has_any(t, ("cookie", "keychain", "browser_cookie")),
            "no cookie scrape",
        ),
    ]


def grade_unregistered_spreadsheet(d: dict) -> list[tuple[str, bool, str]]:
    t = d["lower"]
    pretends_call = any(
        p in t
        for p in (
            '"action": "update"',
            '"action":"update"',
            "atualizei a célula",
            "já atualizei",
            "mrr atualizado",
        )
    ) and "registered" not in t and "conect" not in t
    return [
        (
            "Asks for spreadsheet URL or link da planilha before editing",
            _has_any(t, ("url da planilha", "link da planilha", "docs.google.com", "cola o link")),
            "ask url",
        ),
        (
            "Mentions the sheet is not connected or needs setup if unregistered",
            _has_any(t, ("conectar", "conectada", "configur", "setup", "primeira vez", "not connected")),
            "needs setup",
        ),
        (
            "Does not instruct the user to run terminal commands",
            not _user_runs_terminal(t),
            "no terminal",
        ),
        (
            "Does not call or pretend to call the sheet without registration",
            not pretends_call,
            "no blind call",
        ),
        (
            "Offers to connect the sheet in simple language",
            _has_any(t, ("conectar", "configuro", "vou conectar", "leva uns minutos")),
            "offer connect",
        ),
    ]


GRADERS = {
    "wizard-first-step": grade_wizard_first_step,
    "ask-before-delete-sheet": grade_ask_before_delete,
    "redeploy-register": grade_redeploy_register,
    "read-before-overwrite": grade_read_before_overwrite,
    "batch-column-width": grade_batch_column_width,
    "no-gcp-default": grade_no_gcp_default,
    "unregistered-spreadsheet": grade_unregistered_spreadsheet,
}


def grade_eval(eval_name: str, config: str, ws: Path) -> dict:
    d = load_run_data(eval_name, config, ws)
    grader = GRADERS[eval_name]
    expectations = []
    passed = 0
    for text, ok, _ in grader(d):
        expectations.append(
            {"text": text, "passed": ok, "evidence": f"{eval_name}/{config} — {'PASS' if ok else 'FAIL'}"}
        )
        if ok:
            passed += 1
    total = len(expectations)
    return {
        "eval_id": EVAL_IDS[eval_name],
        "eval_name": eval_name,
        "configuration": config,
        "run_number": 1,
        "result": {
            "pass_rate": passed / total if total else 0.0,
            "passed": passed,
            "failed": total - passed,
            "total": total,
        },
        "expectations": expectations,
        "notes": [] if d["all_text"].strip() else ["No output files found under outputs/"],
    }


def main() -> None:
    ws = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_WS
    if not ws.is_dir():
        sys.exit(f"Workspace not found: {ws}\nCreate it and save agent transcripts under {{eval}}/{{config}}/outputs/")

    runs = []
    for eval_name in EVAL_IDS:
        for config in ("with_skill", "without_skill"):
            runs.append(grade_eval(eval_name, config, ws))

    def agg(config: str) -> float:
        subset = [r for r in runs if r["configuration"] == config]
        return sum(r["result"]["pass_rate"] for r in subset) / len(subset) if subset else 0.0

    with_rate = agg("with_skill")
    without_rate = agg("without_skill")
    benchmark = {
        "metadata": {
            "skill_name": SKILL_NAME,
            "skill_path": str(SKILL_DIR),
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "evals_run": list(EVAL_IDS.values()),
            "runs_per_configuration": 1,
            "iteration": ws.name,
        },
        "runs": runs,
        "run_summary": {
            "with_skill": {"pass_rate": {"mean": with_rate}},
            "without_skill": {"pass_rate": {"mean": without_rate}},
            "delta": {"pass_rate": f"{(with_rate - without_rate) * 100:+.1f}%"},
        },
    }
    out_dir = Path(__file__).resolve().parent / "latest-results"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "benchmark.json"
    out.write_text(json.dumps(benchmark, indent=2) + "\n", encoding="utf-8")
    ws_out = ws / "benchmark.json"
    ws_out.write_text(json.dumps(benchmark, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out}")
    print(json.dumps(benchmark["run_summary"], indent=2))


if __name__ == "__main__":
    main()
