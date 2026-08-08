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

O formato é imutável durante `edit`: versões JSON continuam JSON e versões texto continuam texto. Conversões exigem um novo path, evitando deixar `AWSCURRENT` e tags divergentes caso uma segunda chamada AWS falhe.

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

O servidor usa porta aleatória e token no fragmento da URL. APIs exigem o header `X-Tapioca-Session`, `Host` loopback, contexto same-origin e, quando enviado pelo browser, `Origin` loopback. CSP restritiva e `Cache-Control: no-store` completam a defesa local.

## File safety

O `.env.template` aceita `secret://<path>` como valor completo. A resolução termina antes da escrita. Valores simples ficam sem aspas; valores sensíveis a comentários, espaços ou expansão são protegidos com aspas simples. Valores sem representação dotenv portátil são rejeitados com orientação para base64.

O destino é criado por arquivo temporário no mesmo diretório e modo `0600`. Sem `--force`, um hard link atômico impede overwrite mesmo se outro processo criar o destino durante o fetch. Com `--force`, rename atômico substitui o arquivo. Um erro preserva o arquivo anterior.

## Permissions

Recomendar menor privilégio: `ListSecrets`, `DescribeSecret` e `GetSecretValue` para leitura; `CreateSecret`, `PutSecretValue` e tags para escrita. O policy sugerido exclui `DeleteSecret`.

## Verification

- Vitest para domínio, AWS mockado, CLI e servidor.
- Playwright para UI e fetch sob demanda.
- Playwright contra o build `dist/ui` e o servidor Fastify real para list, reveal e copy.
- Evals token-free para contrato e comportamento.
- Smoke real nos CLIs Claude e Cursor quando autenticados.
