import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import type {
  DoctorResult,
  SecretMetadata,
  SecretsGateway,
  SecretValue,
  WriteSecretInput,
} from "../../src/domain/types.js";
import { startUiServer } from "../../src/server/start.js";

class ProductionUiGateway implements SecretsGateway {
  getCalls = 0;

  async doctor(): Promise<DoctorResult> {
    return {
      accountId: "123456789012",
      arn: "arn:aws:iam::123456789012:user/eval",
      profile: "production",
      region: "us-east-1",
      canListSecrets: true,
    };
  }

  async listSecrets(): Promise<SecretMetadata[]> {
    return [
      {
        name: "payments/prod/checkout-api/database-url",
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:database-url",
        tags: {},
      },
    ];
  }

  async getSecret(): Promise<SecretValue> {
    this.getCalls += 1;
    return {
      name: "payments/prod/checkout-api/database-url",
      value: "postgres://production-secret",
      tags: {},
    };
  }

  async createSecret(_input: WriteSecretInput): Promise<SecretMetadata> {
    throw new Error("A UI não pode criar secrets.");
  }

  async putSecretValue(_input: WriteSecretInput): Promise<SecretMetadata> {
    throw new Error("A UI não pode editar secrets.");
  }
}

test("lists, reveals, and copies through the secured production server", async ({
  page,
  context,
}) => {
  const gateway = new ProductionUiGateway();
  const controller = new AbortController();
  let resolveUrl: (url: string) => void = () => undefined;
  const urlReady = new Promise<string>((resolvePromise) => {
    resolveUrl = resolvePromise;
  });
  const server = startUiServer({
    gateway,
    assetsDir: resolve("dist/ui"),
    signal: controller.signal,
    openBrowser: async (url) => resolveUrl(url),
  });

  try {
    const url = await Promise.race([
      urlReady,
      server.then(() => {
        throw new Error("O servidor encerrou antes de abrir a UI.");
      }),
    ]);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(url).origin,
    });
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "database-url" })).toBeVisible();
    await expect(page.locator(".aws-context").getByText("production", { exact: true })).toBeVisible();
    expect(gateway.getCalls).toBe(0);
    await page.getByRole("button", { name: "Revelar por 30s" }).click();
    await expect(page.getByText("postgres://production-secret", { exact: true })).toBeVisible();
    expect(gateway.getCalls).toBe(1);
    await page.getByRole("button", { name: "Copiar" }).click();
    await expect(page.getByText("Secret copiado.", { exact: true })).toBeVisible();
    expect(gateway.getCalls).toBe(2);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "postgres://production-secret",
    );
  } finally {
    controller.abort();
    await server;
  }
});
