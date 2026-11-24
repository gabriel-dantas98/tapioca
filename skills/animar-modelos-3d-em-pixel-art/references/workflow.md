# Do modelo 3D ao diorama animado

## Resumo do que foi feito

| Etapa | Tecnologia | Resultado |
| --- | --- | --- |
| Geometria e pintura | Python, NumPy e SciPy | Malha extraída do 3MF, cores por face e separação topológica da mão |
| Rig e clipes | Blender 4.3, `bpy` | Esqueleto de 15 ossos, pesos por vértice e oito ações editáveis |
| Arquivo para engine | glTF 2.0 binário (`.glb`) e Godot 4.6 | Modelo com skin e clipes, testado na importação para a engine |
| Pixel art | Rasterizador CPU em C, NumPy e Pillow | 422 poses com contorno e transparência em oito atlas WebP |
| Reprodução | HTML, CSS, JavaScript e Canvas 2D | Seleção manual, pausa, avanço, loop aleatório e opção Só combate |
| Publicação | ChatGPT Sites | Diorama, downloads do modelo e prompt copiável |

Os clipes são Órbita, Caminhada, Aceno, Pulo, Guarda, Esquiva, Pulso de energia e Impacto no chão. A rotação de câmera da Órbita é pré-renderizada nos quadros. O JavaScript desenha os efeitos de energia e impacto durante a reprodução. Os clipes 3D incluem as poses e o movimento do esqueleto.

Referências visuais consultadas. [pixelart-gaussiansplat](https://github.com/cobanov/pixelart-gaussiansplat) · [Ink Studio](https://github.com/siliconjungle/shapeshift-labs-ink-studio)

## Reproduzir o Bumblebee

Use Bash, Python 3.11+, NumPy, SciPy, Pillow, compilador C com suporte a biblioteca compartilhada e Blender 4.3 com NumPy no Python embutido. O exemplo foi preparado para Linux com Blender 4.3.2 e Python 3.13. Use Godot 4.6 na validação opcional.

A partir da raiz da skill, rode:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install numpy==2.3.5 scipy==1.17.0 Pillow==13.0.0
bash examples/bumblebee/reproduce.sh "/caminho/Bumblebee+funko+style.3mf" "./bumblebee-reproduzido"
```

O script confere o SHA-256 do arquivo original, lê a malha e a pintura, calcula a região da mão, monta o rig, renderiza os atlas, exporta os modelos e valida `dist/`. O diretório `work/` guarda os intermediários. Abra `bumblebee-reproduzido/dist/index.html` ou sirva `dist/` por HTTP usando o preview do ambiente. Obtenha o arquivo 3MF da fonte original ou do upload do usuário.

Validação do GLB no Godot, a partir da raiz da skill:

```bash
mkdir -p ./validar-godot
cp examples/bumblebee/godot-check/{project.godot,check.gd} ./validar-godot/
cp ./bumblebee-reproduzido/dist/bumblebee-animado.glb ./validar-godot/
godot --headless --path ./validar-godot --editor --import
godot --headless --path ./validar-godot --script check.gd
```

## Adaptar a outro modelo

1. **Inspecione a montagem.** O script lista os recursos e as instâncias do 3MF. Use esse inventário para localizar a geometria e seguir os itens de `build` até as malhas folha. Aplique as transformações das instâncias e dos componentes na ordem correta, converta a unidade e confira a orientação. Diferencie modificadores de impressão e malhas visíveis. Para pintura proprietária, valide a leitura contra a prévia do slicer ou as imagens de referência. O decodificador do exemplo cobre a pintura daquele arquivo.
2. **Decida o tipo de movimento.** Para órbita, enquadre a peça estática e anime a câmera. Para articulações, posicione os pivôs nas juntas observadas na malha. Use partes rígidas em mecanismos e pesos ajustados manualmente em malhas fundidas. Inspecione frente, trás e perfis. Se mão e coxa estiverem lado a lado na projeção, use conectividade ou seleção manual pra separar os pesos.
3. **Defina os clipes.** Escreva poses neutras, preparação, ação e recuperação. Para loops que se alternam, faça começo e fim retornarem à mesma pose e enquadramento ou aplique uma transição. Se houver contato com o chão, confira a altura dos pés quadro a quadro. Peso suave em juntas e inspeção de poses extremas ajudam a detectar malha esticada.
4. **Mantenha uma lista de clipes.** Registre ID, nome, total de quadros, FPS, dimensões do quadro e colunas do atlas. Ao adaptar o player, atualize a lista em `loop.js`, os botões em `index.html` e os nomes dos atlas em conjunto. O exemplo usa quadros de 180 × 228 px, 8 colunas e 12 fps. Use ampliação com vizinho mais próximo para pixels nítidos. Se reaproveitar o rasterizador, ajuste a tabela de paletas em `scripts/raster.c` e a escala e o enquadramento em `render_rig.py`. Confira a orientação dos triângulos e o recorte dos quadros.
5. **Exporte o modelo.** Guarde o `.blend` editável. Gere GLB com clipes, escala e materiais. Faça efeitos da página no Canvas 2D. Para exportações leves, reduza os polígonos depois de conferir silhueta, materiais e pesos.
6. **Valide e publique.** Verifique clipes e ossos no Godot, compare quadros com o enquadramento e rode os controles no navegador quando houver preview. Em Sites, siga o fluxo de manifesto, empacotamento e publicação. Use `dist/` para o site estático e o ID atribuído ao projeto atual.

## Falhas que apareceram na prática

- Um 3MF ultrapassou o limite de transferência do executor. Confirme o acesso ao arquivo antes de começar. Se precisar de nova exportação, peça pra preservar as transformações, peças e cores.
- Um objeto de impressão pode conter regiões desconectadas. Usar a topologia pra separar a mão do Bumblebee eliminou triângulos esticados em direção à coxa.
- Use a lista de clipes pra manter nomes, movimentos e durações correspondentes entre o Canvas e o GLB.
- Se o preview do Sites falhar, use as verificações de arquivos e de lógica disponíveis e informe qual etapa visual ficou pendente.
