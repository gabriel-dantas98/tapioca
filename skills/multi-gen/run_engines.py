#!/usr/bin/env python3
"""
multi-gen — dispara N motores de IA em paralelo pra gerar uma imagem a partir
de um briefing, coleta as saídas, extrai/valida, e grava status por engine.

Uso:
    python3 run_engines.py --briefing "logo de uma igreja moderna" \
        [--palette "#2E5BFF,#FFFFFF"] [--format svg] \
        [--engines codex,cursor] [--timeout 180] [--out-dir /tmp/multi-gen-xyz]

Saída: cria <out-dir>/<engine>/ com raw.txt, out.<ext>, status.json
e imprime um JSON-resumo na stdout (consumido pelo build_preview.py).

Gotchas embutidos (ver DESIGN.md):
- codex: --skip-git-repo-check + stdin fechado; stdout tem ruído → extrai <svg>.
- cursor-agent: precisa auth (pré-check) + flag -f (trust do diretório).
- macOS não tem `timeout` → timeout portável via subprocess + kill.
"""
import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time

# ---------------------------------------------------------------------------
# Registry de motores. Adicionar motor novo = adicionar uma entrada aqui.
# `cmd(prompt)` retorna a lista de args. `available()` faz pré-check (auth etc.).
# `needs_extract` indica se a stdout vem com ruído e precisa extrair o artefato.
# ---------------------------------------------------------------------------

def _which(binname):
    return shutil.which(binname) is not None


def _codex_available():
    if not _which("codex"):
        return False, "binário `codex` não encontrado no PATH"
    return True, None


def _cursor_available():
    if not _which("cursor-agent"):
        return False, "binário `cursor-agent` não encontrado no PATH"
    if os.environ.get("CURSOR_API_KEY"):
        return True, None
    try:
        r = subprocess.run(
            ["cursor-agent", "status"],
            capture_output=True, text=True, timeout=20,
        )
        out = (r.stdout + r.stderr).lower()
        if "logged in" in out or "✓" in (r.stdout + r.stderr):
            return True, None
        return False, "cursor-agent sem auth — rode `cursor-agent login` ou exporte CURSOR_API_KEY"
    except Exception as e:  # noqa: BLE001
        return False, f"cursor-agent status falhou: {e}"


ENGINES = {
    "codex": {
        "available": _codex_available,
        "cmd": lambda prompt: [
            "codex", "exec", "--skip-git-repo-check", prompt,
        ],
        "stdin_devnull": True,
        "needs_extract": True,   # stdout tem banner + "tokens used"
    },
    "cursor": {
        "available": _cursor_available,
        "cmd": lambda prompt: [
            "cursor-agent", "-p", prompt, "--output-format", "text", "-f",
        ],
        "stdin_devnull": True,
        "needs_extract": True,   # geralmente limpo, mas extrai por segurança
    },
    # Para habilitar mais motores no futuro, adicione aqui. Exemplo:
    # "gemini": {"available": ..., "cmd": lambda p: ["gemini", "-p", p], ...},
}

# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------

def build_prompt(briefing, palette, fmt):
    parts = []
    if fmt == "svg":
        parts.append(
            "Você é um designer. Gere a imagem pedida como SVG válido e bem-formado."
        )
        parts.append(
            "RESPONDA APENAS com o SVG cru, começando em `<svg` e terminando em `</svg>`. "
            "Sem markdown, sem cercas de código, sem explicação, sem texto antes ou depois."
        )
        parts.append("Use viewBox, fundo transparente, e mantenha o markup limpo.")
    else:
        parts.append(f"Gere a imagem pedida no formato {fmt}.")
        parts.append("Responda apenas com o artefato, sem texto extra.")
    parts.append(f"\nBriefing: {briefing}")
    if palette:
        parts.append(f"Paleta (use essas cores): {palette}")
    return "\n".join(parts)

# ---------------------------------------------------------------------------
# Extração / validação
# ---------------------------------------------------------------------------

_SVG_RE = re.compile(r"<svg\b.*?</svg>", re.DOTALL | re.IGNORECASE)


def extract_and_validate(raw, fmt):
    """Retorna (artifact_str, ext, error_or_None)."""
    if fmt == "svg":
        m = _SVG_RE.search(raw)
        if not m:
            return None, "svg", "nenhum bloco <svg>...</svg> encontrado na saída"
        svg = m.group(0).strip()
        # validação leve de boa-formação via ElementTree
        try:
            import xml.etree.ElementTree as ET
            ET.fromstring(svg)
        except Exception as e:  # noqa: BLE001
            return svg, "svg", f"SVG malformado: {e}"
        return svg, "svg", None
    # formato genérico: grava cru, sem validação específica
    ext = fmt or "txt"
    if not raw.strip():
        return None, ext, "saída vazia"
    return raw, ext, None

# ---------------------------------------------------------------------------
# Execução de 1 engine com timeout portável (sem depender de `timeout`)
# ---------------------------------------------------------------------------

def run_engine(name, spec, prompt, out_dir, timeout, fmt, results):
    edir = os.path.join(out_dir, name)
    os.makedirs(edir, exist_ok=True)
    status = {"engine": name, "ok": False, "error": None,
              "artifact": None, "elapsed": None}

    ok, reason = spec["available"]()
    if not ok:
        status["error"] = reason
        _write_status(edir, status)
        results[name] = status
        print(f"[multi-gen] {name}: SKIP — {reason}", file=sys.stderr)
        return

    cmd = spec["cmd"](prompt)
    stdin = subprocess.DEVNULL if spec.get("stdin_devnull") else None
    start = time.time()
    print(f"[multi-gen] {name}: disparando…", file=sys.stderr)

    try:
        proc = subprocess.Popen(
            cmd, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, cwd=edir, start_new_session=True,
        )
    except Exception as e:  # noqa: BLE001
        status["error"] = f"falha ao iniciar: {e}"
        _write_status(edir, status); results[name] = status
        return

    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        # mata o grupo de processo inteiro (modelos agênticos sobem filhos)
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception:  # noqa: BLE001
            proc.kill()
        out, err = proc.communicate()
        status["elapsed"] = round(time.time() - start, 1)
        status["error"] = f"timeout após {timeout}s"
        with open(os.path.join(edir, "raw.txt"), "w") as f:
            f.write(out or "")
        _write_status(edir, status); results[name] = status
        print(f"[multi-gen] {name}: TIMEOUT ({timeout}s)", file=sys.stderr)
        return

    status["elapsed"] = round(time.time() - start, 1)
    with open(os.path.join(edir, "raw.txt"), "w") as f:
        f.write(out or "")
    if err:
        with open(os.path.join(edir, "stderr.txt"), "w") as f:
            f.write(err)

    if proc.returncode != 0:
        tail = (err or "").strip().splitlines()[-3:]
        status["error"] = f"exit {proc.returncode}: {' | '.join(tail)}"
        _write_status(edir, status); results[name] = status
        print(f"[multi-gen] {name}: ERRO exit {proc.returncode}", file=sys.stderr)
        return

    artifact, ext, verr = extract_and_validate(out or "", fmt)
    if artifact is not None:
        apath = os.path.join(edir, f"out.{ext}")
        with open(apath, "w") as f:
            f.write(artifact)
        status["artifact"] = apath
    if verr:
        status["error"] = verr
        # artefato malformado ainda é gravado pra inspeção; ok=False
        _write_status(edir, status); results[name] = status
        print(f"[multi-gen] {name}: validação falhou — {verr}", file=sys.stderr)
        return

    status["ok"] = True
    _write_status(edir, status); results[name] = status
    print(f"[multi-gen] {name}: OK ({status['elapsed']}s)", file=sys.stderr)


def _write_status(edir, status):
    with open(os.path.join(edir, "status.json"), "w") as f:
        json.dump(status, f, indent=2, ensure_ascii=False)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="multi-gen engine runner")
    ap.add_argument("--briefing", required=True)
    ap.add_argument("--palette", default=None)
    ap.add_argument("--format", default="svg", dest="fmt")
    ap.add_argument("--engines", default=None,
                    help="csv de engines; default = todos do registry")
    ap.add_argument("--timeout", type=int, default=180)
    ap.add_argument("--out-dir", default=None)
    args = ap.parse_args()

    out_dir = args.out_dir or tempfile.mkdtemp(prefix="multi-gen-")
    os.makedirs(out_dir, exist_ok=True)

    selected = (
        [e.strip() for e in args.engines.split(",") if e.strip()]
        if args.engines else list(ENGINES.keys())
    )
    unknown = [e for e in selected if e not in ENGINES]
    if unknown:
        print(f"[multi-gen] engines desconhecidos: {unknown}", file=sys.stderr)
        selected = [e for e in selected if e in ENGINES]
    if not selected:
        print("[multi-gen] nenhum engine válido selecionado", file=sys.stderr)
        sys.exit(2)

    prompt = build_prompt(args.briefing, args.palette, args.fmt)

    # grava o briefing no run pra rastreabilidade
    with open(os.path.join(out_dir, "briefing.json"), "w") as f:
        json.dump({"briefing": args.briefing, "palette": args.palette,
                   "format": args.fmt, "engines": selected,
                   "timeout": args.timeout, "prompt": prompt},
                  f, indent=2, ensure_ascii=False)

    results = {}
    threads = []
    for name in selected:
        t = threading.Thread(target=run_engine,
                             args=(name, ENGINES[name], prompt, out_dir,
                                   args.timeout, args.fmt, results))
        t.start()
        threads.append(t)
    for t in threads:
        t.join()

    summary = {"out_dir": out_dir, "format": args.fmt,
               "results": [results[n] for n in selected if n in results]}
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
