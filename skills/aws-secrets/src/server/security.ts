import { timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";

function validToken(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isLoopbackAuthority(value: string | undefined): boolean {
  return value !== undefined && /^127\.0\.0\.1(?::\d+)?$/.test(value);
}

export function registerSecurity(app: FastifyInstance, sessionToken: string): void {
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    if (!validToken(request.headers["x-tapioca-session"] as string | undefined, sessionToken)) {
      await reply.code(401).send({ error: "Sessão local inválida." });
      return;
    }
    if (!isLoopbackAuthority(request.headers.host)) {
      await reply.code(403).send({ error: "Host local inválido." });
      return;
    }
    const origin = request.headers.origin;
    if (origin && !/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) {
      await reply.code(403).send({ error: "Origem local inválida." });
      return;
    }
    const fetchSite = request.headers["sec-fetch-site"];
    if (fetchSite && fetchSite !== "same-origin") {
      await reply.code(403).send({ error: "Contexto de navegação inválido." });
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    return payload;
  });
}
