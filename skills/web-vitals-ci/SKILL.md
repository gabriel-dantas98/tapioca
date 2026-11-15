---
name: web-vitals-ci
description: |
  Implementa um gate de regressao de Core Web Vitals (lab) no CI de qualquer repo web
  com @lhci/cli contra preview local (nao producao). Cobre Vite/Next/etc., lighthouserc,
  budgets calibrados (Perf/LCP/CLS/TBT), job GitHub Actions e docs de atualizacao.
  Gatilhos: web vitals CI, lighthouse CI, gate de performance, regressao LCP/CLS,
  test:web-vitals, /tapioca:web-vitals-ci.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---

# web-vitals-ci

Ensina o agente a **implementar um gate de regressao de Web Vitals no CI** de um repo alvo — o mesmo padrao usado em apps Vite/React com `@lhci/cli` + preview local.

Esta skill **nao roda Lighthouse no plugin tapioca**. Ela gera/adapta arquivos no repo do usuario.

Templates portaveis em `templates/` (ao lado deste `SKILL.md`).

## When to use

- Usuario pede gate de Web Vitals / Lighthouse CI / "fail CI se LCP/CLS regredir".
- Quer budgets de Perf score, LCP, CLS, TBT (proxy de INP) em PR/`main`.
- Precisa documentar como rodar local e como atualizar thresholds.

Nao use para: RUM/field data (CrUX, web-vitals.js em prod), otimizar a pagina em si, ou auditar UX (use `usabilidade-br`).

## Invocacao

```text
/tapioca:web-vitals-ci [caminho-do-repo]
```

Ou linguagem natural: "adiciona lighthouse CI", "gate de web vitals", "falha o PR se LCP piorar".

Se o cwd ja for o repo alvo, nao precisa de caminho. Se ambiguo, pergunta com `AskUserQuestion`.

## Fluxo de implementacao

Siga nesta ordem. Nao pule a calibracao.

### 1. Detectar o stack e o preview

Leia `package.json`, lockfile, e config de build (`vite.config.*`, `next.config.*`, `astro.config.*`, etc.).

| Stack | Build | Servir preview (producao-like) | Ready pattern tipico |
|---|---|---|---|
| Vite | `npm run build` | `NO_COLOR=1 npm run preview -- --host 127.0.0.1 --port 4173` | `http://127\\.0\\.0\\.1:4173` (nao `Local:`) |
| Next.js | `npm run build` | `npx next start -H 127.0.0.1 -p 3000` (apos build) | `Ready` / `started server` |
| Astro | `npm run build` | `NO_COLOR=1 npm run preview -- --host 127.0.0.1 --port 4321` | URL na porta (evite label colorido) |
| SPA estatico (qualquer) | build → `dist/` | `npx serve dist -l 4173` (ou `http-server`) | `Accepting connections` |

Regras:

- Sempre medir o **bundle de producao** (build + preview), nunca `dev` server.
- **Nao** bater em producao/staging remoto a partir do CI (flaky, lento, mistura deploy).
- SPA com `BrowserRouter`: o preview precisa de fallback pra `index.html` (Vite `preview` ja faz; `serve` com SPA flag se usar static).
- Confirme a porta e o `startServerReadyPattern` batendo o comando localmente uma vez se duvidar.
- **Vite + CI:** nao use `Local:` como ready pattern — o Vite pinta ANSI em volta do label e o match flakeia. Prefira `NO_COLOR=1` no comando **e** um pattern na URL (`http://127\\.0\\.0\\.1:4173`).
- **Chromium no GitHub Actions (Playwright):** sandbox flags obrigatorias, mas **`collect.chromeFlags` string sozinho ja falhou em producao** (flags nao chegaram ao ChromeLauncher). Use o padrao do template (string + array em `settings`, com `--disable-setuid-sandbox`). Se o log ainda mostrar `No usable sandbox!`, mude o browser (Chrome apt / Puppeteer), nao so a string de flags.

### 2. Escolher rotas criticas

Pegue 2–4 URLs estaveis, nao o sitemap inteiro.

Bom default:

1. Homepage `/`
2. Uma rota de listagem/browse critica
3. Uma rota secundaria leve (canary barato)

Evite (pelo menos na v1):

- Detalhe com media pesada / CMS remoto (variancia)
- Rotas autenticadas
- Rotas que dependem de rede externa nao mockada

Documente o "why" de cada URL em `docs/ci/web-vitals.md`.

### 3. Adicionar dependencia e script

```bash
npm install -D @lhci/cli
```

Em `package.json`:

```json
{
  "scripts": {
    "test:web-vitals": "lhci autorun --config=lighthouserc.cjs"
  }
}
```

Snippet de referencia: `templates/package-scripts.json`.

### 4. Criar `lighthouserc.cjs`

Copie `templates/lighthouserc.cjs` pra raiz do repo e ajuste:

- `startServerCommand` / `startServerReadyPattern` / porta
- `url` (lista absoluta `http://127.0.0.1:<port>/...`)
- `assertMatrix` com `matchingUrlPattern` por rota
- `chromeFlags` (sandbox flags — ver abaixo)

Padrao fixo:

- `numberOfRuns: 3` + `aggregationMethod: 'median-run'`
- `onlyCategories: ['performance']`
- Mobile + throttling simulado (default LH)
- Metricas: `categories:performance`, `largest-contentful-paint`, `cumulative-layout-shift`, `total-blocking-time`
- **TBT** = proxy de lab para **INP** (INP nao e confiavel no lab do Lighthouse)
- Upload `filesystem` → `./output/lhci` (gitignored)
- `chromePath: process.env.CHROME_PATH || undefined`
- Chrome flags: `collect.chromeFlags` (string) **e** `collect.settings.chromeFlags` (array) com `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage`. Nao confie so no collect-level string.
- Vite: `NO_COLOR=1` no `startServerCommand`; ready pattern = URL/porta, nao `Local:`

### 5. Calibrar budgets (obrigatorio)

Nao copie numeros de outro projeto. Calibre no repo alvo.

```bash
npm run build
npm run test:web-vitals
```

Se ainda nao ha assertions apertadas, rode uma vez com asserts frouxos (ou so collect) e leia as medianas no output / `output/lhci`.

Formula pratica de headroom:

- score min ≈ mediana − 0.10 a 0.15 (ou ~15–25% de folga relativa ao "ruim")
- LCP/TBT max ≈ mediana × 1.15–1.25
- CLS max ≈ mediana + margem pequena (CLS e ruidoso; paginas com CLS ~0.3 precisam budget maior que a home)

Objetivo: **baseline atual passa**; regressao clara falha; ruido normal de CI nao flakeia.

Comente no `assertMatrix` as medianas observadas (ex.: `// Baseline medians (~): score 0.80, LCP 4288ms, CLS 0, TBT 122ms`).

So aperte em direcao aos targets de campo "good" (LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms) **depois** de trabalho real de performance — o gate e de regressao, nao de score perfeito no dia 1.

### 6. Wire GitHub Actions

Adicione (ou adapte) o job `web-vitals` no workflow de CI. Template: `templates/workflow-job.yml`.

Checklist do job:

- Mesmo Node do resto do CI
- `npm ci` → `npm run build` → Chromium → `npm run test:web-vitals`
- Chrome no runner: Playwright Chromium **ou** (mais seguro se sandbox continuar falhando) `google-chrome-stable` / Puppeteer Chrome — ver gotcha #1
- `lighthouserc.cjs` com flags em **dois** lugares (string em `collect.chromeFlags` **e** array em `collect.settings.chromeFlags`), incluindo `--disable-setuid-sandbox`
- Vite: `NO_COLOR=1` + ready pattern na URL/porta (ver gotchas)
- `timeout-minutes` generoso (15–25) — 3 runs × N URLs demora
- Upload artifact de `output/lhci` e `.lighthouseci` (`if: !cancelled()`)
- Rodar em PRs e na branch default

Nao reinvente install/cache se o workflow ja tem steps reutilizaveis — espelhe o padrao existente do repo.

### CI gotchas (verificados)

1. **`collect.chromeFlags` sozinho NAO basta com Playwright Chromium.** Evidencia (3Dantas PR #82, job `web-vitals` em `7bf5697`): config tinha `collect.chromeFlags: '--no-sandbox --disable-dev-shm-usage'` e o ChromeLauncher ainda morreu com `No usable sandbox!` / `chrome-err.log` pedindo `--no-sandbox` — ou seja, a flag **nao chegou** ao processo. Mitigacao no template:
   - string em `collect.chromeFlags` **e** array em `collect.settings.chromeFlags`
   - incluir `--disable-setuid-sandbox` alem de `--no-sandbox --disable-dev-shm-usage`
   - se ainda falhar: troque `CHROME_PATH` para Chrome "de verdade" (`google-chrome-stable` via apt, ou Puppeteer), nao o Chromium do Playwright
2. **Ready pattern `Local:` flakeia com Vite colorido.** Stdout vem com ANSI. Use `NO_COLOR=1` no `startServerCommand` e match a URL/porta (`http://127\\.0\\.0\\.1:4173` ou `4173`), nao o label.

### 7. Docs + gitignore + AGENTS/README do repo alvo

1. Copie/adapte `templates/docs-web-vitals.md` → `docs/ci/web-vitals.md` (ou caminho de docs do projeto).
2. Gitignore: `.lighthouseci/` e, se ainda nao, `output/` (ou pelo menos `output/lhci/`).
3. Mencione o comando local em `AGENTS.md` / `CLAUDE.md` / `README.md` do **repo alvo** (nao do tapioca).

## SPA e tempo de CI

- Prefira poucas rotas estaveis a cobertura ampla.
- `onlyCategories: ['performance']` e `skipAudits` de ruido (`uses-http2`, `bf-cache`) reduzem tempo.
- 3 runs e o minimo sensato pra mediana; nao suba pra 5+ sem motivo.
- Em SPA, LCP/CLS de rotas client-rendered podem ficar feios no lab — calibre pra realidade do preview, nao pra marketing de score.
- Conteudo que vem de API/CMS: mock ou skip da rota; senao o gate fica flaky.

## Hard rules

- Preview local no CI, nunca URL de producao.
- Calibrar budgets no repo; templates vem com placeholders/comentarios, nao com numeros de outro app.
- TBT como proxy de INP — documente isso no `docs/ci/web-vitals.md`.
- Sem emojis nos arquivos gerados; aspas retas; headings em sentence case.
- Nao commitar `.lighthouseci/` nem reports em `output/lhci/`.

## Common mistakes

- Usar `npm run dev` no `startServerCommand` → metricas irrelevantes.
- Copiar budgets do 3Dantas / de outro repo → flake ou gate morto.
- Auditar dezenas de rotas → CI lento e instavel.
- Esquecer fallback SPA no static server → 404 nas rotas profundas.
- Assertar INP direto no lab → metric ausente/instavel; use TBT.
- Nao setar `CHROME_PATH` em runners sem Chrome de sistema.
- Ready pattern `Local:` com Vite → timeout "server not ready" no CI (ANSI). Use URL + `NO_COLOR=1`.
- So `collect.chromeFlags` string com Playwright Chromium → ainda pode dar `No usable sandbox!` (flags nao chegam ao launcher). Use settings array + `--disable-setuid-sandbox`, ou Chrome nao-Playwright.

## Definition of done

- [ ] `@lhci/cli` em devDependencies + script `test:web-vitals`
- [ ] `lighthouserc.cjs` com collect + assertMatrix por URL + upload filesystem
- [ ] `chromeFlags` em collect (string) **e** settings (array), com `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage`
- [ ] Se CI ainda logar `No usable sandbox!`, trocar `CHROME_PATH` para Chrome apt/Puppeteer (nao so ajustar a string)
- [ ] Ready pattern ANSI-safe (`NO_COLOR=1` + match na URL; sem `Local:` cru no Vite)
- [ ] Job `web-vitals` no CI (build → Chromium → lhci)
- [ ] Budgets calibrados (baseline verde com margem)
- [ ] `docs/ci/web-vitals.md` (paginas, metricas, update path, CI gotchas)
- [ ] `.lighthouseci/` gitignored
- [ ] `npm run build && npm run test:web-vitals` passa local (ou no CI da PR)

## Reference pattern

Implementacao de referencia (Vite + React SPA): padrao `@lhci/cli` + `vite preview` + job `web-vitals` + `docs/ci/web-vitals.md`. Templates neste skill abstraem esse padrao sem hardcodar rotas/budgets de um app especifico.
