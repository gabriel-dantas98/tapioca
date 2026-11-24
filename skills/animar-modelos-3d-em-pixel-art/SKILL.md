---
name: animar-modelos-3d-em-pixel-art
description: Use when a user wants to turn a 3MF, STL or GLB into animated pixel art, move a 3D character's limbs, create a loop or diorama in the browser, or reproduce the Bumblebee workflow with Blender, Godot and Sites.
---

# Animar modelos 3D em pixel art

Transforme a geometria fornecida pelo usuário numa animação editável e num diorama web. Consulte [o guia de reprodução](references/workflow.md) para comandos e verificações.

1. **Inspecione a entrada.** Para 3MF, execute `python3 scripts/inspect_3mf.py arquivo.3mf` a partir da pasta da skill. Revise as unidades, recursos, instâncias, transformações e pintura. Inspecione o modelo visualmente. Para STL, defina a unidade e a paleta conforme a peça. Para GLB, confira materiais, esqueleto e clipes existentes antes de decidir se precisa criar um rig.
2. **Adapte o rig à geometria.** Modelo rígido pode usar pivôs em partes separadas. Personagem fundido pede armature, pesos e inspeção das articulações. Preserve as cores úteis do arquivo. Adapte a pose de descanso, os pivôs e os pesos para cada modelo. Use keyframes e teste os extremos e a volta à pose inicial.
3. **Gere as entregas pedidas.** Salve `.blend` para edição, `.glb` com skin e clipes para engine, e atlas WebP em baixa resolução para web. Use Canvas 2D, uma lista de clipes, pausa e seleção. Sincronize efeitos com o tempo do clipe.
4. **Verifique.** Abra os arquivos exportados, confira poses, cores, recorte de sprites e junções dos loops. Para engine, importe o GLB no Godot e verifique que os clipes movem os ossos. Na página, teste seleção manual, embaralhamento, pausa e movimento reduzido.
5. **Publique quando solicitado.** Use a skill do Sites no projeto indicado, ou crie um novo se for o objetivo. Confirme a versão no ar e respeite o público autorizado para cada modelo e download.

## Receita de referência

Execute `bash examples/bumblebee/reproduce.sh ORIGINAL.3mf NOVA_PASTA` para reconstruir o exemplo com o arquivo original. Os pesos, a paleta e os clipes do exemplo são específicos do Bumblebee. Para um modelo diferente, siga o fluxo acima e use os scripts como referência de implementação.
