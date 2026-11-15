# DESIGN — web-vitals-ci

> Skill que ensina o agente a instalar um **gate de regressao de Core Web Vitals (lab)** em qualquer repo web, usando `@lhci/cli` contra preview local — o mesmo padrao operacional que ja rodou em apps Vite/React.

## Goal

Quando o usuario pede "falha o CI se Web Vitals regredir", o agente consegue:

1. Detectar o stack e o comando de preview producao-like
2. Escolher poucas rotas criticas e estaveis
3. Adicionar `@lhci/cli`, `lighthouserc.cjs`, script npm e job GitHub Actions
4. Calibrar budgets (Perf / LCP / CLS / TBT) com margem sobre o baseline atual
5. Documentar run local + como atualizar thresholds

O deliverable e codigo/config/docs no **repo alvo**, nao um report pontual.

## Non-goals

- Nao e RUM / field monitoring (CrUX, beacon `web-vitals`, Datadog RUM).
- Nao otimiza a UI — so trava regressao lab.
- Nao substitui Lighthouse manual exploratorio nem PageSpeed Insights de URL publica.
- Nao implementa o gate dentro do plugin tapioca (plugin nao e um app web).
- Nao exige LHCI server / storage remoto — filesystem upload basta.

## Inputs

```text
/tapioca:web-vitals-ci [path]
```

- path opcional do repo; default = cwd
- Stack inferido de `package.json` + configs
- Lista de rotas: pergunta se nao for obvio; default homepage + 1–2 criticas

## Outputs no repo alvo

| Artefato | Papel |
|---|---|
| `lighthouserc.cjs` | collect + assertMatrix + upload |
| `package.json` | `test:web-vitals` + `@lhci/cli` |
| `.github/workflows/*.yml` | job `web-vitals` |
| `docs/ci/web-vitals.md` | paginas, metricas, update path |
| `.gitignore` | `.lighthouseci/`, reports |

Templates fonte: `templates/` nesta skill.

## Design decisions

### Lab preview, not production

CI que bate URL de prod mistura deploy, CDN e flakiness. Build + preview local isola o bundle do PR.

### TBT as INP proxy

INP nao e confiavel no Lighthouse lab. TBT e o sinal de interatividade estavel o bastante pra gate.

### Median of 3 + headroom

Uma run so flakeia. Mediana de 3 + ~15–25% de folga deixa o gate util sem drama.

### Few stable routes

Cobertura ampla custa tempo e ruido. Homepage + browse critico + canary leve e o sweet spot.

### Calibrate per repo

Budgets nao sao universais. Templates trazem estrutura e comentarios; numeros vem do baseline medido no alvo.

### CI runner reality

Templates ja embutem gotchas verificados em GitHub Actions:

- Playwright Chromium exige `--no-sandbox --disable-dev-shm-usage`
- Ready pattern do Vite nao pode depender do label `Local:` (ANSI); usar URL + `NO_COLOR=1`

## Quality bar

- `npm run build && npm run test:web-vitals` verde apos calibracao
- Job de CI sobe artifact mesmo em falha (`if: !cancelled()`)
- Docs explicam update de budget em 4 passos
- Sem emojis / aspas curvas / Title Case nos arquivos gerados (convencao tapioca)

## Prior art

Padrao destilado de um gate Vite + React com `@lhci/cli`, `vite preview`, job `web-vitals` e `docs/ci/web-vitals.md`. Esta skill generaliza pra outros stacks sem copiar budgets/rotas de um app.
