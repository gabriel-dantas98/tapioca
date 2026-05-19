---
name: usabilidade-br
description: |
  Audita usabilidade de apps web contra as 10 heurísticas de Jakob Nielsen e gera um report HTML local com evidência visual (screenshots), pontuação por heurística e um "prompt de fix" copiável por violação — pronto pra colar em outro Claude Code apontando file:line. Fecha o loop "audita → vê o problema → arruma".
  Gatilhos: auditar usabilidade, rodar Nielsen, heurísticas de usabilidade, revisar UX, audit de UI, checar usabilidade, /tapioca:usabilidade-br.
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

Auditor de usabilidade PT-BR baseado nas 10 heurísticas de Jakob Nielsen (1994, revisadas 2024 pela NN/g). Captura evidência via Chrome MCP, opcionalmente correlaciona com código fonte, e entrega um HTML report self-contained com fix prompts copiáveis.

Esta skill **não corrige nada sozinha** — gera o prompt cirúrgico que outro agente (ou o próprio Gabriel) executa.

## Decisão de modo

1. **Single page, sem código** (`--code` ausente) → roda direto na própria sessão. Pass único por heurística.
2. **Múltiplas rotas OU `--code` informado OU usuário pediu "audit sério"** → invoca o agent companion `usabilidade-br` (em `agents/`), que paraleliza 10 passes (um por heurística) e correlaciona código ↔ evidência.
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
5. javascript_tool — script que retorna outerHTML truncado (~50KB) +
   lista de selectors clicáveis (botões, links, inputs, [role])
6. read_console_messages — captura erros/warns
7. Screenshot full page via javascript_tool + html2canvas inline
   (alternativa: instrução pro usuário tirar screenshot manual e colar
   o caminho — Chrome MCP não tem screenshot direto)
```

**Importante:** Chrome MCP não expõe screenshot nativo no toolkit base — usar `javascript_tool` pra invocar `html2canvas` injetado, ou aceitar trabalho sem screenshot (degrada UX do report mas não bloqueia).

### 3. Análise (10 heurísticas)

Para cada uma das 10, aplique os critérios do catálogo abaixo na evidência coletada. Pra cada violação encontrada:

```json
{
  "heuristica": 1,
  "severidade": 0,
  "titulo": "string curta",
  "descricao": "1-2 frases descrevendo o problema",
  "evidencia": {
    "selector": "css selector",
    "snippet_html": "trecho HTML relevante",
    "screenshot_crop": "base64 ou null"
  },
  "codigo": {
    "file": "src/components/Header.tsx",
    "line": 42,
    "snippet": "trecho do código"
  },
  "fix_prompt": "texto completo do prompt copiável"
}
```

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

Use o template em `templates/report.html` (inline neste arquivo na seção "Template HTML"). Substitui placeholders, embute screenshots base64, gera arquivo `usabilidade-report-YYYY-MM-DD-HHmm.html` em `/tmp/` ou pasta atual.

### 6. Entrega

```bash
# Sobe via preview-server (skill do control-plane) ou simples python
python3 -m http.server 8765 -d <pasta-do-report> &
open http://localhost:8765/<arquivo>.html
```

Imprime no CLI:
```
✓ Audit concluído
  URL: <url>
  Score geral: 73/100
  Violações: 12 (3 graves, 5 moderadas, 4 cosméticas)
  Report: /tmp/usabilidade-report-2026-05-18-1432.html
  Servindo em: http://localhost:8765/
```

---

## Catálogo — 10 heurísticas de Nielsen (PT-BR)

> Cada heurística tem: **descrição curta** · **critérios objetivos** (o que checar) · **sinais de violação** (smells) · **template de fix prompt**.

### H1 — Visibilidade do status do sistema

O sistema sempre mantém o usuário informado sobre o que está acontecendo, com feedback apropriado em tempo razoável.

**Critérios objetivos:**
- Toda ação do usuário (click, submit, navegação) tem feedback visual em < 1s
- Operações > 1s mostram loading/spinner/skeleton
- Operações > 10s mostram progresso (% ou step indicator)
- Estado atual (página, modo, seleção) está visível sem precisar adivinhar

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
- Botão fica disabled durante a operação
- Spinner/skeleton visível em < 200ms
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
  <h1>Auditoria de usabilidade — Nielsen 10</h1>
  <div class="meta">{{url}} · {{data}} · {{rotas_count}} rota(s)</div>
  <div class="score-hero">
    <div><div class="n">{{score_geral}}</div><div class="meta">score geral / 100</div></div>
    <div><div class="n">{{violacoes_total}}</div><div class="meta">violações</div></div>
    <div><div class="n">{{severidade_media}}</div><div class="meta">severidade média</div></div>
  </div>
</header>
<main>
  <section id="sumario">{{sumario_executivo_html}}</section>
  {{#each heuristicas}}
  <article class="heuristic">
    <h2>H{{n}} — {{nome}} <span class="status {{status_class}}">{{status_text}}</span></h2>
    <div class="meta">{{descricao_curta}} · score {{score}}/10</div>
    {{#each violacoes}}
    <details>
      <summary>{{titulo}} <span class="meta">· sev {{severidade}}</span></summary>
      <p>{{descricao}}</p>
      {{#if screenshot}}<img class="evidence" src="data:image/png;base64,{{screenshot}}">{{/if}}
      {{#if codigo.file}}<div class="meta">{{codigo.file}}:{{codigo.line}}</div>
      <pre>{{codigo.snippet}}</pre>{{/if}}
      <button class="copy-btn" data-target="fix-{{id}}">copiar fix prompt</button>
      <pre id="fix-{{id}}">{{fix_prompt}}</pre>
    </details>
    {{/each}}
  </article>
  {{/each}}
</main>
<footer>
  Gerado por <code>/tapioca:usabilidade-br</code> ·
  Catálogo: <a href="https://www.nngroup.com/articles/ten-usability-heuristics/">NN/g — 10 Usability Heuristics</a>
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

## Cálculo do score geral

```
score_heuristica = max(0, 10 - sum(severidade_violacao * peso))
peso por severidade: {0:0.5, 1:1, 2:2, 3:3, 4:5}

score_geral = (sum(score_heuristica) / 100) * 100  // já em 0-100
```

Pisos:
- 90+ → excelente
- 75–89 → bom
- 60–74 → atenção
- < 60 → ação imediata

---

## Restrições

- **Não invente violações** pra "encontrar problema". Se a tela tá ok numa heurística, marca pass e segue. Falso positivo destrói credibilidade do report.
- **Não cite código que não viu.** Sem `--code`, o fix prompt sai com `file: null` e diz "componente não localizado automaticamente".
- **Não use emojis decorativos** no report. Ícones de status (✓⚠✗) são semânticos, OK.
- **Não acesse URLs externas** sem permissão (no fetch de docs, no telemetria). Tudo local.
- **Não substitua o usuário real.** Heurística é checagem rápida, não validação de UX.

---

## Saída esperada no chat

Curta, apontando pro report:

```
Audit concluído pra http://localhost:3000

Score: 73/100  ·  12 violações  ·  severidade média 2.1

Top 3 críticas:
- H3 (sev 3): modal de delete sem confirmação em DeleteModal.tsx:42
- H5 (sev 3): form de pagamento valida só no submit em CheckoutForm.tsx:88
- H1 (sev 2): botão "Enviar" sem loading state em ContactForm.tsx:24

Report: file:///tmp/usabilidade-report-2026-05-18-1432.html
Servindo em: http://localhost:8765/
```

---

## Referência

- [NN/g — 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — fonte canônica
- Nielsen, Jakob (1994). *Usability Engineering*. Morgan Kaufmann.
- [NN/g — Severity Ratings for Usability Problems](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/) — escala 0–4
