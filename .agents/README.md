# .agents/ — guidance canônica do tapioca

Fonte única de verdade pra qualquer agente que trabalha neste repo. Vendor-neutral: Claude, Cursor, Bugbot e afins apontam pra cá em vez de duplicar política.

## Layout

```text
.agents/
├── constitutions/
│   └── constitution.md          # leis do repo (voz, processo, não-objetivos)
├── rules/
│   ├── marketplace-readiness.md # schemas plugin/marketplace, release, Desktop
│   ├── skills-catalog.md        # comportamento durável por skill
│   └── local-testing.md         # smoke test nos dois CLIs
└── skills/
    └── smoke-test-skills/       # harness de teste local (workflow de dev)
        ├── SKILL.md
        └── run.sh
```

## O que é adapter, o que é canônico

| Arquivo | Papel |
|---|---|
| `.agents/**` | **canônico** — a política mora aqui |
| `AGENTS.md` (raiz) | router fino → aponta pra `.agents/` |
| `CLAUDE.md` (raiz) | adapter Claude fino |
| `.cursor/BUGBOT.md` | adapter de review do Cursor |
| `skills/`, `agents/` (raiz) | **produto** — componentes shippados do plugin, não guidance |

## Onde colocar coisa nova

- Lei do repo → `constitutions/`
- Regra de dev/review → `rules/`
- Workflow de dev reusável → `skills/<nome>/SKILL.md`
- Explicação pra humano → `README.md` (raiz) ou `docs/`
- Componente shippado do plugin → `skills/`/`agents/` na raiz (não aqui)

Não duplique regra entre vendors. Se duas ferramentas precisam da mesma instrução, ela mora uma vez aqui e os adapters apontam.
