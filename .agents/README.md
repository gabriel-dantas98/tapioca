# `.agents/` — harness interno do tapioca

Nao e recheio distribuivel. Vive no repo pra padronizar como agents e humanos
desenvolvem o plugin.

```text
.agents/
├── rules/
│   ├── local-testing.md          # contrato oneshot dual-CLI
│   └── marketplace-readiness.md  # schemas plugin/marketplace, release
└── skills/
    └── smoke-test-skills/        # validate + marketplace + oneshot
        ├── SKILL.md
        └── run.sh
```

## Smoke local (fonte unica)

```bash
.agents/skills/smoke-test-skills/run.sh marketplace          # token-free
.agents/skills/smoke-test-skills/run.sh oneshot humanizer-br both
.agents/skills/smoke-test-skills/run.sh oneshot aws-secrets both
.agents/skills/smoke-test-skills/run.sh all humanizer-br both
```

O CI em `.github/workflows/smoke-test.yml` chama o mesmo `run.sh`.
