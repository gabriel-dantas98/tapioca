import os
from pathlib import Path
import ctypes as C
import math
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

root=Path(os.environ['PIXEL_ART_OUTPUT'])
work=root/'work'
dist=root/'dist'
with np.load(work/'mesh.npz') as mesh:
    vertices,triangles,colors=(mesh[k] for k in ('vertices','triangles','colors'))
motion=np.load(work/'rig_motion.npz')
skin=motion['skin']
parts=[(vertices[row>0],np.flatnonzero(row),row[row>0,None]) for row in skin]
lib=C.CDLL(str(work/'raster.so'))
lib.raster.argtypes=[C.c_int,C.c_int,C.c_void_p,C.c_void_p,C.c_void_p,C.c_int,C.c_int,*[C.c_float]*4,C.c_void_p]
W,H=180,228
settings={
    'walk': ('Caminhada',62),
    'wave': ('Aceno',13),
    'jump': ('Pulo',34),
    'orbit': ('Órbita',0),
    'guard': ('Guarda',25),
    'dodge': ('Esquiva',24),
    'pulse': ('Pulso de energia',37),
    'slam': ('Impacto no chão',32),
}
def render(key,t,matrices):
    moved=np.zeros_like(vertices)
    for transform,(positions,ids,weights) in zip(matrices,parts):
        moved[ids]+=(positions @ transform[:3,:3].T + transform[:3,3])*weights
    angle=263+((360*t) if key=='orbit' else (-settings[key][1]*math.sin(math.pi*t)**2))
    data=np.zeros((H,W,4),dtype=np.uint8)
    lib.raster(len(moved),len(triangles),moved.ctypes.data,triangles.ctypes.data,colors.ctypes.data,W,H,math.radians(angle),math.radians(10),1.33,0,data.ctypes.data)
    frame=Image.fromarray(data)
    ink=Image.new('RGBA',(W,H),(14,17,25))
    ink.putalpha(frame.getchannel('A').filter(ImageFilter.MaxFilter(3)))
    ink.alpha_composite(frame)
    assert ink.getbbox() is not None
    return ink

combat = ('guard','dodge','pulse','slam')

def render_all():
    for key,(clip,_) in settings.items():
        poses=motion[clip]
        atlas=Image.new('RGBA',(W*8,H*math.ceil(len(poses)/8)))
        for i,matrices in enumerate(poses):
            frame=render(key,i/len(poses),matrices)
            left,top,right,bottom=frame.getbbox()
            assert left>0 and top>0 and right<W and bottom<H,(key,i,frame.getbbox())
            atlas.paste(frame,(i%8*W,i//8*H))
            if key=='orbit' and i==0:
                frame.save(dist/'bumblebee.png',optimize=True)
        atlas.save(dist/('pose-'+key+'.webp'),lossless=True,method=4)
        print(key, len(poses),flush=True)

def sample():
    board=Image.new('RGB',(W*6,H*len(combat)),(39,46,56))
    draw=ImageDraw.Draw(board)
    for j,key in enumerate(combat):
        poses=motion[settings[key][0]]
        for k,t in enumerate([.14,.29,.42,.49,.57,.72]):
            i=int(t*len(poses))
            im=render(key,i/len(poses),poses[i])
            x,y=k*W,j*H
            board.paste(im,(x,y),im)
            draw.text((x+6,y+6),f'{key} {t}',fill='white')
    board.save(work/'combat-preview.png')

render_all() if '--all' in sys.argv else sample()
