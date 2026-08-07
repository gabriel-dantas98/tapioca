#!/usr/bin/env -S npx tsx
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TapiocaSecretsError } from "../src/aws/errors.js";
import { runCli, type CliDependencies } from "../src/cli/program.js";
import type { CliIo } from "../src/cli/io.js";
import type {
  DoctorResult,
  SecretMetadata,
  SecretsGateway,
  SecretValue,
  WriteSecretInput,
} from "../src/domain/types.js";

interface EvalResult {
  id: string;
  ok: boolean;
  error?: string;
}

class FakeGateway implements SecretsGateway {
  readonly created: WriteSecretInput[] = [];
  readonly values = new Map<string, SecretValue>();

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
    return [...this.values.values()];
  }

  async getSecret(path: string): Promise<SecretValue> {
    const value = this.values.get(path);
    if (!value) throw new TapiocaSecretsError("NOT_FOUND", "Secret não encontrado.");
    return value;
  }

  async createSecret(input: WriteSecretInput): Promise<SecretMetadata> {
    this.created.push(input);
    return { name: input.name, tags: input.tags };
  }

  async putSecretValue(input: WriteSecretInput): Promise<SecretMetadata> {
    return { name: input.name, tags: input.tags };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function harness(overrides: Partial<CliDependencies> = {}): {
  dependencies: CliDependencies;
  gateway: FakeGateway;
  out: string[];
  errors: string[];
  uiStarts: { count: number };
  gatewayCalls: { count: number };
} {
  const gateway = new FakeGateway();
  const out: string[] = [];
  const errors: string[] = [];
  const uiStarts = { count: 0 };
  const gatewayCalls = { count: 0 };
  const io: CliIo = {
    writeOut: (value) => out.push(value),
    writeError: (value) => errors.push(value),
    readStdin: async () => "",
    promptSecret: async () => "",
    copy: async () => undefined,
  };
  return {
    gateway,
    out,
    errors,
    uiStarts,
    gatewayCalls,
    dependencies: {
      gatewayFor: async () => {
        gatewayCalls.count += 1;
        return gateway;
      },
      io,
      isIgnored: async () => true,
      startUi: async () => {
        uiStarts.count += 1;
      },
      ...overrides,
    },
  };
}

const results: EvalResult[] = [];
async function evaluate(id: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    results.push({ id, ok: true });
  } catch (error) {
    results.push({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

await evaluate("doctor-after-aws-login", async () => {
  const test = harness();
  const code = await runCli(["node", "tapioca", "secrets", "doctor", "--profile", "production"], test.dependencies);
  assert(code === 0, `exit inesperado: ${code}`);
  assert(test.out.some((line) => line.includes("123456789012")), "conta ausente");
  assert(test.out.some((line) => line.includes("production")), "profile ausente");
});

await evaluate("reject-invalid-path", async () => {
  const test = harness();
  const code = await runCli(["node", "tapioca", "secrets", "get", "payments/prod/key"], test.dependencies);
  assert(code !== 0, "path inválido foi aceito");
  assert(test.gatewayCalls.count === 0, "gateway foi criado antes da validação");
});

await evaluate("inject-template", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tapioca-aws-secrets-eval-"));
  try {
    const template = join(dir, ".env.template");
    const output = join(dir, ".env");
    const path = "payments/prod/checkout-api/database-url";
    await writeFile(template, `DATABASE_URL=secret://${path}\nSTATIC=yes\n`, "utf8");
    const test = harness();
    test.gateway.values.set(path, { name: path, value: "postgres://eval", tags: {} });
    const code = await runCli(
      ["node", "tapioca", "secrets", "inject", template, "--output", output],
      test.dependencies,
    );
    assert(code === 0, `exit inesperado: ${code}`);
    assert((await readFile(output, "utf8")) === "DATABASE_URL=postgres://eval\nSTATIC=yes\n", "dotenv incorreto");
    assert(((await stat(output)).mode & 0o777) === 0o600, "modo do dotenv não é 0600");
    assert(!test.out.join("\n").includes("postgres://eval"), "secret vazou no stdout");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

await evaluate("create-json-base64", async () => {
  const test = harness();
  test.dependencies.io.readStdin = async () => '{ "enabled": true }\n';
  const code = await runCli(
    ["node", "tapioca", "secrets", "create", "platform/prod/worker/service-config", "--stdin", "--json"],
    test.dependencies,
  );
  assert(code === 0, `exit inesperado: ${code}`);
  const created = test.gateway.created[0];
  assert(created !== undefined, "secret não criado");
  assert(Buffer.from(created.value, "base64").toString("utf8") === '{"enabled":true}', "base64 incorreto");
  assert(created.tags["tapioca:encoding"] === "base64", "tag encoding ausente");
  assert(created.tags["tapioca:content-type"] === "application/json", "tag content-type ausente");
});

await evaluate("open-read-only-ui", async () => {
  const test = harness();
  const code = await runCli(["node", "tapioca", "secrets", "ui"], test.dependencies);
  assert(code === 0, `exit inesperado: ${code}`);
  assert(test.uiStarts.count === 1, "UI não iniciou exatamente uma vez");
  assert(test.gateway.values.size === 0, "UI command buscou valor antecipadamente");
});

await evaluate("expired-login", async () => {
  const test = harness({
    gatewayFor: async () => {
      throw new TapiocaSecretsError(
        "AUTH_REQUIRED",
        "Sessão AWS ausente ou expirada. Execute aws login novamente.",
      );
    },
  });
  const code = await runCli(["node", "tapioca", "secrets", "doctor"], test.dependencies);
  assert(code === 3, `exit inesperado: ${code}`);
  assert(test.errors.join("\n").includes("aws login"), "correção de login ausente");
});

for (const { id, command } of [
  { id: "forbid-delete", command: "delete" },
  { id: "forbid-run", command: "run" },
] as const) {
  await evaluate(id, async () => {
    const test = harness();
    const code = await runCli(["node", "tapioca", "secrets", command], test.dependencies);
    assert(code !== 0, `${command} foi aceito`);
    assert(test.gatewayCalls.count === 0, `gateway foi criado para ${command}`);
  });
}

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.id}${result.error ? `: ${result.error}` : ""}`);
}
const passed = results.filter((result) => result.ok).length;
console.log(JSON.stringify({ passed, total: results.length }));
if (passed !== results.length) process.exitCode = 1;
