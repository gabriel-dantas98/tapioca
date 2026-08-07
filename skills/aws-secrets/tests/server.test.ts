import { afterEach, describe, expect, it } from "vitest";

import type {
  DoctorResult,
  SecretMetadata,
  SecretsGateway,
  SecretValue,
  WriteSecretInput,
} from "../src/domain/types.js";
import { TapiocaSecretsError } from "../src/aws/errors.js";
import { buildServer } from "../src/server/app.js";
import { startUiServer } from "../src/server/start.js";

class ReadOnlyGateway implements SecretsGateway {
  getCalls = 0;
  failure?: Error;
  readonly metadata: SecretMetadata[] = [
    {
      name: "payments/prod/api/token",
      arn: "arn:token",
      updatedAt: new Date("2026-08-01T00:00:00Z"),
      tags: {},
    },
    {
      name: "platform/prod/worker/config",
      arn: "arn:config",
      tags: {
        "tapioca:encoding": "base64",
        "tapioca:content-type": "application/json",
      },
    },
  ];

  async doctor(): Promise<DoctorResult> {
    return {
      accountId: "123456789012",
      arn: "arn:aws:iam::123456789012:user/gabriel",
      profile: "production",
      region: "us-east-1",
      canListSecrets: true,
    };
  }

  async listSecrets(prefix?: string): Promise<SecretMetadata[]> {
    return this.metadata.filter((item) => !prefix || item.name.startsWith(prefix));
  }

  async getSecret(path: string): Promise<SecretValue> {
    this.getCalls += 1;
    if (this.failure) throw this.failure;
    if (path === "platform/prod/worker/config") {
      return {
        ...this.metadata[1]!,
        value: Buffer.from('{"enabled":true}').toString("base64"),
      };
    }
    return { ...this.metadata[0]!, value: "super-secret" };
  }

  async createSecret(_input: WriteSecretInput): Promise<SecretMetadata> {
    throw new Error("UI must never create");
  }

  async putSecretValue(_input: WriteSecretInput): Promise<SecretMetadata> {
    throw new Error("UI must never edit");
  }
}

const apps: Array<ReturnType<typeof buildServer>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup(): { app: ReturnType<typeof buildServer>; gateway: ReadOnlyGateway } {
  const gateway = new ReadOnlyGateway();
  const app = buildServer({
    gateway,
    sessionToken: "session-token",
    profile: "production",
    region: "us-east-1",
  });
  apps.push(app);
  return { app, gateway };
}

const authorizedHeaders = {
  origin: "http://127.0.0.1:54321",
  "x-tapioca-session": "session-token",
};

describe("local secrets API", () => {
  it("rejects missing tokens and unexpected origins", async () => {
    const { app } = setup();
    const missing = await app.inject({ method: "GET", url: "/api/secrets" });
    expect(missing.statusCode).toBe(401);

    const foreign = await app.inject({
      method: "GET",
      url: "/api/secrets",
      headers: { ...authorizedHeaders, origin: "https://evil.example" },
    });
    expect(foreign.statusCode).toBe(403);
  });

  it("lists metadata without fetching values", async () => {
    const { app, gateway } = setup();
    const response = await app.inject({
      method: "GET",
      url: "/api/secrets?prefix=payments/prod",
      headers: authorizedHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.json()).toEqual({
      context: { profile: "production", region: "us-east-1" },
      secrets: [
        {
          name: "payments/prod/api/token",
          arn: "arn:token",
          updatedAt: "2026-08-01T00:00:00.000Z",
          tags: {},
        },
      ],
    });
    expect(gateway.getCalls).toBe(0);
  });

  it("fetches every reveal and returns decoded JSON beside raw base64", async () => {
    const { app, gateway } = setup();
    const request = {
      method: "POST" as const,
      url: "/api/reveal",
      headers: authorizedHeaders,
      payload: { path: "platform/prod/worker/config" },
    };
    const first = await app.inject(request);
    const second = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      name: "platform/prod/worker/config",
      value: "eyJlbmFibGVkIjp0cnVlfQ==",
      decoded: { enabled: true },
      format: "json-base64",
    });
    expect(second.statusCode).toBe(200);
    expect(gateway.getCalls).toBe(2);
  });

  it("has no mutation routes", async () => {
    const { app } = setup();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url: "/api/secrets/payments%2Fprod%2Fapi%2Ftoken",
        headers: authorizedHeaders,
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it("redacts AWS error details and returns an actionable login command", async () => {
    const { app, gateway } = setup();
    gateway.failure = new TapiocaSecretsError(
      "AUTH_REQUIRED",
      "expired super-secret internal detail",
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/reveal",
      headers: authorizedHeaders,
      payload: { path: "payments/prod/api/token" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).toContain("aws login --profile production");
    expect(response.body).not.toContain("super-secret");
  });

  it("binds loopback on a random port and puts the session token in the fragment", async () => {
    const gateway = new ReadOnlyGateway();
    const controller = new AbortController();
    let openedUrl = "";
    await startUiServer({
      gateway,
      signal: controller.signal,
      openBrowser: async (url) => {
        openedUrl = url;
        controller.abort();
      },
    });
    expect(openedUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#\w+$/);
    expect(openedUrl).not.toContain("?key=");
  });
});
