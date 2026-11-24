"""Build an editable Blender rig from the painted 3MF surface."""
import os
from pathlib import Path
import math
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(os.environ['PIXEL_ART_OUTPUT'])
WORK = ROOT / 'work'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from combat_poses import COMBAT, combat_pose
mesh = np.load(WORK / 'mesh.npz')
vertices, triangles, colors = (mesh[name] for name in ('vertices', 'triangles', 'colors'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24

mesh_data = bpy.data.meshes.new('Painted 3MF surface')
mesh_data.vertices.add(len(vertices))
mesh_data.vertices.foreach_set('co', vertices.ravel())
mesh_data.loops.add(triangles.size)
mesh_data.loops.foreach_set('vertex_index', triangles.ravel())
mesh_data.polygons.add(len(triangles))
mesh_data.polygons.foreach_set('loop_start', np.arange(0, triangles.size, 3, dtype=np.int32))
mesh_data.polygons.foreach_set('material_index', colors.astype(np.int32))
mesh_data.update(calc_edges=True)
body = bpy.data.objects.new('Bumblebee | original mesh', mesh_data)
scene.collection.objects.link(body)

def srgb_to_linear(v):
    return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4

for name, values in [('Armor', (247,217,89)), ('Mechanics',(35,39,46)), ('Steel',(142,144,137)), ('Badge',(222,67,67))]:
    material = bpy.data.materials.new(name)
    material.diffuse_color = tuple(srgb_to_linear(v / 255) for v in values) + (1,)
    body.data.materials.append(material)

rig_data = bpy.data.armatures.new('Bumblebee skeleton')
rig = bpy.data.objects.new('Bumblebee | rig', rig_data)
scene.collection.objects.link(rig)
rig.show_in_front = True
rig.data.display_type = 'STICK'
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

def bone(name, start, end, parent=None):
    item = rig_data.edit_bones.new(name)
    item.head, item.tail = start, end
    if parent:
        item.parent = rig_data.edit_bones[parent]
    item.use_deform = True

bone('Root', (0,0,-22), (0,0,-13))
bone('Torso', (0,1,-20), (0,0,-4), 'Root')
bone('Head', (0,0,1), (0,0,25), 'Torso')
for side, shoulder, elbow, wrist, hand in [
    ('R', (-17,1,-3),(-24,3,-12),(-24,-7,-10),(-24,-15,-8)),
    ('L', (17,1,-3),(23,1,-15),(24,-4,-23),(25,-8,-28)),
]:
    bone('UpperArm.'+side, shoulder, elbow, 'Torso')
    bone('Forearm.'+side, elbow, wrist, 'UpperArm.'+side)
    bone('Hand.'+side, wrist, hand, 'Forearm.'+side)
for side, s in [('R',-1),('L',1)]:
    hip, knee, ankle, toe = (s*8,1,-23), (s*14,-2,-33), (s*17,1,-44), (s*20,-12,-48)
    bone('Thigh.'+side, hip, knee, 'Root')
    bone('Shin.'+side, knee, ankle, 'Thigh.'+side)
    bone('Foot.'+side, ankle, toe, 'Shin.'+side)

bpy.ops.object.mode_set(mode='OBJECT')
rest_bones = list(rig_data.bones)
names = [b.name for b in rest_bones]

def smooth(a, b, value):
    t = np.clip((value-a)/(b-a), 0, 1)
    return t*t*(3-2*t)

x, y, z = vertices.T
weights = {}

# Separate shoulder armor and the two differently posed arms from the chest.
left_edge = np.interp(z, [-30,-27,-24,-21,-17,-10,-2,3], [19.6,19.6,17.7,16.3,14,13,12,14])
right_edge = np.interp(z, [-18,-15,-11,-7,-2,3], [22,17,14,13,12,14])
arms = {
    'L': smooth(left_edge-1.1, left_edge+1.1, x),
    'R': smooth(right_edge-1.3, right_edge+1.3, -x) * smooth(-19,-15,z),
}
# Below the elbow the hand and thigh are adjacent in projection but
# disconnected on the surface. Use the mesh component at this depth.
arm_boundary = smooth(-16.5,-14.6,z)
palm = np.load(WORK/'palm.npy')
arms['L'] = arms['L']*arm_boundary + palm*(1-arm_boundary)
head = smooth(.0,3.8,z)
for side, arm in arms.items():
    arm = arm*(1-head)
    arms[side] = arm
    if side == 'L':
        fore = 1-smooth(-17,-12,z)
        hand = 1-smooth(-25,-20,z)
    else:
        fore = (1-smooth(-4,1,y)) * (1-smooth(-5,-1,z))
        hand = 1-smooth(-12,-6,y)
    weights['UpperArm.'+side] = arm*(1-fore)
    weights['Forearm.'+side] = arm*fore*(1-hand)
    weights['Hand.'+side] = arm*fore*hand

remaining = np.clip(1-head-arms['L']-arms['R'], 0, 1)
leg_start = -24 + 3*smooth(4,13,abs(x))
leg = (1-smooth(leg_start-3,leg_start+2,z)) * remaining
left_leg = smooth(-2,2,x)
for side, side_mask in [('L',left_leg),('R',1-left_leg)]:
    limb = leg*side_mask
    shin = 1-smooth(-35,-31,z)
    foot = 1-smooth(-46,-41,z)
    weights['Thigh.'+side] = limb*(1-shin)
    weights['Shin.'+side] = limb*shin*(1-foot)
    weights['Foot.'+side] = limb*shin*foot

weights['Head'] = head
weights['Torso'] = (remaining-leg)*smooth(-23,-14,z)
weights['Root'] = remaining-leg-weights['Torso']

skin = np.stack([weights[name] for name in names]).astype(np.float32)
# Quantize the weight table consistently for Blender and the sprite renderer.
quantized = np.rint(skin*64).astype(np.uint8)
weight_sum = quantized.sum(axis=0)
for row, name in enumerate(names):
    group = body.vertex_groups.new(name=name)
    for value in np.unique(quantized[row]):
        if value:
            group.add(np.flatnonzero(quantized[row] == value).tolist(), float(value)/64, 'REPLACE')
skin = quantized.astype(np.float32) / weight_sum
body.parent = rig
modifier = body.modifiers.new('Articulation', 'ARMATURE')
modifier.object = rig

parts = [(np.flatnonzero(row), row[row>0]) for row in skin]
rest_inverse = {b.name:b.matrix_local.inverted() for b in rest_bones}
rest_basis = {b.name:b.matrix_local.to_3x3() for b in rest_bones}
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'
rig.animation_data_create()

def rotations(clip, t):
    if clip in COMBAT:
        return combat_pose(clip,t)
    radians = math.tau*t
    pulse = math.sin(math.pi*t)**2
    result = {}
    elevation = 0
    lean = 0
    if clip == 'Caminhada':
        strength = min(1, t/.14, (1-t)/.14)
        strength = strength*strength*(3-2*strength)
        cycle = math.tau*3*t
        for side, phase in [('L',cycle),('R',cycle+math.pi)]:
            step = math.sin(phase)*strength
            lift = max(0, math.cos(phase))*strength
            result['Thigh.'+side] = (-39*step - 10*lift,0,0)
            result['Shin.'+side] = (39*lift+8*strength,0,0)
            result['Foot.'+side] = (19*step-25*lift,0,0)
            result['UpperArm.'+side] = (28*step,(-6 if side=='L' else 6)*strength,0)
            result['Forearm.'+side] = (-12*strength + 10*step,0,0)
            result['Hand.'+side] = (-7*step,0,0)
        lean = -8*strength
        result['Torso'] = (lean,0,6*math.sin(cycle)*strength)
        result['Head'] = (3*math.cos(cycle*2)*strength,0,-3*math.sin(cycle)*strength)
    elif clip == 'Aceno':
        s = min(1,t/.25,(1-t)/.25)
        s = s*s*(3-2*s)
        wiggle = math.sin(radians*4)*s
        result['UpperArm.L'] = (-24*s,-69*s,-5*s)
        result['Forearm.L'] = (-12*s, -70*s+14*wiggle, 0)
        result['Hand.L'] = (7*s,20*wiggle,0)
        result['Torso'] = (0,3*s,-5*s)
        result['Head'] = (-4*s,-7*s,9*s)
        result['UpperArm.R'] = (0,7*s,5*s)
    elif clip == 'Pulo':
        launch, land = .28,.73
        def bump(start,end):
            u=max(0,min(1,(t-start)/(end-start)))
            return math.sin(math.pi*u)**2
        compress = bump(.03,.29)*.9+bump(.70,.96)
        u = max(0,min(1,(t-launch)/(land-launch)))
        air = math.sin(math.pi*u)
        elevation = 23 * air
        for side, s in [('L',1),('R',-1)]:
            result['Thigh.'+side] = (-29*compress-25*air, 4*s*air,0)
            result['Shin.'+side] = (63*compress+51*air,0,0)
            result['Foot.'+side] = (-31*compress-12*air,0,0)
            result['UpperArm.'+side] = (23*compress-44*air,-26*s*air,0)
            result['Forearm.'+side] = (-12*compress-28*air,0,0)
            result['Hand.'+side] = (12*air,0,0)
        result['Torso'] = (-17*compress-8*air,0,0)
        result['Head'] = (9*compress+10*air,4*air,0)
    elif clip == 'Órbita':
        result['Head'] = (3*pulse*math.cos(radians),3*pulse*math.sin(radians),9*pulse*math.sin(radians))
        result['Torso'] = (2*pulse,0,0)
        result['UpperArm.L'] = (-7*pulse,-5*pulse,0)
        result['UpperArm.R'] = (4*pulse,4*pulse,0)
    return result, (0,0,elevation)

def pose_frame(clip,t):
    values,(dx,dy,elevation) = rotations(clip,t)
    for pb in rig.pose.bones:
        ax,ay,az = map(math.radians,values.get(pb.name,(0,0,0)))
        rot = Matrix.Rotation(az,3,'Z') @ Matrix.Rotation(ay,3,'Y') @ Matrix.Rotation(ax,3,'X')
        rest = rest_basis[pb.name]
        pb.rotation_quaternion = (rest.transposed() @ rot @ rest).to_quaternion()
        pb.location = (0,0,0)
    bpy.context.view_layer.update()

    # Align the lowest boot to the ground, then add intentional jump height.
    transforms = np.asarray([rig.pose.bones[b.name].matrix @ rest_inverse[b.name] for b in rest_bones],dtype=np.float32)
    ground_ids=np.flatnonzero(z < -37)
    posed_z=np.zeros(len(ground_ids),dtype=np.float32)
    for row,tf in enumerate(transforms):
        posed_z += (vertices[ground_ids] @ tf[2,:3] + tf[2,3]) * skin[row,ground_ids]
    height = -50 - float(posed_z.min()) + elevation
    rig.pose.bones['Root'].location = rest_basis['Root'].transposed() @ Vector((dx,dy,height))
    bpy.context.view_layer.update()
    return np.asarray([rig.pose.bones[b.name].matrix @ rest_inverse[b.name] for b in rest_bones],dtype=np.float32)

atlas = {}
actions = {}
clips = {'Caminhada':60, 'Aceno':56, 'Pulo':50, 'Órbita':72, **COMBAT}
for clip, n in clips.items():
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    rig.animation_data.action = action
    frames = []
    for i in range(n+1):
        frame = 1+i*2
        tf = pose_frame(clip,i/n)
        if i < n:
            frames.append(tf)
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)
        rig.pose.bones['Root'].keyframe_insert('location',frame=frame,group='Root')
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation='LINEAR'
    atlas[clip] = np.stack(frames)
    actions[clip] = action
    print(f'{clip}: {n} authored samples',flush=True)

np.savez_compressed(WORK/'rig_motion.npz',skin=skin,names=names,**atlas)

rig.animation_data.action = actions['Caminhada']
scene.frame_start=1
scene.frame_end=121
scene.frame_set(1)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = .001
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space=area.spaces.active
            space.shading.color_type='MATERIAL'
            space.clip_end=1200
            space.region_3d.view_distance=155
            space.region_3d.view_location=(0,0,0)
            space.region_3d.view_rotation=Vector((.25,1,-.11)).to_track_quat('-Z','Y')
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'bumblebee-rig.blend'),compress=True)
