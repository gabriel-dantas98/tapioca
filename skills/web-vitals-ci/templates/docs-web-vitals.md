# Web Vitals CI gate

Lab regression gate for Core Web Vitals. Runs Lighthouse CI against a local production-like preview (not production) so PRs fail when LCP / CLS / TBT (INP proxy) or the performance score regress past calibrated budgets.

## Pages

| URL | Why |
|---|---|
| `/` | Homepage (primary CWV surface) |
| `<!-- /path -->` | <!-- critical browse / secondary canary — fill in --> |

Skip heavy detail routes, auth walls, and CMS-dependent pages until they are stable in CI.

## Metrics and thresholds

Budgets live in [`lighthouserc.cjs`](../../lighthouserc.cjs) (`assert.assertMatrix`, per URL).

| Metric | Role |
|---|---|
| **LCP** | Largest Contentful Paint |
| **CLS** | Cumulative Layout Shift |
| **TBT** | Total Blocking Time — lab proxy for **INP** (INP is not reliably available in Lighthouse lab) |
| **Performance score** | Overall category score |

Values are **mobile + simulated throttling**, median of 3 runs. They are calibrated so the current preview baseline passes with ~15–25% headroom — not Google "good" field targets.

## Run locally

```bash
npm run build
npm run test:web-vitals
```

Optional: point at a specific Chrome binary:

```bash
CHROME_PATH=/path/to/chrome npm run test:web-vitals
```

Reports: `.lighthouseci/` (working) and `output/lhci/` (filesystem upload). Both should be gitignored.

## Update budgets

1. `npm run build && npm run test:web-vitals`
2. Read median LCP / CLS / TBT / score from the LHCI output
3. Edit `assertMatrix` in `lighthouserc.cjs` — keep a small safety margin so normal CI noise does not flake
4. Re-run `npm run test:web-vitals` and confirm green

Tighten toward field "good" targets (LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms) only after real performance work improves the baseline.

## CI

GitHub Actions job `web-vitals` runs on PRs and the default branch: install → build → Chromium → `npm run test:web-vitals`.

### CI gotchas

- **Playwright Chromium + sandbox:** on `ubuntu-latest`, ChromeLauncher dies with `No usable sandbox!`. Setting **only** `collect.chromeFlags` as a string has failed in the wild — the process still launched without `--no-sandbox`. Use the template pattern: string on `collect.chromeFlags` **and** array on `collect.settings.chromeFlags`, including `--disable-setuid-sandbox`. If the log still shows `No usable sandbox!`, point `CHROME_PATH` at `google-chrome-stable` / Puppeteer Chrome instead of Playwright Chromium.
- **Vite ready matching:** do not match `Local:` — Vite ANSI-colors that label and LHCI can time out waiting for the server. Prefer `NO_COLOR=1` on the preview command and a ready pattern on the listen URL/port (e.g. `http://127\\.0\\.0\\.1:4173` or `4173`).
