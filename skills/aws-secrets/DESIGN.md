# Design da filling aws-secrets

## Goal

Oferecer uma experiência de secrets semelhante ao 1Password sem criar um vault paralelo. O AWS Secrets Manager continua sendo a fonte de verdade; `tapioca secrets` organiza acesso, escrita segura, templates e navegação local.

## Scope

- macOS, Node.js 22+ e AWS CLI 2.32+.
- Autenticação por `aws login` e profiles nativos.
- CLI para listar, ler, criar, editar e injetar.
- UI local somente leitura.
- Nenhuma operação de delete.
- Nenhum comando para executar aplicações clientes.

## Addressing

Cada secret usa quatro segmentos:

```text
<domain>/<env>/<product>/<key>
```

Cada path representa um valor `SecretString`. JSON é validado, compactado, codificado em base64 e marcado com:

```text
tapioca:encoding = base64
tapioca:content-type = application/json
```

## Runtime

O pacote TypeScript contém:

- domínio puro para paths, valores e dotenv;
- adapter AWS SDK v3 com `fromLoginCredentials`;
- CLI Commander;
- servidor Fastify preso a `127.0.0.1`;
- UI React/Vite empacotada no mesmo artefato.

CLI, servidor e testes dependem da interface `SecretsGateway`, evitando contas AWS reais nos evals.

## UI

O layout usa três painéis: domains/environments, lista de products/keys e detalhe protegido. Listagem consulta apenas metadata. Reveal e copy fazem um novo `GetSecretValue`; nenhum valor é armazenado em cache.

O servidor usa porta aleatória e token no fragmento da URL. APIs exigem o header `X-Tapioca-Session`, origem loopback, CSP restritiva e `Cache-Control: no-store`.

## File safety

O `.env.template` aceita `secret://<path>` como valor completo. A resolução termina antes da escrita. O destino é criado por arquivo temporário no mesmo diretório, modo `0600` e rename atômico. Um erro preserva o arquivo anterior.

## Permissions

Recomendar menor privilégio: `ListSecrets`, `DescribeSecret` e `GetSecretValue` para leitura; `CreateSecret`, `PutSecretValue` e tags para escrita. O policy sugerido exclui `DeleteSecret`.

## Verification

- Vitest para domínio, AWS mockado, CLI e servidor.
- Playwright para UI e fetch sob demanda.
- Evals token-free para contrato e comportamento.
- Smoke real nos CLIs Claude e Cursor quando autenticados.
