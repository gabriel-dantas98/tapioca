#!/usr/bin/env python3
"""
Smoke test do multi-gen — não chama os CLIs (lento/flaky). Exercita a lógica
determinística: extração+validação de SVG, prompt building, e o build_preview
sobre um run-dir falso. Roda em <2s.

    python3 .claude/skills/multi-gen/tests/smoke_test.py
"""
import importlib.util
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


run = _load("run_engines", os.path.join(SKILL, "run_engines.py"))
prev = _load("build_preview", os.path.join(SKILL, "build_preview.py"))

failures = []


def check(cond, msg):
    if cond:
        print(f"  ok  {msg}")
    else:
        print(f" FAIL {msg}")
        failures.append(msg)


VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#2E5BFF"/></svg>'
NOISY = f"codex\n{VALID_SVG}\ntokens used\n16979"  # simula stdout do codex
# tem <svg>...</svg> (regex casa) mas XML quebrado (tag não fechada) → ElementTree rejeita
MALFORMED = '<svg viewBox="0 0 10 10"><rect width="5"></svg>'

print("== extração + validação ==")
art, ext, err = run.extract_and_validate(NOISY, "svg")
check(err is None and art == VALID_SVG, "extrai <svg> de stdout com ruído de log")
check(ext == "svg", "ext = svg")

art, ext, err = run.extract_and_validate("nenhum svg aqui", "svg")
check(art is None and err is not None, "saída sem <svg> vira erro")

art, ext, err = run.extract_and_validate(MALFORMED, "svg")
check(err is not None and "malformado" in err, "SVG malformado é detectado")

print("== prompt building ==")
p = run.build_prompt("logo de igreja", "#2E5BFF,#FFF", "svg")
check("logo de igreja" in p and "#2E5BFF" in p and "</svg>" in p,
      "prompt inclui briefing, paleta e instrução de SVG cru")

print("== registry ==")
check("codex" in run.ENGINES and "cursor" in run.ENGINES,
      "registry tem codex e cursor")
check(run.ENGINES["codex"]["stdin_devnull"] is True,
      "codex configurado com stdin /dev/null")
cmd = run.ENGINES["cursor"]["cmd"]("X")
check("-f" in cmd and "--output-format" in cmd,
      "cursor cmd tem -f (trust) e --output-format")
cmd = run.ENGINES["codex"]["cmd"]("X")
check("--skip-git-repo-check" in cmd, "codex cmd tem --skip-git-repo-check")

print("== build_preview sobre run-dir falso ==")
d = tempfile.mkdtemp(prefix="mg-smoke-")
with open(os.path.join(d, "briefing.json"), "w") as f:
    json.dump({"briefing": "teste", "palette": "#2E5BFF,#FFFFFF",
               "format": "svg"}, f)
# engine ok
e1 = os.path.join(d, "codex"); os.makedirs(e1)
with open(os.path.join(e1, "out.svg"), "w") as f:
    f.write(VALID_SVG)
with open(os.path.join(e1, "status.json"), "w") as f:
    json.dump({"engine": "codex", "ok": True, "error": None,
               "artifact": os.path.join(e1, "out.svg"), "elapsed": 12.3}, f)
# engine falho
e2 = os.path.join(d, "cursor"); os.makedirs(e2)
with open(os.path.join(e2, "status.json"), "w") as f:
    json.dump({"engine": "cursor", "ok": False,
               "error": "cursor-agent sem auth", "artifact": None}, f)

html_doc = prev.render_html(d)
check("multi-gen" in html_doc and "codex" in html_doc, "html tem título e codex")
check("cursor-agent sem auth" in html_doc, "html mostra erro do engine falho")
check("pane-light" in html_doc and "pane-dark" in html_doc,
      "html tem painéis claro e escuro")
check("favicon" in html_doc, "html tem seção favicon p/ SVG")

print()
if failures:
    print(f"FALHOU: {len(failures)} checagem(ns)")
    sys.exit(1)
print("PASSOU: todos os checks")
