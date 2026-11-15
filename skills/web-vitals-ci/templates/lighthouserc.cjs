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
 * Stack notes:
 * - Vite:   startServerCommand below is the default
 * - Next:   'npx next start -H 127.0.0.1 -p 3000' + ready pattern 'Ready'
 * - Static: 'npx serve dist -l 4173' (add SPA fallback if client-routed)
 *
 * Chrome on GitHub Actions (evidence: 3Dantas PR #82):
 * - Playwright Chromium on ubuntu-latest dies with "No usable sandbox!"
 * - Setting ONLY collect.chromeFlags as a string was NOT enough — ChromeLauncher
 *   still launched without --no-sandbox (same FATAL in chrome-err.log).
 * - Belt-and-suspenders below: string + array forms, plus --disable-setuid-sandbox.
 * - If that still fails, switch CHROME_PATH off Playwright Chromium to
 *   google-chrome-stable / puppeteer Chrome (see workflow-job.yml).
 */

const CI_CHROME_FLAGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];

module.exports = {
  ci: {
    collect: {
      // Vite example — change command/port/pattern for other stacks.
      // NO_COLOR=1: Vite otherwise ANSI-colors "Local:" and ready matching flakes in CI.
      startServerCommand:
        'NO_COLOR=1 npm run preview -- --host 127.0.0.1 --port 4173',
      // Match the URL/port, not the "Local:" label (ANSI-safe).
      startServerReadyPattern: 'http://127\\.0\\.0\\.1:4173',
      startServerReadyTimeout: 120000,
      url: [
        // Replace with 2–4 critical, stable routes for THIS app.
        'http://127.0.0.1:4173/',
        // 'http://127.0.0.1:4173/collections',
        // 'http://127.0.0.1:4173/about',
      ],
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH || undefined,
      // LHCI collect-level (string). Do NOT rely on this alone with Playwright Chromium.
      chromeFlags: CI_CHROME_FLAGS.join(' '),
      settings: {
        onlyCategories: ['performance'],
        skipAudits: ['uses-http2', 'bf-cache'],
        // Lighthouse settings often reach ChromeLauncher more reliably as an array.
        chromeFlags: CI_CHROME_FLAGS,
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
