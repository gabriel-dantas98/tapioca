from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from canvas_export.manifest import load_manifest
from canvas_export.renderer import export_png


def default_output_path(manifest_path: Path) -> Path:
    stem = manifest_path.name
    for suffix in (".canvas.json", ".manifest.json", ".json"):
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    if stem.endswith(".canvas"):
        stem = stem[: -len(".canvas")]
    return manifest_path.with_name(f"{stem}.png")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export a structured canvas manifest JSON to PNG (agnostic, no Google deps)",
    )
    parser.add_argument("--manifest", required=True, help="Path to manifest JSON (version 1)")
    parser.add_argument(
        "--out",
        help="Output PNG path (default: manifest stem + .png beside manifest file)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print result metadata as JSON instead of only the output path",
    )
    return parser


def run(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    manifest_path = Path(args.manifest).expanduser().resolve()
    if not manifest_path.is_file():
        print(f"Manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    try:
        manifest = load_manifest(manifest_path)
        output_path = Path(args.out).expanduser().resolve() if args.out else default_output_path(manifest_path)
        output_path, width, height = export_png(manifest, output_path)
    except (ValueError, json.JSONDecodeError, OSError) as err:
        print(f"canvas-export failed: {err}", file=sys.stderr)
        return 1

    payload = {
        "manifest": str(manifest_path),
        "output": str(output_path),
        "width": width,
        "height": height,
        "meta": manifest.meta,
    }

    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(output_path)
    return 0


def main() -> None:
    raise SystemExit(run())
