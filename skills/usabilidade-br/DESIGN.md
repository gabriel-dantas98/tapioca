# DESIGN — usabilidade-br

> Skill de auditoria de usabilidade para apps web com as **10 heurísticas de Nielsen**, gera report HTML local e um **prompt de fix copiável por violação** (file:line apontado, pronto pra colar em outro Claude Code).

## Goal

Fechar o loop "audita → vê o que tá ruim → arruma" num passo só. O agent captura evidência visual, aponta heurística violada, e devolve um prompt cirúrgico que outro agente consegue executar sem precisar reanalisar o app.

Targets primários:
- Apps web em desenvolvimento (localhost ou preview URL)
- Landing pages, dashboards, fluxos de onboarding
- Antes de PR de UI ir pra review humana — "passou no Nielsen?"

## Non-goals

- **Não classifica** se a UI é "boa" ou "ruim" subjetivamente — só checa as 10 heurísticas com critério claro.
- **Não testa acessibilidade automatizada** (axe-core, WCAG completo) — isso é trabalho de outra skill futura. Aqui cobrimos só o que Nielsen toca em UX (ex.: heurística 1 "visibilidade de status" sobrepõe um pouco com a11y, mas o foco é heurística clássica).
- **Não roda em mobile/desktop nativo** na v0.1 — Chrome MCP é o único capturador. Mobile fica pra v0.2.
- **Não corrige nada sozinha** — só gera o prompt de fix. Quem executa é o usuário ou outro agente.
- **Não substitui usability testing com gente real** — heurística é heurística.

## Inputs

Invocação mínima:

```
/tapioca:usabilidade-br <url>
```

Inputs opcionais:
- **`--code <path>`** — diretório raiz do código fonte (React/Vue/Svelte/HTML). Quando presente, a skill correlaciona o que vê na tela com o componente que renderiza, e o fix prompt sai com `file:line` apontado.
- **`--rotas <lista>`** — múltiplas rotas pra auditar (ex.: `/`, `/login`, `/dashboard`). Default: só a URL passada.
- **`--severidade-min <0-4>`** — filtra violações abaixo do nível (escala Nielsen: 0 cosmético → 4 catastrófico). Default: 2 (problemas menores pra cima).
- **`--voice <preset>`** — opcional. Arquivo com tom da empresa/produto pra contextualizar o report (ex.: report mais técnico vs. mais executivo).

Ambiente esperado:
- Chrome MCP disponível (`mcp__claude-in-chrome__*`)
- `preview-server` ou similar no host (pra abrir o HTML report no browser)
- Opcional: `MARITACA_API_KEY` se o usuário quiser texto do report em PT-BR mais natural (modo análogo ao humanizer-br)

## Outputs

### 1. Report HTML local (sempre)

Arquivo único auto-contido: `usabilidade-report-YYYY-MM-DD-HHmm.html`, servido via `preview-server`.

Estrutura:

```
┌─ Header: URL auditada, data, score geral (0–100), severidade média
├─ Sumário executivo (3–5 bullets, PT-BR humanizado)
├─ Score por heurística (radar chart inline, SVG, sem deps externas)
├─ Para cada uma das 10 heurísticas:
│   ├─ Nome + descrição curta
│   ├─ Status (✓ pass / ⚠ warn / ✗ fail) + score 0–10
│   ├─ Lista de violações (se houver):
│   │   ├─ Severidade (0–4 Nielsen)
│   │   ├─ Evidência: screenshot recortado + selector DOM
│   │   ├─ Snippet de código (se --code informado) com file:line
│   │   ├─ Bloco "Fix prompt" — copia-cola pronto
│   │   └─ Bloco "Como testar manualmente" — passos curtos
│   └─ ...
└─ Rodapé: limitações, escopo, link pro Nielsen Norman Group
```

Sem dependências externas no HTML — tudo inline (CSS, SVG, screenshots em base64). Roda offline depois de gerado.

### 2. Fix prompt blocks (dentro do HTML, copiáveis)

Cada violação tem um `<details>` com `<pre>` contendo prompt no formato:

```text
Heurística violada: <#N — Nome da heurística>
Severidade: <0–4 Nielsen>

Contexto: <1 frase do que tá rolando na tela>

Arquivo: <path:line>
Trecho atual:
```<tipo>
<código atual>
```

Ação sugerida:
<descrição cirúrgica do que mudar>

Critério de aceitação:
- <bullet 1>
- <bullet 2>

Re-auditar com: /tapioca:usabilidade-br <url-original> (deve sair desta lista)
```

Botão "Copiar" ao lado de cada bloco (JS inline mínimo).

### 3. JSON sidecar (opcional, sempre gerado pra automação)

Arquivo gêmeo `.json` com o mesmo conteúdo estruturado — permite outros tooling consumir (CI, dashboards, comparação entre runs).

## Voice / Tone (user-facing)

Report HTML segue padrão tapioca:
- PT-BR coloquial técnico, mesma régua do `humanizer-br`
- Sem emojis decorativos (mas ✓⚠✗ como ícones de status são OK — semânticos, não decorativos)
- Sentence case em todos os headings
- Aspas retas
- Texto descritivo passa pelo `humanizer-br` antes de cair no HTML quando `MARITACA_API_KEY` presente; senão Claude escreve direto (já calibrado)

Tom: **revisor sênior fazendo code review de UX**. Direto, evidência-primeiro, sem hedge ("você poderia talvez considerar..."). Aponta o problema, mostra a evidência, sugere o fix.

## Mecânica (high-level)

```
1. Bootstrap
   - Valida URL acessível
   - Inicia Chrome MCP (cria/reusa tab)
   - Se --code passado, indexa árvore de componentes

2. Captura
   Para cada rota em --rotas:
   - Navega
   - Espera idle (DOMContentLoaded + 1s)
   - get_page_text + screenshot full-page + screenshots de viewport
   - Lê console errors via read_console_messages

3. Análise (multi-pass por heurística)
   Para cada uma das 10 heurísticas:
   - Subagent dedicado (ver companion) recebe:
     - evidência visual
     - HTML/texto da página
     - código fonte relevante (se houver)
   - Retorna: status, score, violações (cada uma com evidência + sugestão)

4. Correlação código ↔ evidência (se --code)
   - Pra cada violação, busca o componente responsável
   - Resolve file:line via grep + heurística de match
   - Anexa snippet

5. Render
   - Template HTML self-contained
   - Screenshots embutidas base64
   - JS mínimo (copy buttons, accordion)

6. Entrega
   - Sobe via preview-server, abre no browser
   - Salva HTML + JSON ao lado
   - Imprime resumo CLI: score, # violações, path do report
```

## Padrão arquitetural

- **Skill** (`skills/usabilidade-br/SKILL.md`) = entry point, catálogo das 10 heurísticas com critérios PT-BR, template HTML, instruções de captura
- **Agent companion** (`agents/usabilidade-br.md`) = multi-pass: roda 1 pass por heurística em paralelo, agrega, monta o report

Mesma régua do `humanizer-br`: skill faz a passada simples, agent orquestra a versão "séria".

## As 10 heurísticas (catálogo a documentar no SKILL.md)

1. Visibilidade do status do sistema
2. Correspondência entre sistema e mundo real
3. Controle e liberdade do usuário
4. Consistência e padronização
5. Prevenção de erros
6. Reconhecimento em vez de memorização
7. Flexibilidade e eficiência de uso
8. Estética e design minimalista
9. Ajude usuários a reconhecer, diagnosticar e recuperar de erros
10. Ajuda e documentação

Cada uma vai ganhar no SKILL.md:
- Critério PT-BR objetivo (3–5 bullets do que checar)
- Sinais de violação (lista de smells visuais/comportamentais)
- Exemplos de fix prompt template

## Open questions

1. **Múltiplas rotas em paralelo?** Chrome MCP suporta múltiplas tabs — vale paralelizar captura, ou mantém sequencial pra evitar throttling? Default proposto: sequencial na v0.1, flag `--parallel` na v0.2.

2. **Login-gated apps?** Como auditar fluxos atrás de auth? Opções: (a) usuário loga manualmente antes de invocar (Chrome já tem sessão), (b) skill aceita `--cookie-file`, (c) out of scope da v0.1. Proposto: (a) — confia na sessão ativa do Chrome.

3. **Modo CI?** Vale rodar headless em PR (sem HTML, só JSON + exit code baseado no score mínimo)? Proposto: sim, mas v0.2 — primeira versão é interativa local.

4. **Comparação entre runs?** Diff entre auditorias (regressão de UX) é feature óbvia mas adiciona complexidade. Proposto: v0.2 com flag `--baseline <path-anterior.json>`.

5. **Severidade automática ou pedir review humana?** O agent atribui 0–4 baseado em critérios, mas Nielsen original é subjetivo. Proposto: agent atribui, marca como `[auto]`, usuário pode override no JSON e regerar HTML.

6. **Voice presets do humanizer-br se aplicam aqui?** O texto descritivo do report deveria suportar voice preset (executive vs. dev vs. design)? Proposto: sim na v0.2, default neutro técnico na v0.1.

---

**Não-implementado nesta DESIGN:** plugin.json updates, SKILL.md (catálogo completo), companion agent prompt, template HTML, smoke test. Esse arquivo é o contrato — implementação vem depois da aprovação do Gabriel.
