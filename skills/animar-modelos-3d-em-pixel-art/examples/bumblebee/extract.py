"""Read geometry and filament paint from the original Bumblebee file."""
from pathlib import Path
import hashlib
import os
import re
import sys
from zipfile import ZipFile

import numpy as np


model = Path(sys.argv[1])
known_sha256 = '7846e05319fab74e68a25b720ad973ac4ea990ece278906296dbad1664a158c8'
with model.open('rb') as source:
    if hashlib.file_digest(source, 'sha256').hexdigest() != known_sha256:
        sys.exit('This recipe requires the original Bumblebee 3MF. For other meshes, adapt the rig using references/workflow.md.')

with ZipFile(model) as archive:
    mesh = archive.read('3D/Objects/object_1.model').split(b'</object>', 1)[0]

vertices = np.asarray(
    re.findall(rb'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"', mesh),
    dtype=np.float32,
)
faces = re.findall(
    rb'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?: paint_color="([^"]*)")?',
    mesh,
)
triangles = np.asarray([face[:3] for face in faces], dtype=np.int32)
paint = {b'4': 0, b'8': 1, b'0C': 2, b'1C': 3, b'': 1}
# Original approximation for subdivided transitions in the filament paint.
colors = np.asarray(
    [paint.get(code, 0 if code.count(b'4') >= code.count(b'8') else 1)
     for _, _, _, code in faces],
    dtype=np.uint8,
)
assert vertices.shape == (723713, 3)
assert triangles.shape == (1447470, 3)
assert triangles.max() < len(vertices)
cache = Path(os.environ['PIXEL_ART_OUTPUT']) / 'work' / 'mesh.npz'
np.savez(cache, vertices=vertices, triangles=triangles, colors=colors)
