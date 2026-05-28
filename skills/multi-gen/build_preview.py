#!/usr/bin/env python3
"""
multi-gen — monta o preview comparativo a partir de um run-dir do run_engines.py.

Para cada candidato válido renderiza:
  - card em fundo claro + card em fundo escuro
  - (SVG) tira de favicons 16/32/48/180px rasterizados via rsvg-convert/magick

Uso:
    python3 build_preview.py --out-dir /tmp/multi-gen-xyz
Imprime na stdout o caminho do index.html gerado.
"""
import argparse
import base64
import html
import json
import os
import shutil
import subprocess
import sys

FAVICON_SIZES = [16, 32, 48, 180]


def rasterize_svg(svg_path, size, dest):
    """Tenta rsvg-convert; cai pra magick/convert. Retorna True se gerou."""
    if shutil.which("rsvg-convert"):
        r = subprocess.run(
            ["rsvg-convert", "-w", str(size), "-h", str(size),
             svg_path, "-o", dest],
            capture_output=True)
        if r.returncode == 0 and os.path.exists(dest):
            return True
    for tool in ("magick", "convert"):
        if shutil.which(tool):
            r = subprocess.run(
                [tool, "-background", "none", "-resize", f"{size}x{size}",
                 svg_path, dest], capture_output=True)
            if r.returncode == 0 and os.path.exists(dest):
                return True
    return False


def b64_png(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def read_status(edir):
    p = os.path.join(edir, "status.json")
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def build_favicon_strip(svg_path, edir):
    cells = []
    for size in FAVICON_SIZES:
        dest = os.path.join(edir, f"fav{size}.png")
        if rasterize_svg(svg_path, size, dest):
            data = b64_png(dest)
            cells.append(
                f'<figure class="fav"><img src="data:image/png;base64,{data}" '
                f'width="{size}" height="{size}" alt="favicon {size}px">'
                f'<figcaption>{size}px</figcaption></figure>')
        else:
            cells.append(
                f'<figure class="fav fav-fail"><div class="fav-x">×</div>'
                f'<figcaption>{size}px</figcaption></figure>')
    return '<div class="favstrip">' + "".join(cells) + "</div>"


def card_for_engine(status, fmt):
    name = html.escape(status["engine"])
    if not status.get("ok"):
        err = html.escape(status.get("error") or "sem artefato")
        return f"""
        <article class="cand cand-fail">
          <header><h2>{name}</h2><span class="badge badge-fail">falhou</span></header>
          <p class="err">{err}</p>
        </article>"""

    artifact = status["artifact"]
    elapsed = status.get("elapsed")
    edir = os.path.dirname(artifact)

    if fmt == "svg":
        with open(artifact) as f:
            svg = f.read()
        favstrip = build_favicon_strip(artifact, edir)
        body = f"""
          <div class="compare">
            <div class="pane pane-light"><div class="art">{svg}</div><span class="bglabel">claro</span></div>
            <div class="pane pane-dark"><div class="art">{svg}</div><span class="bglabel">escuro</span></div>
          </div>
          <h3 class="favtitle">favicon</h3>
          {favstrip}"""
    else:
        # formato raster/genérico: embute como imagem se for arquivo de imagem
        ext = os.path.splitext(artifact)[1].lstrip(".")
        try:
            data = b64_png(artifact)
            mime = f"image/{ext or 'png'}"
            img = f'<img class="rasterart" src="data:{mime};base64,{data}" alt="{name}">'
        except Exception:  # noqa: BLE001
            img = '<p class="err">não foi possível embutir o artefato</p>'
        body = f"""
          <div class="compare">
            <div class="pane pane-light">{img}<span class="bglabel">claro</span></div>
            <div class="pane pane-dark">{img}<span class="bglabel">escuro</span></div>
          </div>"""

    et = f"{elapsed}s" if elapsed is not None else ""
    return f"""
    <article class="cand">
      <header><h2>{name}</h2><span class="badge badge-ok">ok · {et}</span></header>
      {body}
      <footer><code>{html.escape(artifact)}</code></footer>
    </article>"""


def render_html(out_dir):
    briefing = {}
    bpath = os.path.join(out_dir, "briefing.json")
    if os.path.exists(bpath):
        with open(bpath) as f:
            briefing = json.load(f)
    fmt = briefing.get("format", "svg")

    cards = []
    for name in os.listdir(out_dir):
        edir = os.path.join(out_dir, name)
        if not os.path.isdir(edir):
            continue
        status = read_status(edir)
        if status:
            cards.append((status.get("ok", False), card_for_engine(status, fmt)))
    # ok primeiro
    cards.sort(key=lambda c: not c[0])
    cards_html = "\n".join(c[1] for c in cards) or "<p>Nenhum candidato.</p>"

    brief_txt = html.escape(briefing.get("briefing", ""))
    palette = briefing.get("palette") or ""
    pal_html = ""
    if palette:
        chips = "".join(
            f'<span class="chip" style="background:{html.escape(c.strip())}">'
            f'</span>' for c in str(palette).split(","))
        pal_html = f'<div class="palette">{chips}<span class="palhex">{html.escape(str(palette))}</span></div>'

    return TEMPLATE.format(briefing=brief_txt, palette=pal_html, cards=cards_html)


TEMPLATE = """<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>multi-gen · comparativo</title>
<style>
  :root {{ --bg:#0c0d12; --fg:#e8e9f0; --muted:#8a8d9c; --line:#23252f;
           --ok:#39d98a; --fail:#ff6b6b; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font:15px/1.5 -apple-system,Segoe UI,Inter,sans-serif;
          background:var(--bg); color:var(--fg); padding:32px; }}
  h1 {{ font-size:20px; margin:0 0 4px; letter-spacing:-.01em; }}
  .sub {{ color:var(--muted); margin:0 0 24px; max-width:60ch; }}
  .palette {{ display:flex; align-items:center; gap:8px; margin:0 0 28px; }}
  .chip {{ width:22px; height:22px; border-radius:6px; border:1px solid var(--line); }}
  .palhex {{ color:var(--muted); font-size:12px; font-family:ui-monospace,monospace; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:20px; }}
  .cand {{ border:1px solid var(--line); border-radius:14px; overflow:hidden;
           background:#13141b; }}
  .cand header {{ display:flex; align-items:center; justify-content:space-between;
                  padding:14px 16px; border-bottom:1px solid var(--line); }}
  .cand h2 {{ margin:0; font-size:15px; text-transform:lowercase; }}
  .badge {{ font-size:11px; padding:3px 9px; border-radius:999px; font-weight:600; }}
  .badge-ok {{ background:rgba(57,217,138,.12); color:var(--ok); }}
  .badge-fail {{ background:rgba(255,107,107,.12); color:var(--fail); }}
  .compare {{ display:grid; grid-template-columns:1fr 1fr; }}
  .pane {{ position:relative; aspect-ratio:1/1; display:flex; align-items:center;
           justify-content:center; padding:22px; }}
  .pane-light {{ background:#f4f5f8; }}
  .pane-dark {{ background:#0a0a0f; }}
  .art, .art svg {{ width:100%; height:100%; max-width:160px; max-height:160px; }}
  .rasterart {{ max-width:160px; max-height:160px; object-fit:contain; }}
  .bglabel {{ position:absolute; bottom:6px; right:8px; font-size:10px;
              color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }}
  .favtitle {{ font-size:11px; text-transform:uppercase; letter-spacing:.08em;
               color:var(--muted); margin:14px 16px 0; }}
  .favstrip {{ display:flex; align-items:flex-end; gap:18px; padding:12px 16px 18px;
               background:#f4f5f8; }}
  .fav {{ margin:0; text-align:center; }}
  .fav figcaption {{ font-size:10px; color:#666; margin-top:4px; }}
  .fav-fail .fav-x {{ width:32px; height:32px; display:flex; align-items:center;
                      justify-content:center; color:var(--fail); border:1px dashed var(--fail); }}
  .cand footer {{ padding:10px 16px; border-top:1px solid var(--line); }}
  .cand footer code {{ font-size:11px; color:var(--muted); word-break:break-all; }}
  .err {{ padding:16px; color:var(--fail); font-size:13px; }}
</style></head>
<body>
  <h1>multi-gen · comparativo</h1>
  <p class="sub">{briefing}</p>
  {palette}
  <div class="grid">{cards}</div>
</body></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()
    if not os.path.isdir(args.out_dir):
        print(f"out-dir não existe: {args.out_dir}", file=sys.stderr)
        sys.exit(2)
    html_doc = render_html(args.out_dir)
    index = os.path.join(args.out_dir, "index.html")
    with open(index, "w") as f:
        f.write(html_doc)
    print(index)


if __name__ == "__main__":
    main()
