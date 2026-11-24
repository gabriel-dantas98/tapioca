extends SceneTree

func _initialize() -> void:
    call_deferred("verify")

func verify() -> void:
    var scene = load("res://bumblebee-animado.glb")
    if not scene is PackedScene:
        push_error("Animated scene failed to import")
        quit(1)
        return
    var model = scene.instantiate()
    root.add_child(model)
    var player = model.find_child("AnimationPlayer", true, false) as AnimationPlayer
    var skeletons = model.find_children("*", "Skeleton3D", true, false)
    if player == null or skeletons.size() != 1:
        push_error("Missing skeleton or animation player")
        quit(1)
        return
    var skeleton = skeletons[0] as Skeleton3D
    for pair in [["Caminhada","Foot_L"],["Aceno","Hand_L"],["Pulo","Shin_L"],["rbita","Head"],["Guarda","Forearm_L"],["Esquiva","Foot_L"],["Pulso","Hand_L"],["Impacto","Shin_L"]]:
        var clip := ""
        for name in player.get_animation_list():
            if pair[0] in name:
                clip = name
                break
        var bone := -1
        for i in skeleton.get_bone_count():
            if String(skeleton.get_bone_name(i)).replace(".", "_") == pair[1]:
                bone = i
                break
        if clip.is_empty() or bone < 0:
            print(player.get_animation_list())
            for i in skeleton.get_bone_count():
                print(skeleton.get_bone_name(i))
            push_error("Missing animation or bone: " + str(pair))
            quit(1)
            return
        player.play(clip)
        player.advance(0)
        player.seek(0, true)
        skeleton.force_update_all_bone_transforms()
        var start_pose := skeleton.get_bone_global_pose(bone)
        var changed := false
        var duration := player.get_animation(clip).length
        for fraction in [0.22, 0.31, 0.47, 0.63, 0.74]:
            player.seek(duration * fraction, true)
            skeleton.force_update_all_bone_transforms()
            if not start_pose.is_equal_approx(skeleton.get_bone_global_pose(bone)):
                changed = true
                break
        if not changed:
            push_error("No bone motion in " + clip)
            quit(1)
            return
        print(clip + " moves " + str(skeleton.get_bone_name(bone)))
    print("Imported " + str(skeleton.get_bone_count()) + " bones in Godot")
    quit(0)
