---
name: aws-secrets
description: Use when the user mentions AWS Secrets Manager, aws login, secret paths, .env.template, a local secrets UI, or a 1Password-like workflow for AWS secrets.
---

# AWS secrets

Usar o AWS Secrets Manager como fonte de verdade por meio da CLI `tapioca secrets` e de uma UI local somente leitura.

## Preparar

Resolver `SKILL_ROOT` como o diretório deste `SKILL.md`. Quando `tapioca` não estiver no PATH, executar:

```bash
bash "$SKILL_ROOT/scripts/bootstrap.sh"
```

Autenticar e validar:

```bash
aws login [--profile production]
tapioca secrets doctor [--profile production]
```

## Usar paths

Exigir exatamente:

```text
<domain>/<env>/<product>/<key>
```

Usar segmentos `kebab-case` ASCII, por exemplo `payments/prod/checkout-api/database-url`.

## Operar

```bash
tapioca secrets list [payments/prod]
tapioca secrets get <path> --copy
tapioca secrets create <path> --stdin
tapioca secrets create <path> --from-file config.json --json
tapioca secrets edit <path> --stdin
tapioca secrets inject .env.template --output .env
tapioca secrets ui
```

Usar `--profile` e `--region` quando o contexto padrão não for suficiente. Consultar `tapioca secrets <comando> --help` para flags adicionais.

## Resolver templates

Aceitar referências apenas como valor completo:

```dotenv
DATABASE_URL=secret://payments/prod/checkout-api/database-url
SERVICE_CONFIG=secret://platform/prod/worker/service-config
```

O `inject` resolve tudo antes de gravar, exige destino ignorado pelo Git e cria o arquivo com modo `0600`.
Valores sensíveis a parsers dotenv são colocados entre aspas simples. Se um valor não tiver representação portátil, orientar o usuário a armazená-lo em base64; nunca gerar um `.env` semanticamente diferente.

## Tratar JSON

Usar `--json` na criação para validar, compactar e armazenar JSON em base64. A UI revela JSON decodificado e copia o base64 original por padrão.
Durante `edit`, preservar o formato existente. Para converter texto em JSON, criar outro path; não tentar trocar valor e tags em duas operações AWS não atômicas.

## Proteger valores

- Nunca passar secret como argumento do shell; usar prompt oculto, stdin ou arquivo.
- Nunca executar `get` sem `--copy` por uma ferramenta de agente, pois stdout entra no histórico da sessão.
- Não imprimir conteúdo de `.env`, arquivos de origem ou respostas de reveal.
- Não adicionar comando de execução de clientes; cada aplicação carrega seu próprio `.env`.
- Não criar, editar ou excluir pela UI.
- Não oferecer delete na CLI. Direcionar exclusões ao console AWS.
