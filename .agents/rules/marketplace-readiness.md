# Regra: prontidão de marketplace

Fatos verificados contra os schemas oficiais (Anthropic `claude-code/marketplace.schema.json`, Cursor `cursor.com/schemas/cursor-plugin/*`). Não inferir — seguir.

## Plugin vs. marketplace

- **Plugin** = `.claude-plugin/plugin.json` (ou `.cursor-plugin/plugin.json`) + `skills/`/`agents/`. Instalável só via `--plugin-dir` (dev) ou dependência.
- **Marketplace** = `marketplace.json` que indexa um ou mais plugins. É o que habilita `/plugin marketplace add owner/repo`.

tapioca é **single-plugin na raiz** que também se expõe como marketplace via self-source.

## Claude Code — `.claude-plugin/marketplace.json`

- Obrigatórios: `name`, `plugins[]`. Cada entry: `name` + `source`.
- Single-plugin na raiz: `"source": "./"`.
- O `plugin.json` na raiz **não** declara `skills`/`agents` (auto-discovery). A entry do marketplace **não** declara componentes — senão dá `conflicting manifests`.

## Cursor — `.cursor-plugin/marketplace.json` + `plugin.json`

- `marketplace.json`: `name` + `plugins[]` (cada um `name` + `source`).
- Diferente do Claude: o `plugin.json` do Cursor **declara explícito** `"skills": "./skills/"` e `"agents": "./agents/"`. Os plugins de referência do Cursor fazem isso; sem isso, risco de não descobrir.

## Validação e release

- `claude plugin validate .` faz check estrutural/schema sem chamar API. Erros imprimem `✘`. Warning de `CLAUDE.md` no root é informativo (não é carregado como contexto de plugin).
- Marketplace puxa da **branch default (`main`)** por padrão. Trabalho em feature branch não aparece no `marketplace add` até mergear. Taggear release (ex.: `v0.2.0`).

## Claude Desktop é caminho separado

Desktop **não consome plugin nem marketplace** — é feature do Claude Code. Pro Desktop, empacotar skill avulsa (pasta/zip com `SKILL.md`) via Settings → Capabilities → Skills. Agents e namespace `/tapioca:*` não existem no Desktop. Das skills atuais, só `humanizer-br` é portável (as outras dependem de CLIs e Chrome MCP).
