#!/usr/bin/env bash
# Validação estrutural token-free do plugin (manifests, skills, fixtures).
# Fonte única: CI e run.sh marketplace (ver .agents/rules/local-testing.md).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v jq >/dev/null 2>&1 || { echo "jq não encontrado" >&2; exit 1; }

echo "== plugin.json =="
jq -e '.name == "tapioca" and (.version | length > 0)' .claude-plugin/plugin.json
echo "plugin.json OK"

echo "== marketplace manifests =="
jq -e '.name == "tapioca" and (.plugins | length > 0) and (.plugins[0].source == "./")' .claude-plugin/marketplace.json
jq -e '.name == "tapioca" and (.plugins | length > 0) and (.plugins[0].source == "./")' .cursor-plugin/marketplace.json
jq -e '.skills == "./skills/" and .agents == "./agents/"' .cursor-plugin/plugin.json
echo "marketplace manifests OK"

echo "== skill frontmatter =="
for skill in humanizer-br usabilidade-br multi-gen google-sheets-apps-script web-vitals-ci; do
  test -f "skills/$skill/SKILL.md"
  head -1 "skills/$skill/SKILL.md" | grep -q '^---$'
  grep -q "^name: $skill$" "skills/$skill/SKILL.md"
  grep -q '^description:' "skills/$skill/SKILL.md"
done

echo "== agent frontmatter =="
for agent in humanizer-br usabilidade-br; do
  test -f "agents/$agent.md"
  head -1 "agents/$agent.md" | grep -q '^---$'
done

echo "== usabilidade-br fixtures =="
test -f tests/fixtures/usabilidade-br/bad-page.html
test -f tests/fixtures/usabilidade-br/expected-violations.md

echo "== multi-gen present =="
test -f skills/multi-gen/run_engines.py
test -f skills/multi-gen/build_preview.py
test -f skills/multi-gen/DESIGN.md
test -f skills/multi-gen/tests/smoke_test.py

echo "== google-sheets-apps-script present =="
test -f skills/google-sheets-apps-script/scripts/sheets_agent.py
test -f skills/google-sheets-apps-script/templates/Code.gs
test -f skills/google-sheets-apps-script/DESIGN.md
test -f skills/google-sheets-apps-script/evals/run_static.py

echo "== web-vitals-ci present =="
test -f skills/web-vitals-ci/DESIGN.md
test -f skills/web-vitals-ci/templates/lighthouserc.cjs
test -f skills/web-vitals-ci/templates/workflow-job.yml
test -f skills/web-vitals-ci/templates/docs-web-vitals.md
test -f skills/web-vitals-ci/templates/package-scripts.json
test -f skills/web-vitals-ci/templates/gitignore-snippet.txt
grep -q 'total-blocking-time' skills/web-vitals-ci/templates/lighthouserc.cjs
grep -q 'test:web-vitals' skills/web-vitals-ci/SKILL.md
grep -q -- '--no-sandbox' skills/web-vitals-ci/templates/lighthouserc.cjs
grep -q -- '--disable-setuid-sandbox' skills/web-vitals-ci/templates/lighthouserc.cjs
grep -q -- '--disable-dev-shm-usage' skills/web-vitals-ci/templates/lighthouserc.cjs
grep -q 'NO_COLOR=1' skills/web-vitals-ci/templates/lighthouserc.cjs
grep -q 'http://127' skills/web-vitals-ci/templates/lighthouserc.cjs
grep -q 'settings.chromeFlags' skills/web-vitals-ci/SKILL.md
grep -q 'node-runner.js' skills/web-vitals-ci/SKILL.md
grep -q 'No usable sandbox' skills/web-vitals-ci/SKILL.md
grep -q 'NO_COLOR' skills/web-vitals-ci/SKILL.md
node -e "const c=require('./skills/web-vitals-ci/templates/lighthouserc.cjs'); if(!c.ci.collect.settings.chromeFlags) process.exit(1); if(c.ci.collect.chromeFlags) { console.error('top-level collect.chromeFlags should be omitted (NodeRunner ignores it)'); process.exit(1); }"

echo "validate-plugin-structure: OK"