import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TapiocaSecretsError } from "../src/aws/errors.js";
import type {
  DoctorResult,
  SecretMetadata,
  SecretsGateway,
  SecretValue,
  WriteSecretInput,
} from "../src/domain/types.js";
import type { CliDependencies } from "../src/cli/program.js";
import { createProgram, runCli } from "../src/cli/program.js";

const cleanup: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

class FakeGateway implements SecretsGateway {
  readonly created: WriteSecretInput[] = [];
  readonly edited: WriteSecretInput[] = [];
  values = new Map<string, SecretValue>();
  failure?: Error;

  async doctor(): Promise<DoctorResult> {
    if (this.failure) throw this.failure;
    return {
      accountId: "123456789012",
      arn: "arn:aws:iam::123456789012:user/gabriel",
      profile: "production",
      region: "us-east-1",
      canListSecrets: true,
    };
  }

  async listSecrets(): Promise<SecretMetadata[]> {
    if (this.failure) throw this.failure;
    return [...this.values.values()];
  }

  async getSecret(path: string): Promise<SecretValue> {
    if (this.failure) throw this.failure;
    const value = this.values.get(path);
    if (!value) throw new TapiocaSecretsError("NOT_FOUND", "Secret não encontrado.");
    return value;
  }

  async createSecret(input: WriteSecretInput): Promise<SecretMetadata> {
    this.created.push(input);
    return { name: input.name, tags: input.tags };
  }

  async putSecretValue(input: WriteSecretInput): Promise<SecretMetadata> {
    this.edited.push(input);
    return { name: input.name, tags: input.tags };
  }
}

function harness(gateway = new FakeGateway(), stdin = ""): {
  dependencies: CliDependencies;
  gateway: FakeGateway;
  stdout: string[];
  stderr: string[];
  copied: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const copied: string[] = [];
  return {
    gateway,
    stdout,
    stderr,
    copied,
    dependencies: {
      gatewayFor: async () => gateway,
      io: {
        writeOut: (value) => stdout.push(value),
        writeError: (value) => stderr.push(value),
        readStdin: async () => stdin,
        promptSecret: async () => "prompt-value",
        copy: async (value) => {
          copied.push(value);
        },
      },
      isIgnored: async () => true,
      startUi: async () => undefined,
    },
  };
}

describe("tapioca secrets CLI", () => {
  it("advertises only the approved commands", () => {
    const { dependencies } = harness();
    const help = createProgram(dependencies).helpInformation();
    expect(help).toContain("secrets");
    const secrets = createProgram(dependencies).commands.find((command) => command.name() === "secrets");
    const commandNames = secrets?.commands.map((command) => command.name());
    expect(commandNames).toEqual(["doctor", "list", "get", "create", "edit", "inject", "ui"]);
    expect(help).not.toContain("delete");
    expect(help).not.toContain("run");
  });

  it.each(["delete", "run"])("rejects the forbidden %s command without exiting the process", async (command) => {
    const state = harness();
    await expect(runCli(["node", "tapioca", "secrets", command], state.dependencies)).resolves.not.toBe(0);
    expect(state.stderr.join("\n")).toContain(`unknown command '${command}'`);
  });

  it("prints doctor identity without secrets", async () => {
    const state = harness();
    await expect(
      runCli(["node", "tapioca", "secrets", "doctor", "--profile", "production"], state.dependencies),
    ).resolves.toBe(0);
    expect(state.stdout.join("\n")).toContain("123456789012");
    expect(state.stdout.join("\n")).toContain("production");
    expect(state.stderr).toEqual([]);
  });

  it("gets a value to stdout or clipboard", async () => {
    const state = harness();
    state.gateway.values.set("payments/prod/api/token", {
      name: "payments/prod/api/token",
      value: "super-secret",
      tags: {},
    });
    await runCli(
      ["node", "tapioca", "secrets", "get", "payments/prod/api/token"],
      state.dependencies,
    );
    expect(state.stdout).toEqual(["super-secret"]);

    state.stdout.length = 0;
    await runCli(
      ["node", "tapioca", "secrets", "get", "payments/prod/api/token", "--copy"],
      state.dependencies,
    );
    expect(state.stdout.join("\n")).not.toContain("super-secret");
    expect(state.copied).toEqual(["super-secret"]);
  });

  it("creates validated JSON from stdin without exposing it", async () => {
    const state = harness(new FakeGateway(), '{"z":1,"a":true}');
    const code = await runCli(
      [
        "node",
        "tapioca",
        "secrets",
        "create",
        "platform/prod/worker/config",
        "--stdin",
        "--json",
      ],
      state.dependencies,
    );
    expect(code).toBe(0);
    expect(Buffer.from(state.gateway.created[0]?.value ?? "", "base64").toString("utf8")).toBe(
      '{"a":true,"z":1}',
    );
    expect(state.gateway.created[0]?.tags).toMatchObject({
      "tapioca:encoding": "base64",
    });
    expect(state.stdout.join("\n")).not.toContain("eyJ");
  });

  it("preserves JSON encoding during edit", async () => {
    const state = harness(new FakeGateway(), '{"enabled":false}');
    state.gateway.values.set("platform/prod/worker/config", {
      name: "platform/prod/worker/config",
      value: "eyJlbmFibGVkIjp0cnVlfQ==",
      tags: {
        "tapioca:encoding": "base64",
        "tapioca:content-type": "application/json",
      },
    });
    await runCli(
      ["node", "tapioca", "secrets", "edit", "platform/prod/worker/config", "--stdin"],
      state.dependencies,
    );
    expect(Buffer.from(state.gateway.edited[0]?.value ?? "", "base64").toString("utf8")).toBe(
      '{"enabled":false}',
    );
    expect(state.gateway.edited[0]?.tags).toMatchObject({
      "tapioca:content-type": "application/json",
    });
  });

  it("injects a template through the real atomic writer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tapioca-cli-"));
    cleanup.push(directory);
    const template = join(directory, ".env.template");
    const output = join(directory, ".env");
    await writeFile(template, "TOKEN=secret://payments/prod/api/token\n", "utf8");
    const state = harness();
    state.gateway.values.set("payments/prod/api/token", {
      name: "payments/prod/api/token",
      value: "resolved",
      tags: {},
    });
    await expect(
      runCli(
        ["node", "tapioca", "secrets", "inject", template, "--output", output],
        state.dependencies,
      ),
    ).resolves.toBe(0);
    await expect((await import("node:fs/promises")).readFile(output, "utf8")).resolves.toBe(
      "TOKEN=resolved\n",
    );
  });

  it("maps actionable errors to stable exit codes without leaking values", async () => {
    const gateway = new FakeGateway();
    gateway.failure = new TapiocaSecretsError(
      "AUTH_REQUIRED",
      "Sessão expirada; execute aws login --profile production.",
    );
    const state = harness(gateway);
    await expect(
      runCli(["node", "tapioca", "secrets", "doctor"], state.dependencies),
    ).resolves.toBe(3);
    expect(state.stderr.join("\n")).toContain("aws login --profile production");
    expect(state.stderr.join("\n")).not.toContain("super-secret");
  });
});
