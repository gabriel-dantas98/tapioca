"""Key poses for the arcade-style combat clips."""

COMBAT = {
    'Guarda': 42,
    'Esquiva': 44,
    'Pulso de energia': 48,
    'Impacto no chão': 50,
}

GUARD = {
    'Head': (6, -3, 5), 'Torso': (-11, 1, -7),
    'UpperArm.L': (-57, -12, -9), 'Forearm.L': (-40, 10, -8), 'Hand.L': (12,0,0),
    'UpperArm.R': (-17, 9, -9), 'Forearm.R': (-18, -8, 7),
    'Thigh.L': (-15, 5, 0), 'Thigh.R': (-10, -4, 0),
    'Shin.L': (29,0,0), 'Shin.R': (25,0,0),
    'Foot.L': (-14,0,0), 'Foot.R': (-14,0,0),
}

def with_guard(**updates):
    return {**GUARD, **{k.replace('_', '.'):v for k,v in updates.items()}}

# Time, bone rotations, and root offset (right, forward, height).
KEYS = {
    'Guarda': [
        (0, {}, (0,0,0)),
        (.19, GUARD, (0,0,0)),
        (.38, with_guard(Torso=(-16,7,9), Head=(3,-7,-7), Forearm_L=(-33,6,-4)), (2,0,0)),
        (.59, with_guard(Torso=(-7,-7,-12), Head=(3,6,7), Forearm_R=(-24,-9,8)), (-2,0,0)),
        (.8, GUARD, (0,0,0)),
        (1, {}, (0,0,0)),
    ],
    'Esquiva': [
        (0, {}, (0,0,0)),
        (.17, GUARD, (0,0,0)),
        (.29, with_guard(Torso=(-20,-18,8), Thigh_L=(-32,12,0), Shin_L=(55,0,0), Foot_L=(-19,0,0)), (-4,0,0)),
        (.42, with_guard(Torso=(-11,27,-13), Head=(4,-12,12), Thigh_L=(-7,28,0), Thigh_R=(-24,-13,0), Shin_R=(36,0,0)), (26,1,4)),
        (.57, with_guard(Torso=(-14,11,-7), Thigh_L=(-31,9,0), Shin_L=(57,0,0), Foot_L=(-21,0,0)), (29,0,0)),
        (.75, with_guard(Torso=(-11,-12,0), Thigh_R=(-22,-12,0), Shin_R=(31,0,0)), (10,0,3)),
        (.9, GUARD, (0,0,0)),
        (1, {}, (0,0,0)),
    ],
    'Pulso de energia': [
        (0, {}, (0,0,0)),
        (.16, GUARD, (0,0,0)),
        (.3, with_guard(Torso=(-9,-4,15), Head=(-3,4,-9), UpperArm_L=(-42,-19,7), Forearm_L=(-69,-13,0)), (-3,0,0)),
        (.44, with_guard(Torso=(-13,-4,-7), UpperArm_L=(-83,-9,-6), Forearm_L=(-18,2,-3), Hand_L=(6,0,0)), (4,-5,0)),
        (.49, with_guard(Torso=(0,-6,8), UpperArm_L=(-69,-17,2), Forearm_L=(-34,0,0), Hand_L=(12,0,0)), (0,3,0)),
        (.64, with_guard(Torso=(-9,-4,-4), UpperArm_L=(-77,-11,-4), Forearm_L=(-22,0,0)), (2,-2,0)),
        (.81, GUARD, (0,0,0)),
        (1, {}, (0,0,0)),
    ],
    'Impacto no chão': [
        (0, {}, (0,0,0)),
        (.21, with_guard(Torso=(-26,0,0), Head=(8,0,0), Thigh_L=(-31,8,0), Thigh_R=(-34,-5,0), Shin_L=(63,0,0), Shin_R=(68,0,0), Foot_L=(-31,0,0), Foot_R=(-34,0,0)), (0,0,0)),
        (.42, with_guard(Torso=(-10,0,-12), Head=(-5,0,6), UpperArm_L=(-79,-45,-10), Forearm_L=(-46,-15,0), UpperArm_R=(-39,23,0), Thigh_L=(-41,10,0), Thigh_R=(-19,-10,0), Shin_L=(59,0,0), Shin_R=(47,0,0)), (0,1,21)),
        (.57, with_guard(Torso=(-45,0,-11), Head=(20,0,3), UpperArm_L=(26,-13,0), Forearm_L=(17,0,0), Hand_L=(22,0,0), UpperArm_R=(17,20,0), Thigh_L=(-41,7,0), Thigh_R=(-25,-12,0), Shin_L=(77,0,0), Shin_R=(51,0,0), Foot_L=(-36,0,0), Foot_R=(-24,0,0)), (0,-6,0)),
        (.72, with_guard(Torso=(-30,0,-6), Head=(17,0,6), UpperArm_L=(10,-9,0), Forearm_L=(8,0,0), Thigh_L=(-29,5,0), Shin_L=(54,0,0)), (0,-4,0)),
        (.88, GUARD, (0,0,0)),
        (1, {}, (0,0,0)),
    ],
}

def combat_pose(clip, time):
    for (start, before, location1), (end, after, location2) in zip(KEYS[clip], KEYS[clip][1:]):
        if time <= end:
            blend = (time-start)/(end-start)
            blend = blend*blend*(3-2*blend)
            def tween(a, b):
                return tuple(x+(y-x)*blend for x,y in zip(a,b))
            angles = {name: tween(before.get(name, (0,0,0)), after.get(name, (0,0,0)))
                      for name in before.keys() | after.keys()}
            return angles, tween(location1, location2)
    return {}, (0,0,0)
