import { describe, expect, it } from "vitest";

import type { AwsClient } from "../src/aws/gateway.js";
import { AwsSecretsGateway } from "../src/aws/gateway.js";

class FakeClient implements AwsClient {
  readonly commands: unknown[] = [];
  constructor(private readonly responses: Record<string, unknown | Error>) {}

  async send(command: unknown): Promise<unknown> {
    this.commands.push(command);
    const name = command?.constructor.name ?? "Unknown";
    const response = this.responses[name];
    if (response instanceof Error) throw response;
    if (response === undefined) throw new Error(`Unexpected command ${name}`);
    return response;
  }
}

function awsError(name: string, message = name): Error {
  return Object.assign(new Error(message), { name });
}

describe("AwsSecretsGateway", () => {
  it("lists metadata without fetching values", async () => {
    const secrets = new FakeClient({
      ListSecretsCommand: {
        SecretList: [
          {
            Name: "payments/prod/api/token",
            ARN: "arn:token",
            LastChangedDate: new Date("2026-08-01T00:00:00Z"),
            Tags: [{ Key: "team", Value: "payments" }],
          },
          { Name: "payments/production/api/token", ARN: "arn:wrong-environment" },
          { Name: "payments/prod2/api/token", ARN: "arn:wrong-prefix" },
          { Name: "payments/prod/api", ARN: "arn:too-short" },
          { Name: "payments/prod/api/token/extra", ARN: "arn:too-long" },
          { Name: "platform/prod/worker/config", ARN: "arn:config" },
        ],
      },
    });
    const gateway = new AwsSecretsGateway(
      { profile: "production", region: "us-east-1" },
      { secrets, sts: new FakeClient({}) },
    );

    await expect(gateway.listSecrets("payments/prod")).resolves.toEqual([
      {
        name: "payments/prod/api/token",
        arn: "arn:token",
        updatedAt: new Date("2026-08-01T00:00:00Z"),
        tags: { team: "payments" },
      },
    ]);
    expect(secrets.commands.map((command) => command?.constructor.name)).toEqual([
      "ListSecretsCommand",
    ]);
  });

  it("gets AWSCURRENT and metadata", async () => {
    const secrets = new FakeClient({
      GetSecretValueCommand: {
        Name: "platform/prod/worker/config",
        ARN: "arn:config",
        SecretString: "eyJvayI6dHJ1ZX0=",
        VersionId: "version-1",
        CreatedDate: new Date("2026-08-02T00:00:00Z"),
      },
      DescribeSecretCommand: {
        Description: "Worker config",
        Tags: [
          { Key: "tapioca:encoding", Value: "base64" },
          { Key: "tapioca:content-type", Value: "application/json" },
        ],
      },
    });
    const gateway = new AwsSecretsGateway(
      { profile: "production", region: "us-east-1" },
      { secrets, sts: new FakeClient({}) },
    );

    await expect(gateway.getSecret("platform/prod/worker/config")).resolves.toMatchObject({
      name: "platform/prod/worker/config",
      value: "eyJvayI6dHJ1ZX0=",
      versionId: "version-1",
      description: "Worker config",
      tags: {
        "tapioca:content-type": "application/json",
        "tapioca:encoding": "base64",
      },
    });
    expect(
      (secrets.commands[0] as { input: { VersionStage: string } }).input.VersionStage,
    ).toBe("AWSCURRENT");
  });

  it("creates a secret without implicit upsert", async () => {
    const secrets = new FakeClient({
      CreateSecretCommand: awsError("ResourceExistsException"),
    });
    const gateway = new AwsSecretsGateway(
      { profile: "production", region: "us-east-1" },
      { secrets, sts: new FakeClient({}) },
    );

    await expect(
      gateway.createSecret({ name: "payments/prod/api/token", value: "x", tags: {} }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("edits by creating a new AWSCURRENT version", async () => {
    const secrets = new FakeClient({
      PutSecretValueCommand: {
        ARN: "arn:token",
        Name: "payments/prod/api/token",
        VersionId: "version-2",
      },
    });
    const gateway = new AwsSecretsGateway(
      { profile: "production", region: "us-east-1" },
      { secrets, sts: new FakeClient({}) },
    );

    await expect(
      gateway.putSecretValue({
        name: "payments/prod/api/token",
        value: "new-value",
        tags: {},
      }),
    ).resolves.toMatchObject({ name: "payments/prod/api/token", arn: "arn:token" });
    expect(
      (secrets.commands[0] as { input: { VersionStages: string[] } }).input.VersionStages,
    ).toEqual(["AWSCURRENT"]);
  });

  it("does not perform a non-atomic tag mutation while editing JSON", async () => {
    const secrets = new FakeClient({
      PutSecretValueCommand: {
        ARN: "arn:config",
        Name: "platform/prod/worker/config",
        VersionId: "version-2",
      },
    });
    const gateway = new AwsSecretsGateway(
      { profile: "production", region: "us-east-1" },
      { secrets, sts: new FakeClient({}) },
    );

    await expect(
      gateway.putSecretValue({
        name: "platform/prod/worker/config",
        value: "eyJlbmFibGVkIjp0cnVlfQ==",
        tags: {
          "tapioca:encoding": "base64",
          "tapioca:content-type": "application/json",
        },
      }),
    ).resolves.toMatchObject({ name: "platform/prod/worker/config" });
    expect(secrets.commands.map((command) => command?.constructor.name)).toEqual([
      "PutSecretValueCommand",
    ]);
  });

  it("reports identity and list capability in doctor", async () => {
    const gateway = new AwsSecretsGateway(
      { profile: "production", region: "us-east-1" },
      {
        secrets: new FakeClient({ ListSecretsCommand: { SecretList: [] } }),
        sts: new FakeClient({
          GetCallerIdentityCommand: {
            Account: "123456789012",
            Arn: "arn:aws:iam::123456789012:user/gabriel",
          },
        }),
      },
    );
    await expect(gateway.doctor()).resolves.toEqual({
      accountId: "123456789012",
      arn: "arn:aws:iam::123456789012:user/gabriel",
      profile: "production",
      region: "us-east-1",
      canListSecrets: true,
    });
  });

  it.each([
    ["AccessDeniedException", "ACCESS_DENIED"],
    ["ExpiredTokenException", "AUTH_REQUIRED"],
    ["ResourceNotFoundException", "NOT_FOUND"],
    ["ThrottlingException", "TRANSIENT"],
  ])("normalizes %s", async (awsName, code) => {
    const gateway = new AwsSecretsGateway(
      { profile: "production", region: "us-east-1" },
      {
        secrets: new FakeClient({ GetSecretValueCommand: awsError(awsName) }),
        sts: new FakeClient({}),
      },
    );
    await expect(gateway.getSecret("payments/prod/api/token")).rejects.toMatchObject({ code });
  });
});
