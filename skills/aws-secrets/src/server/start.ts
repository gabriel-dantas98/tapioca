import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import open from "open";

import type { SecretsGateway } from "../domain/types.js";
import { buildServer } from "./app.js";

export interface StartUiOptions {
  gateway: SecretsGateway;
  assetsDir?: string;
  signal?: AbortSignal;
  openBrowser?(url: string): Promise<unknown>;
}

export async function startUiServer(options: StartUiOptions): Promise<void> {
  const doctor = await options.gateway.doctor();
  const sessionToken = randomBytes(32).toString("hex");
  const app = buildServer({
    gateway: options.gateway,
    sessionToken,
    profile: doctor.profile,
    region: doctor.region,
  });
  const assetsDir = options.assetsDir ?? join(dirname(fileURLToPath(import.meta.url)), "ui");
  let assetsAvailable = true;
  try {
    await access(assetsDir);
  } catch {
    assetsAvailable = false;
  }
  if (assetsAvailable) {
    await app.register(fastifyStatic, { root: assetsDir, wildcard: false });
  } else {
    app.get("/", async (_request, reply) => {
      await reply.type("text/plain").send("UI não encontrada neste build.");
    });
  }

  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const url = `${address}/#${sessionToken}`;
  try {
    await (options.openBrowser ?? open)(url);

    await new Promise<void>((resolve) => {
      const stop = (): void => resolve();
      if (options.signal?.aborted) resolve();
      else if (options.signal) options.signal.addEventListener("abort", stop, { once: true });
      else {
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      }
    });
  } finally {
    await app.close();
  }
}
