#!/usr/bin/env bash
# Build the original example into a fresh directory; no upload or deploy.
set -euo pipefail
if [[ $# -ne 2 ]]; then
    printf 'Usage: bash %s ORIGINAL_BUMBLEBEE.3mf NEW_OUTPUT_DIR\n' "$0" >&2
    exit 2
fi

example_dir="$(cd "$(dirname "$0")" && pwd)"
model="$1"
if [[ ! -f "$model" ]]; then
    printf '3MF file not found: %s\n' "$model" >&2
    exit 2
fi
if [[ -e "$2" ]]; then
    printf 'Choose a new output directory: %s\n' "$2" >&2
    exit 2
fi
mkdir -p "$2"
PIXEL_ART_OUTPUT="$(cd "$2" && pwd)"
export PIXEL_ART_OUTPUT
export OPENBLAS_NUM_THREADS=1
mkdir "$PIXEL_ART_OUTPUT/work" "$PIXEL_ART_OUTPUT/dist"

python3 "$example_dir/extract.py" "$model"
python3 "$example_dir/separate_palm.py"
cc -O3 -shared -fPIC "$example_dir/../../scripts/raster.c" -lm -o "$PIXEL_ART_OUTPUT/work/raster.so"
blender -b -t 4 --python-exit-code 1 --python "$example_dir/bumblebee_rig.py"
OPENBLAS_NUM_THREADS=1 python3 "$example_dir/render_rig.py" --all
blender -b -t 4 --python-exit-code 1 --python "$example_dir/export_bumblebee.py"
cp "$example_dir/web/"{index.html,style.css,loop.js} "$PIXEL_ART_OUTPUT/dist/"
cp "$PIXEL_ART_OUTPUT/work/"{bumblebee-animado.glb,bumblebee-editavel.blend} "$PIXEL_ART_OUTPUT/dist/"
python3 "$example_dir/verify.py" "$PIXEL_ART_OUTPUT/dist"
printf 'Site ready at %s/dist/index.html\n' "$PIXEL_ART_OUTPUT"
