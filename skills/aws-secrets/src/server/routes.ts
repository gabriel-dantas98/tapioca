import type { FastifyInstance } from "fastify";

import type { SecretsGateway } from "../domain/types.js";
import { decodeJsonValue } from "../domain/value.js";
import { parseSecretPath, parseSecretPrefix } from "../domain/path.js";

interface RouteOptions {
  gateway: SecretsGateway;
  profile: string;
  region: string;
}

function jsonBase64(tags: Readonly<Record<string, string>>): boolean {
  return (
    tags["tapioca:encoding"] === "base64" &&
    tags["tapioca:content-type"] === "application/json"
  );
}

export function registerRoutes(app: FastifyInstance, options: RouteOptions): void {
  app.get<{ Querystring: { prefix?: string } }>("/api/secrets", async (request) => {
    const prefix = request.query.prefix;
    if (prefix) parseSecretPrefix(prefix);
    const secrets = await options.gateway.listSecrets(prefix);
    return {
      context: { profile: options.profile, region: options.region },
      secrets,
    };
  });

  app.post<{ Body: { path?: string } }>("/api/reveal", async (request) => {
    const path = request.body?.path;
    if (!path) throw new Error("Path obrigatório.");
    parseSecretPath(path);
    const secret = await options.gateway.getSecret(path);
    if (jsonBase64(secret.tags)) {
      return {
        name: secret.name,
        value: secret.value,
        decoded: decodeJsonValue(secret.value),
        format: "json-base64",
      };
    }
    return { name: secret.name, value: secret.value, format: "text" };
  });
}
