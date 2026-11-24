"""Verify the example's site files, uncut sprites, skeleton and animations."""
from pathlib import Path
import json
import re
import struct
import sys

from PIL import Image


CLIPS = {
    'orbit': ('Órbita', 72),
    'walk': ('Caminhada', 60),
    'wave': ('Aceno', 56),
    'jump': ('Pulo', 50),
    'guard': ('Guarda', 42),
    'dodge': ('Esquiva', 44),
    'pulse': ('Pulso de energia', 48),
    'slam': ('Impacto no chão', 50),
}

dist = Path(sys.argv[1])
html = (dist / 'index.html').read_text(encoding='utf-8')
assert set(re.findall(r'data-move="([^"]+)"', html)) == CLIPS.keys()
for href in re.findall(r'(?:href|src)="([^"]+)"', html):
    if not href.startswith('https://'):
        assert (dist / href).is_file(), href

for key, (_, total) in CLIPS.items():
    with Image.open(dist / f'pose-{key}.webp') as image:
        assert image.size == (1440, 228 * ((total + 7) // 8))
        frames = set()
        for index in range(total):
            x, y = index % 8 * 180, index // 8 * 228
            frame = image.crop((x, y, x + 180, y + 228))
            box = frame.getbbox()
            assert box and 0 < box[0] < box[2] < 180 and 0 < box[1] < box[3] < 228, (key, index, box)
            frames.add(frame.tobytes())
        assert len(frames) > total / 2, key

with (dist / 'bumblebee-animado.glb').open('rb') as glb:
    assert glb.read(4) == b'glTF'
    assert struct.unpack('<II', glb.read(8))[0] == 2
    size, kind = struct.unpack('<II', glb.read(8))
    assert kind == 0x4E4F534A
    model = json.loads(glb.read(size))
assert len(model['skins'][0]['joints']) == 15
assert {clip['name'] for clip in model['animations']} == {name for name, _ in CLIPS.values()}
assert len(model['materials']) == 4
print('Verified: 422 frames, 8 clips, 15 bones, 4 materials and all site files.')
