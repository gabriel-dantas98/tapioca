/**
 * Lighthouse CI gate for Core Web Vitals (lab).
 *
 * Metrics:
 * - LCP / CLS: measured directly (mobile + simulated throttling)
 * - INP: not available in LH lab → gate Total Blocking Time (TBT) as proxy
 * - categories:performance: overall regression signal
 *
 * Budgets MUST be calibrated against this repo's preview medians (3 runs)
 * with ~15–25% headroom so the current baseline passes, but further
 * regressions fail. Replace placeholder assertions after the first local run.
 *
 * Update budgets:
 *   1. npm run build && npm run test:web-vitals
 *   2. Inspect medians in the LHCI output / output/lhci reports
 *   3. Adjust assertMatrix below (keep a small safety margin)
 *
 * Stack notes:
 * - Vite:   startServerCommand below is the default
 * - Next:   'npx next start -H 127.0.0.1 -p 3000' + ready pattern 'Ready'
 * - Static: 'npx serve dist -l 4173' (add SPA fallback if client-routed)
 */
module.exports = {
  ci: {
    collect: {
      // Vite example — change command/port/pattern for other stacks.
      // NO_COLOR=1: Vite otherwise ANSI-colors "Local:" and ready matching flakes in CI.
      startServerCommand:
        'NO_COLOR=1 npm run preview -- --host 127.0.0.1 --port 4173',
      // Match the URL, not the "Local:" label (ANSI-safe even if color sneaks back).
      startServerReadyPattern: 'http://127\\.0\\.0\\.1:4173',
      startServerReadyTimeout: 60000,
      url: [
        // Replace with 2–4 critical, stable routes for THIS app.
        'http://127.0.0.1:4173/',
        // 'http://127.0.0.1:4173/collections',
        // 'http://127.0.0.1:4173/about',
      ],
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH || undefined,
      // Required on GitHub Actions when using Playwright Chromium (sandbox /tmpfs).
      chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      settings: {
        onlyCategories: ['performance'],
        skipAudits: ['uses-http2', 'bf-cache'],
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: 'http://127\\.0\\.0\\.1:4173/?$',
          aggregationMethod: 'median-run',
          assertions: {
            // TODO: replace after calibration. Example shape only.
            // Baseline medians (~): score ?, LCP ?ms, CLS ?, TBT ?ms
            'categories:performance': ['error', { minScore: 0.5 }],
            'largest-contentful-paint': ['error', { maxNumericValue: 8000 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.25 }],
            'total-blocking-time': ['error', { maxNumericValue: 500 }],
          },
        },
        // Add one assertMatrix entry per URL (matchingUrlPattern → assertions).
      ],
    },
    upload: {
      target: 'filesystem',
      outputDir: './output/lhci',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%',
    },
  },
};
