---
name: usabilidade-br
description: |
  Audita usabilidade de apps web em dois passes: as 10 heurísticas de Jakob Nielsen e um segundo passe com leis de UX (Hick, Fitts, Jakob, Doherty, Miller). O report HTML traz evidência, score em duas camadas sem achado repetido, e um fix prompt por violação com a lei, a heurística de origem e o critério numérico (toque >= 44 px, resposta <= 400 ms, mais de 5 ações iguais viram Mais).
  Gatilhos: auditar usabilidade, rodar Nielsen, leis de UX, Hick, Fitts, Doherty, Miller, Jakob, revisar UX, audit de UI, checar usabilidade, /tapioca:usabilidade-br.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
  - mcp__claude-in-chrome__tabs_context_mcp
  - mcp__claude-in-chrome__tabs_create_mcp
  - mcp__claude-in-chrome__navigate
  - mcp__claude-in-chrome__read_page
  - mcp__claude-in-chrome__get_page_text
  - mcp__claude-in-chrome__read_console_messages
  - mcp__claude-in-chrome__find
  - mcp__claude-in-chrome__javascript_tool
---

# usabilidade-br

Auditor de usabilidade PT-BR. O passe 1 usa as 10 heurísticas de Jakob Nielsen (1994, revisadas 2024 pela NN/g). O passe 2 aplica as leis de `leis.md`, com número de aceite. Os dois passes viram uma lista só. O score tem duas camadas; o geral é a camada Nielsen e não soma a multa de novo na camada leis.

O número sai de `python3 skills/usabilidade-br/score.py --findings <json>`. Não recalcule no olho.

Esta skill **não corrige nada sozinha** — gera o prompt cirúrgico que outro agente (ou o próprio Gabriel) executa. As regras das leis foram escritas aqui, com crédito a Leandro Rezende (Bold School) e a Laws of UX. Não copie o arquivo dele para o report.

## Decisão de modo

1. **Single page, sem código** (`--code` ausente) → os dois passes nesta sessão, nesta ordem: heurísticas, leis, `score.py`.
2. **Múltiplas rotas OU `--code` informado OU usuário pediu "audit sério"** → agent companion `usabilidade-br` (em `agents/`). Ele paraleliza as 10 heurísticas, roda o passe de leis num dispatch só (o catálogo inteiro, para não abrir a mesma ficha em duas leis) e funde com `score.py`.
3. Se ambíguo, pergunta com `AskUserQuestion`. Default: agent companion (qualidade > velocidade).

## Inputs aceitos

```
/tapioca:usabilidade-br <url> [--code <path>] [--rotas <r1,r2,r3>] [--severidade-min <0-4>]
```

- `<url>` — obrigatório. Pode ser `http://localhost:3000`, preview Vercel, prod.
- `--code <path>` — diretório raiz do código (habilita `file:line` nos fix prompts)
- `--rotas <lista>` — vírgula-separado, default `[/]`
- `--severidade-min <0-4>` — escala Nielsen, default `2`
- Sem args → pede URL com `AskUserQuestion`

## Fluxo de execução

### 1. Bootstrap

```bash
# Valida URL acessível
curl -sSf -o /dev/null -w '%{http_code}' <url>  # espera 2xx ou 3xx

# Confirma Chrome MCP disponível
# (se não, instrui o usuário a instalar a extension)
```

Se `--code` passado, indexa árvore com `Glob`:
- `<path>/**/*.{tsx,jsx,vue,svelte,html}` (componentes)
- Mantém em memória mapeamento `path → primeira_classe_ou_função`

### 2. Captura por rota

Pra cada rota:

```text
1. tabs_create_mcp ou reusa tab existente do tabs_context_mcp
2. navigate({ url: <rota> })
3. Aguarda 1500ms (DOMContentLoaded + JS idle aproximado)
4. get_page_text — captura texto da viewport
5. javascript_tool — outerHTML truncado (~50KB) e, para cada
   `a, button, input, select, textarea, [role=button]`:
   `{selector, grupo (pai imediato), width, height, texto}`.
   O retângulo é o de borda (`getBoundingClientRect`), não o font-size.
   No mesmo script, conte ações de comando por pai: quantos botões no
   mesmo patamar, e se já existe um controle "Mais" / "More".
6. read_console_messages — captura erros/warns
7. Screenshot full page via javascript_tool + html2canvas inline
   (alternativa: instrução pro usuário tirar screenshot manual e colar
   o caminho — Chrome MCP não tem screenshot direto)
```

**Importante:** Chrome MCP não expõe screenshot nativo no toolkit base — usar `javascript_tool` pra invocar `html2canvas` injetado, ou aceitar trabalho sem screenshot (degrada UX do report mas não bloqueia).

### 3. Análise em dois passes

Os passes não são duas auditorias. Eles emitem fichas cruas; `score.py` funde e devolve a lista que entra no HTML.

#### Passe 1 — heurísticas

Para cada uma das 10, aplique o catálogo abaixo. Cada ficha crua traz `familia` da tabela fechada. Tela que passa não gera ficha.

#### Passe 2 — leis

Leia `leis.md` inteiro antes de emitir ficha deste passe. Lei `condicional` sem gatilho fica fora de `leis_aplicaveis`. Não reabra H5 nem H9 como lei.

Medição, não chute:

- Toque: falha de Fitts se `width < 44` ou `height < 44` no retângulo de borda. Vão entre adjacentes `< 8` px entra na mesma ficha.
- Resposta: sem cronômetro, `feedback-lento` só sai se o handler não muda o estado do controle. O aceite continua `<= 400 ms`. Não escreva um tempo que você não mediu.
- Ações iguais: botões de comando com o mesmo pai e o mesmo patamar. "Mais" / "More" não entra na conta. Mais de 5 vira `excesso-acoes`.

#### Fusão

```bash
python3 skills/usabilidade-br/score.py --findings /tmp/usabilidade-achados.json
```

Renderize o `achados` da saída, não a lista crua. Heurística, lei, critério e `fix_cabecalho` vêm do script.

`leis_aplicaveis` = leis `sempre` (a tela tem controle) + condicionais com gatilho + qualquer lei de uma ficha emitida. Lei com ficha e fora da lista faz o script sair com erro — inclua a lei, não apague a ficha.

```json
{
  "leis_aplicaveis": ["hick", "fitts", "doherty"],
  "achados": [
    {
      "rota": "/",
      "selector": "#payment-form button[type=submit]",
      "grupo": "#payment-form",
      "familia": "feedback-lento",
      "severidade": 3,
      "titulo": "enviar não muda de estado",
      "descricao": "o handler só dispara alert",
      "evidencia": {
        "selector": "css selector",
        "snippet_html": "trecho HTML relevante",
        "screenshot_crop": null
      },
      "codigo": {
        "file": "src/components/Header.tsx",
        "line": 42,
        "snippet": "trecho do código"
      }
    }
  ]
}
```

`grupo` é o pai imediato. Não use `body`.

O miolo do fix prompt cola depois do `fix_cabecalho`. Não troque o número que o cabeçalho já fixou (44, 400, 5, ou o da família Nielsen).

```text
Contexto: <o que a pessoa está tentando fazer>

Arquivo: <path:line ou "componente não localizado, ajustar manualmente">
Trecho atual:
<código>

Ação sugerida: <mudança cirúrgica>

Critério de aceitação:
- <o mesmo número do fix_cabecalho>
- <outro bullet observável>

Re-auditar com: /tapioca:usabilidade-br <url>
```

Famílias fechadas (o script recusa o resto):

| familia | H | lei |
|---|---|---|
| feedback-lento | 1 | doherty |
| status-invisivel | 1 | nenhuma |
| progresso-fluxo | 1 | gradiente |
| fim-sem-status | 1 | pico-final |
| tarefa-aberta-invisivel | 1 | zeigarnik |
| linguagem-sistema | 2 | nenhuma |
| sem-saida | 3 | nenhuma |
| convencao-quebrada | 4 | jakob |
| visual-mesma-funcao | 4 | similaridade |
| grupo-sem-regiao | 4 | regiao-comum |
| termo-instavel | 4 | nenhuma |
| erro-evitavel | 5 | nenhuma |
| opcao-sem-default | 5 | efeito-default |
| sem-rotulo | 6 | nenhuma |
| sem-bloco | 6 | miller |
| itens-afastados | 6 | proximidade |
| posicao-serial | 6 | posicao-serial |
| alvo-motor | 7 | fitts |
| complexidade-no-usuario | 7 | tesler |
| caminho-longo | 7 | parkinson |
| sem-atalho | 7 | nenhuma |
| excesso-acoes | 8 | hick |
| sem-destaque | 8 | von-restorff |
| ruido-visual | 8 | nenhuma |
| erro-opaco | 9 | nenhuma |
| sem-ajuda | 10 | nenhuma |

Supressão no mesmo `grupo` (o script aplica; não renderize as duas):

- `excesso-acoes` absorve `sem-destaque`
- `feedback-lento` absorve `status-invisivel`
- `erro-opaco` absorve `fim-sem-status`
- `visual-mesma-funcao` absorve `sem-destaque`

### 4. Correlação código ↔ evidência (se `--code`)

Pra cada violação, busca o componente:

```bash
# Busca textos visíveis no código
grep -rn "<texto visível na violação>" <path>/src
# Busca selectors/classes
grep -rn "<class-name-suspeito>" <path>/src
```

Heurística de match: primeiro hit em componente que renderiza o texto. Sem match → `file: null, line: null` (fix prompt sai sem o snippet de código).

### 5. Render do HTML

Use o template inline na seção "Template HTML". Os números do header saem do JSON do `score.py` (`geral`, `camada_leis`, `achados_unicos`, `por_heuristica`, `por_lei`). A lista de fichas é `achados`, já fundida — uma vez por achado, agrupada pela heurística de origem, com a lei no título. Não desenhe a mesma ficha de novo na seção de leis; lá entra só o placar. Embute screenshots em base64 e grave `usabilidade-report-YYYY-MM-DD-HHmm.html` em `/tmp/` ou na pasta atual.

### 6. Entrega

```bash
# Sobe via preview-server (skill do control-plane) ou simples python
python3 -m http.server 8765 -d <pasta-do-report> &
open http://localhost:8765/<arquivo>.html
```

Imprime no CLI:
```
Audit concluído
  URL: <url>
  Geral: 73/100 (camada Nielsen)
  Leis: 81/100
  Achados únicos: 12 (3 graves, 5 moderadas, 4 cosméticas)
  Report: /tmp/usabilidade-report-2026-05-18-1432.html
  Servindo em: http://localhost:8765/
```

---

## Catálogo — 10 heurísticas de Nielsen (PT-BR)

> Cada heurística tem: **descrição curta** · **critérios objetivos** (o que checar) · **sinais de violação** (smells) · **template de fix prompt**.
>
> O template é o miolo. O `fix_cabecalho` que o `score.py` devolve vem antes, e o número de aceite dele ganha de qualquer número antigo do template.

### H1 — Visibilidade do status do sistema

O sistema sempre mantém o usuário informado sobre o que está acontecendo, com feedback apropriado em tempo razoável.

**Critérios objetivos:**
- Toda ação do usuário tem mudança visível em <= 400 ms (Doherty; família `feedback-lento`)
- Se a operação passa de 400 ms, o controle já mostra disabled, skeleton ou progresso nesse prazo
- Estado atual (página, modo, seleção) está visível sem adivinhar — família `status-invisivel`, outro grupo, não uma segunda ficha do mesmo botão

**Sinais de violação:**
- Botão clicado sem mudança de estado (sem disabled, sem spinner)
- Loading sem indicação de progresso em operação longa
- Form submit sem feedback (usuário não sabe se enviou)
- Página carregada sem indicação de qual rota tá ativa (nav sem `aria-current` nem highlight)
- Modal aberto sem overlay (usuário não sabe que está "preso")

**Fix prompt template:**
```text
Heurística violada: H1 — Visibilidade do status do sistema
Severidade: <0–4>

Contexto: <O que o usuário está tentando fazer>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: adicionar <loading state | feedback visual | progress indicator>
ao componente para que o usuário saiba que <ação X> está em andamento.

Critério de aceitação:
- Resposta visível em <= 400 ms (o número do fix_cabecalho; não abrir segunda ficha)
- Botão fica disabled durante a operação
- Erro ou sucesso comunicado ao final
```

---

### H2 — Correspondência entre sistema e mundo real

O sistema fala a linguagem do usuário — palavras, conceitos e convenções familiares — em vez de termos técnicos do sistema.

**Critérios objetivos:**
- Texto em PT-BR (sem jargão técnico desnecessário pra audiência alvo)
- Ícones reconhecíveis ou acompanhados de label
- Datas em formato local (DD/MM/AAAA, não ISO 8601 cru)
- Moeda com símbolo R$ na posição correta
- Mensagens de erro em linguagem humana (não stack trace)

**Sinais de violação:**
- Botão "Submit", "Delete", "Cancel" em app PT-BR
- Mensagem de erro tipo `Error 500: Internal Server Error` voltada pro usuário final
- Data em formato `2026-05-18T14:32:00Z`
- Ícone isolado sem tooltip nem label (usuário precisa adivinhar)
- Jargão técnico em UI de consumidor (`endpoint`, `payload`, `cache`)

**Fix prompt template:**
```text
Heurística violada: H2 — Correspondência sistema/mundo real
Severidade: <0–4>

Contexto: <onde aparece o termo problemático>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: substituir "<termo técnico>" por "<termo natural PT-BR>".
<Se aplicável: adicionar tooltip ao ícone>.

Critério de aceitação:
- Termo legível por usuário sem background técnico
- Consistente com o resto do app (checa se outros lugares usam o mesmo termo)
```

---

### H3 — Controle e liberdade do usuário

Usuários frequentemente executam ações por engano. Eles precisam de uma "saída de emergência" claramente marcada.

**Critérios objetivos:**
- Toda ação destrutiva (delete, cancelar pagamento) tem confirmação
- Confirmações têm botão "Cancelar" tão visível quanto "Confirmar"
- Modais e overlays fecham com ESC e clique fora
- Formulários longos têm "Salvar rascunho" ou autosave
- Undo disponível em ações reversíveis recentes

**Sinais de violação:**
- Botão "Excluir" sem confirmação
- Modal sem botão de fechar e sem ESC funcional
- Form que perde dados ao trocar de aba
- Ação destrutiva com mesmo estilo de ação positiva
- Sem indicação de "como voltar" em fluxo multi-step

**Fix prompt template:**
```text
Heurística violada: H3 — Controle e liberdade
Severidade: <0–4>

Contexto: <ação destrutiva ou estado preso>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: adicionar <modal de confirmação | botão de cancelar |
ESC handler | undo toast> para que o usuário possa <reverter | escapar>.

Critério de aceitação:
- Usuário consegue cancelar sem perder contexto
- Ações destrutivas pedem confirmação explícita
- ESC fecha overlays
```

---

### H4 — Consistência e padronização

Usuários não devem ter que adivinhar se palavras, situações ou ações diferentes significam a mesma coisa. Siga convenções da plataforma e do próprio produto.

**Critérios objetivos:**
- Botões primários têm o mesmo estilo em todas as telas
- Iconografia consistente (mesmo ícone = mesma ação em todo o app)
- Terminologia consistente ("Salvar" vs "Gravar" vs "Confirmar" — escolhe um)
- Posicionamento consistente (CTA primário sempre à direita, ou sempre à esquerda)
- Padrões da plataforma respeitados (iOS HIG, Material, plataforma web)

**Sinais de violação:**
- Botão primário azul em uma tela, verde em outra (sem semântica)
- "Excluir" numa tela, "Deletar" em outra, "Remover" em outra
- Ícone de lixeira fazendo delete numa tela e archive em outra
- Nav fixo no topo numa rota, no side em outra (sem motivo)
- Componente refeito do zero quando já existe um equivalente

**Fix prompt template:**
```text
Heurística violada: H4 — Consistência
Severidade: <0–4>

Contexto: <divergência detectada e onde ela aparece>

Arquivos envolvidos:
- <path:line> usa "<variante A>"
- <path:line> usa "<variante B>"

Ação sugerida: padronizar para "<variante escolhida>" (justificativa:
<motivo, ex.: mais frequente / alinhado com design system>).

Critério de aceitação:
- Mesmo termo/estilo em todos os pontos
- Atualizar design system / componente base se aplicável
```

---

### H5 — Prevenção de erros

Melhor que boas mensagens de erro é um design cuidadoso que previne o erro acontecer.

**Critérios objetivos:**
- Inputs validam em tempo real (não só no submit)
- Campos obrigatórios marcados claramente (asterisco + label)
- Constraints comunicados antes do erro (ex.: "mínimo 8 caracteres" antes de digitar)
- Ações irreversíveis precisam de "double opt-in" (digite "DELETAR" pra confirmar)
- Auto-complete e suggestions reduzem typing

`<= 200 ms` aqui é validação de campo (família `erro-evitavel`). Resposta a um clique é `feedback-lento` / Doherty, `<= 400 ms`. Não junte as duas fichas.

**Sinais de violação:**
- Form valida só no submit, perdendo contexto
- Campo de email sem validação visual
- Botão "Pagar" ativo com form inválido
- Sem indicação de campos obrigatórios
- Datepicker que aceita data no passado quando contexto exige futuro

**Fix prompt template:**
```text
Heurística violada: H5 — Prevenção de erros
Severidade: <0–4>

Contexto: <input ou ação que permite erro evitável>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: adicionar <validação em tempo real | disabled state |
constraint UI | confirmação dupla> para evitar <erro X>.

Critério de aceitação:
- Erro evitado antes do submit
- Feedback imediato (< 200ms após digitação)
- Mensagem específica do que tá errado
```

---

### H6 — Reconhecimento em vez de memorização

Minimize a carga de memória do usuário tornando objetos, ações e opções visíveis. O usuário não deve ter que lembrar informação de uma parte da interface pra outra.

**Critérios objetivos:**
- Breadcrumbs em fluxos profundos (> 2 níveis)
- Recently viewed / histórico acessível
- Form auto-complete onde faz sentido (endereço, cartão)
- Labels permanentes (não só placeholder que some ao digitar)
- Contexto preservado ao voltar (scroll position, filtros aplicados)

**Sinais de violação:**
- Placeholder como única indicação do campo (some ao digitar)
- Fluxo multi-step sem indicação do step atual
- Lista filtrada que perde o filtro ao navegar e voltar
- Modal que pede dado do step anterior sem mostrar
- "Confirme seu email" sem mostrar o email digitado

**Fix prompt template:**
```text
Heurística violada: H6 — Reconhecimento vs. memorização
Severidade: <0–4>

Contexto: <onde o usuário tem que lembrar algo desnecessariamente>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: tornar <informação X> visível na tela em vez de exigir
que o usuário lembre. Adicionar <label permanente | breadcrumb |
step indicator | recapitulação>.

Critério de aceitação:
- Informação relevante visível sem precisar voltar
- Labels sempre presentes (não dependem de focus)
```

---

### H7 — Flexibilidade e eficiência de uso

Atalhos, acelerados pelo usuário, podem agilizar interação para o usuário experiente, de forma que o sistema sirva tanto novatos quanto experientes.

**Critérios objetivos:**
- Atalhos de teclado documentados (`?` ou modal de help)
- Comandos comuns têm atalho (`Cmd+K` pra busca, `Cmd+Enter` pra submit)
- Bulk actions em listas (selecionar múltiplos)
- Filtros e sort persistentes na sessão
- Customização permitida onde faz sentido (densidade, tema, layout)

**Sinais de violação:**
- App produtivo sem nenhum atalho de teclado
- Lista com 100 itens sem busca/filtro
- Sem "select all" em ações em lote
- Submit que requer mouse (sem Enter)
- Form longo sem tab order coerente

**Fix prompt template:**
```text
Heurística violada: H7 — Flexibilidade e eficiência
Severidade: <0–4>

Contexto: <fluxo ineficiente pra usuário experiente>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: adicionar <atalho de teclado | bulk action | filtro |
customização> para reduzir cliques em <ação X>.

Critério de aceitação:
- Power user consegue completar a ação sem mouse
- Atalho documentado no modal de help
```

---

### H8 — Estética e design minimalista

Interfaces não devem conter informação irrelevante ou raramente necessária. Cada unidade extra de informação compete com as unidades relevantes e diminui sua visibilidade.

**Critérios objetivos:**
- Hierarquia visual clara (1 CTA primário por tela)
- Whitespace usado pra agrupar relacionados
- Tipografia limitada (2-3 famílias máximo, escala consistente)
- Cores semânticas (vermelho = destrutivo, verde = sucesso)
- Nada decorativo que não comunique

**Sinais de violação:**
- Múltiplos CTAs com mesma proeminência ("hierarquia plana")
- Texto longo sem hierarquia (todos os parágrafos parecem iguais)
- 5+ cores de marca brigando por atenção
- Emojis decorativos sem função semântica
- Carrossel/animação que distrai do conteúdo principal
- Densidade visual extrema (UI estilo "painel de controle 1998")

**Fix prompt template:**
```text
Heurística violada: H8 — Estética e minimalismo
Severidade: <0–4>

Contexto: <onde há ruído visual>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: <reduzir CTAs concorrentes a 1 primário | remover
elementos decorativos | aumentar whitespace | unificar paleta>.

Critério de aceitação:
- Usuário identifica em < 3s o que fazer primeiro
- Hierarquia visual reflete prioridade de ação
```

---

### H9 — Ajude usuários a reconhecer, diagnosticar e recuperar de erros

Mensagens de erro devem ser em linguagem clara (sem códigos), indicar precisamente o problema e sugerir uma solução construtiva.

**Critérios objetivos:**
- Mensagem de erro em PT-BR claro
- Identifica o campo/ação problemática (não erro genérico)
- Sugere o que fazer (não só "erro")
- Tom não-acusatório ("Verifique a senha" > "Senha inválida")
- Recuperação possível sem perder dados do form

**Sinais de violação:**
- "Erro" sem mais info
- Stack trace voltado pro usuário
- Erro vermelho sem dizer qual campo
- "Tente novamente" sem dizer o que mudou
- Form que apaga tudo ao dar erro

**Fix prompt template:**
```text
Heurística violada: H9 — Recuperação de erros
Severidade: <0–4>

Contexto: <cenário de erro mal tratado>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: reescrever mensagem de erro para indicar (a) campo
afetado, (b) o que tá errado, (c) como corrigir. Preservar dados do
form.

Critério de aceitação:
- Mensagem identifica o problema específico
- Sugere ação corretiva
- Form mantém dados preenchidos
```

---

### H10 — Ajuda e documentação

Mesmo que seja melhor o sistema ser usado sem documentação, pode ser necessário fornecer ajuda. Qualquer documentação deve ser fácil de buscar, focada na tarefa do usuário, listar passos concretos e não ser muito grande.

**Critérios objetivos:**
- Help acessível em < 2 cliques (`?` no header, link no footer)
- Tooltips em ícones e termos técnicos
- Empty states explicam o que fazer (não só "sem dados")
- Onboarding para fluxos complexos
- FAQ ou docs linkados de contexto relevante

**Sinais de violação:**
- Sem help acessível no app
- Empty state que diz "Nada aqui" sem CTA
- Termo técnico sem tooltip nem doc
- Documentação separada que não linka de volta pro app
- Tour de onboarding que aparece toda vez (sem dismiss persistente)

**Fix prompt template:**
```text
Heurística violada: H10 — Ajuda e documentação
Severidade: <0–4>

Contexto: <onde falta orientação>

Arquivo: <path:line>
Trecho atual:
<código>

Ação sugerida: adicionar <tooltip | empty state com CTA | link pra docs |
help contextual> para esclarecer <conceito X>.

Critério de aceitação:
- Usuário novo entende sem perguntar
- Help acessível sem sair da tela
```

---

## Escala de severidade (Nielsen)

| Nível | Nome | Critério |
|---|---|---|
| 0 | Cosmético | Não precisa fixar a menos que tenha tempo |
| 1 | Menor | Problema de baixa prioridade |
| 2 | Maior | Problema de alta prioridade, fixar com prioridade |
| 3 | Crítico | Imperativo fixar antes de release |
| 4 | Catastrófico | Bloqueia o uso do produto, fixar agora |

Default do filtro: `--severidade-min 2`.

---

## Template HTML (esqueleto)

Self-contained, sem CDN. Estrutura mínima:

```html
<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<title>Auditoria de usabilidade — {{url}}</title>
<style>
  :root { --bg:#0e0f12; --fg:#e9e9ec; --muted:#8a8d96; --line:#1f2127;
          --ok:#2dbf6c; --warn:#e4b836; --bad:#e25757; --accent:#7a9bff; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 ui-sans-serif, system-ui, -apple-system,
         sans-serif; background:var(--bg); color:var(--fg); }
  header { padding: 32px 48px; border-bottom: 1px solid var(--line); }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 6px; }
  .meta { color: var(--muted); font-size: 13px; }
  .score-hero { display:flex; gap: 32px; align-items: baseline;
                margin-top: 16px; }
  .score-hero .n { font-size: 56px; font-weight: 700; }
  main { padding: 32px 48px; max-width: 1100px; }
  .heuristic { border: 1px solid var(--line); border-radius: 10px;
               padding: 20px; margin: 16px 0; }
  .heuristic h2 { font-size: 16px; margin: 0 0 4px;
                  display:flex; gap: 10px; align-items: center; }
  .status { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
  .status.ok { background: rgba(45,191,108,.15); color: var(--ok); }
  .status.warn { background: rgba(228,184,54,.15); color: var(--warn); }
  .status.bad { background: rgba(226,87,87,.15); color: var(--bad); }
  details { border-top: 1px solid var(--line); padding: 14px 0;
            margin-top: 14px; }
  details summary { cursor: pointer; font-weight: 500; }
  details pre { background: #07080a; border: 1px solid var(--line);
                padding: 12px; border-radius: 6px; overflow-x: auto;
                font: 13px/1.5 ui-monospace, monospace; }
  .copy-btn { float: right; font-size: 11px; padding: 4px 10px;
              border: 1px solid var(--line); background: transparent;
              color: var(--accent); border-radius: 4px; cursor: pointer; }
  .copy-btn:hover { background: rgba(122,155,255,.08); }
  img.evidence { max-width: 100%; border: 1px solid var(--line);
                 border-radius: 6px; margin: 10px 0; }
  footer { color: var(--muted); font-size: 12px; padding: 24px 48px;
           border-top: 1px solid var(--line); }
</style>
</head>
<body>
<header>
  <h1>Auditoria de usabilidade — Nielsen e leis</h1>
  <div class="meta">{{url}} · {{data}} · {{rotas_count}} rota(s) · severidade média {{severidade_media}} · {{duplicatas_removidas}} duplicata(s) fundida(s)</div>
  <div class="score-hero">
    <div><div class="n">{{geral}}</div><div class="meta">geral / 100 · camada Nielsen</div></div>
    <div><div class="n">{{camada_leis}}</div><div class="meta">camada leis / 100</div></div>
    <div><div class="n">{{achados_unicos}}</div><div class="meta">achados únicos</div></div>
  </div>
</header>
<main>
  <section id="sumario">{{sumario_executivo_html}}</section>
  <section id="leis">
    <h2>Camada leis</h2>
    <p class="meta">Mesmos achados, lidos pela lei. O geral não soma esta camada de novo.</p>
    {{#each por_lei}}
    <p>{{nome}} · {{score}}/10 · origem H{{heuristica}}</p>
    {{/each}}
  </section>
  {{#each heuristicas}}
  <article class="heuristic">
    <h2>H{{n}} — {{nome}} <span class="status {{status_class}}">{{status_text}}</span></h2>
    <div class="meta">{{descricao_curta}} · score {{score}}/10</div>
    {{#each violacoes}}
    <details>
      <summary>{{titulo}} <span class="meta">· {{lei_ou_nenhuma}} · sev {{severidade}}</span></summary>
      <p>{{descricao}}</p>
      <p class="meta">Aceite: {{criterio_numerico}}</p>
      {{#if screenshot}}<img class="evidence" src="data:image/png;base64,{{screenshot}}">{{/if}}
      {{#if codigo.file}}<div class="meta">{{codigo.file}}:{{codigo.line}}</div>
      <pre>{{codigo.snippet}}</pre>{{/if}}
      <button class="copy-btn" data-target="fix-{{id}}">copiar fix prompt</button>
      <pre id="fix-{{id}}">{{fix_cabecalho}}
{{fix_prompt}}</pre>
    </details>
    {{/each}}
  </article>
  {{/each}}
</main>
<footer>
  Gerado por <code>/tapioca:usabilidade-br</code> ·
  Heurísticas: <a href="https://www.nngroup.com/articles/ten-usability-heuristics/">NN/g</a>
  · Leis: <a href="https://lawsofux.com/">Laws of UX</a>
  · Critérios numéricos escritos para esta skill, a partir de Leandro Rezende (Bold School) e do catálogo Laws of UX.
</footer>
<script>
document.querySelectorAll('.copy-btn').forEach(b => b.addEventListener('click', () => {
  const t = document.getElementById(b.dataset.target).innerText;
  navigator.clipboard.writeText(t);
  b.textContent = 'copiado ✓';
  setTimeout(() => b.textContent = 'copiar fix prompt', 1500);
}));
</script>
</body>
</html>
```

Substitui `{{...}}` por valores reais; o `{{#each}}` é pseudocódigo — você (skill) renderiza com template engine simples ou string interpolation (sem deps).

---

## Cálculo do score

Rode `score.py`. Não refaça a conta na mão. A fórmula, para ler o report:

- Peso por severidade: `{0: 0.5, 1: 1, 2: 2, 3: 3, 4: 5}`.
- Cada achado único desconta o peso uma vez, no bucket da heurística de origem.
- `score_heuristica = max(0, 10 - soma dos pesos)`. `camada_nielsen = soma das 10` (0–100).
- `camada_leis`: o mesmo peso, no bucket da lei, só para `leis_aplicaveis`. Lei sem ficha vale 10. A camada é a média desses buckets vezes 10. Lei fora da lista não entra no denominador.
- `geral = camada_nielsen`. A camada leis relê os achados que têm lei. Não some as duas, não faça a média das duas: a multa já foi aplicada na heurística de origem.

Pisos do geral (camada Nielsen):
- 90+ → excelente
- 75–89 → bom
- 60–74 → atenção
- abaixo de 60 → ação imediata

---

## Restrições

- **Não invente violações** pra "encontrar problema". Se a tela tá ok numa heurística, marca pass e segue. Falso positivo destrói credibilidade do report.
- **Não duplique achado.** Quem entra no HTML é a lista do `score.py`. Mesma rota, mesmo selector, mesma família é uma ficha. Hick absorve destaque no mesmo grupo, Doherty absorve status no mesmo controle, erro opaco absorve pico-final, similaridade absorve destaque no mesmo par.
- **Não invente milissegundo.** Sem medição, a ficha de Doherty descreve a ausência de mudança de estado. O aceite permanece <= 400 ms.
- **Não copie** o material de Leandro Rezende para o report. O crédito fica no rodapé; a regra aplicada é a de `leis.md`.
- **Não cite código que não viu.** Sem `--code`, o fix prompt sai com `file: null` e diz "componente não localizado automaticamente".
- **Não use emojis decorativos** no report. Ícones de status (✓⚠✗) são semânticos, OK.
- **Não acesse URLs externas** sem permissão (no fetch de docs, no telemetria). Tudo local.
- **Não substitua o usuário real.** Heurística é checagem rápida, não validação de UX.

---

## Saída esperada no chat

Curta, apontando pro report:

```
Audit concluído pra http://localhost:3000

Geral: 73/100 (camada Nielsen)  ·  Leis: 81/100  ·  12 achados únicos  ·  severidade média 2.1

Top 3:
- H1 · Doherty (sev 3): enviar sem resposta em <= 400 ms — ContactForm.tsx:24
- H7 · Fitts (sev 3): alvo de 32 px, piso 44 px — CheckoutForm.tsx:88
- H8 · Hick (sev 2): 6 ações no mesmo patamar, sem Mais — Toolbar.tsx:12

Report: file:///tmp/usabilidade-report-2026-05-18-1432.html
Servindo em: http://localhost:8765/
```

---

## Referência

- [NN/g — 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — fonte canônica
- Nielsen, Jakob (1994). *Usability Engineering*. Morgan Kaufmann.
- [NN/g — Severity Ratings for Usability Problems](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/) — escala 0–4
- [Laws of UX](https://lawsofux.com/) (Jon Yablonski) — catálogo público das leis
- Leandro Rezende (Bold School). A ideia de auditar com lei numérica amarrada à heurística de origem vem do material dele. As regras em `leis.md` foram escritas para esta skill; não copie o arquivo dele.
