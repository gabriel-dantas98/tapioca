import os
from pathlib import Path
import bpy

root=Path(os.environ['PIXEL_ART_OUTPUT'])
work=root/'work'
bpy.ops.wm.open_mainfile(filepath=str(work/'bumblebee-rig.blend'))
rig=bpy.data.objects['Bumblebee | rig']
body=bpy.data.objects['Bumblebee | original mesh']
scene=bpy.context.scene
scene.frame_set(1)
rig.show_in_front=False
bpy.context.view_layer.objects.active=body
modifier=body.modifiers.new('Web mesh reduction','DECIMATE')
modifier.ratio=.18
modifier.use_collapse_triangulate=True
bpy.ops.object.modifier_move_up(modifier=modifier.name)
bpy.ops.object.modifier_apply(modifier=modifier.name)
print(f'Optimized surface: {len(body.data.polygons)} faces',flush=True)
for action in bpy.data.actions:
    action.use_fake_user=True
body.name='Bumblebee | painted armor'
body.select_set(False)
rig.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(work/'bumblebee-editavel.blend'),compress=True)
unit=bpy.data.objects.new('Bumblebee | meters',None)
scene.collection.objects.link(unit)
unit.scale=(.001,.001,.001)
unit.location.z=.05
rig.parent=unit
bpy.ops.export_scene.gltf(
    filepath=str(work/'bumblebee-animado.glb'),export_format='GLB',
    export_animation_mode='ACTIONS',export_animations=True,export_frame_range=False,
    export_force_sampling=True,export_optimize_animation_size=True,
)
