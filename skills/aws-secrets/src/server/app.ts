import fastify, { type FastifyInstance } from "fastify";

import { TapiocaSecretsError } from "../aws/errors.js";
import type { SecretsGateway } from "../domain/types.js";
import { registerRoutes } from "./routes.js";
import { registerSecurity } from "./security.js";

export interface BuildServerOptions {
  gateway: SecretsGateway;
  sessionToken: string;
  profile: string;
  region: string;
}

function statusFor(error: TapiocaSecretsError): number {
  return {
    AUTH_REQUIRED: 401,
    ACCESS_DENIED: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TRANSIENT: 503,
    REGION_REQUIRED: 400,
    BINARY_UNSUPPORTED: 422,
    AWS_ERROR: 502,
  }[error.code];
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = fastify({ logger: false });
  registerSecurity(app, options.sessionToken);
  registerRoutes(app, options);
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof TapiocaSecretsError) {
      const message = error.code === "AUTH_REQUIRED"
        ? `Sessão expirada. Execute: aws login --profile ${options.profile}`
        : {
            ACCESS_DENIED: "Seu profile não tem acesso a este secret.",
            NOT_FOUND: "Secret não encontrado.",
            CONFLICT: "O recurso já existe.",
            TRANSIENT: "A AWS está temporariamente indisponível.",
            REGION_REQUIRED: "Região AWS não configurada.",
            BINARY_UNSUPPORTED: "SecretBinary não é suportado na v1.",
            AWS_ERROR: "A operação na AWS falhou.",
          }[error.code];
      await reply.code(statusFor(error)).send({ error: message, code: error.code });
      return;
    }
    await reply.code(400).send({ error: "A solicitação é inválida." });
  });
  return app;
}
