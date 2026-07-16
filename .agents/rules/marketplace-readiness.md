# Regra: prontidao de marketplace

Fatos verificados contra os schemas oficiais (Anthropic `claude-code/marketplace.schema.json`, Cursor `cursor.com/schemas/cursor-plugin/*`). Nao inferir — seguir.

## Plugin vs. marketplace

- **Plugin** = `.claude-plugin/plugin.json` (ou `.cursor-plugin/plugin.json`) + `skills/`/`agents/`. Instalavel so via `--plugin-dir` (dev) ou dependencia.
- **Marketplace** = `marketplace.json` que indexa um ou mais plugins. E o que habilita `/plugin marketplace add owner/repo`.

tapioca e **single-plugin na raiz** que tambem se expoe como marketplace via self-source.

## Claude Code — `.claude-plugin/marketplace.json`

- Obrigatorios: `name`, `plugins[]`. Cada entry: `name` + `source`.
- Single-plugin na raiz: `"source": "./"`.
- O `plugin.json` na raiz **nao** declara `skills`/`agents` (auto-discovery). A entry do marketplace **nao** declara componentes — senao da `conflicting manifests`.
- Teste local: `claude plugin marketplace add ./` (nao `.`) depois `claude plugin install tapioca@tapioca`.

## Cursor — `.cursor-plugin/marketplace.json` + `plugin.json`

- `marketplace.json`: `name` + `plugins[]` (cada um `name` + `source`).
- Diferente do Claude: o `plugin.json` do Cursor **declara explicito** `"skills": "./skills/"` e `"agents": "./agents/"`.
- Teste local: `ln -sfn "$(pwd)" ~/.cursor/plugins/local/tapioca` + Reload Window ([docs](https://cursor.com/docs/plugins)). CLI: `cursor-agent --plugin-dir .`.

## Validacao e release

- `claude plugin validate .` faz check estrutural/schema sem chamar API. Erros imprimem `✘`.
- Marketplace puxa da **branch default (`main`)** por padrao. Trabalho em feature branch nao aparece no `marketplace add owner/repo` ate mergear.
- Harness: `.agents/skills/smoke-test-skills/run.sh marketplace`.
