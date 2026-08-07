import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SecretValue, SecretsGateway } from "../src/domain/types.js";
import { InjectionError, injectTemplate } from "../src/templates/inject.js";

const cleanup: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function gateway(values: Record<string, string>): SecretsGateway {
  return {
    async doctor() {
      throw new Error("unused");
    },
    async listSecrets() {
      return [];
    },
    async getSecret(path): Promise<SecretValue> {
      const value = values[path];
      if (value === undefined) throw new Error(`missing ${path}`);
      return { name: path, value, tags: {} };
    },
    async createSecret() {
      throw new Error("unused");
    },
    async putSecretValue() {
      throw new Error("unused");
    },
  };
}

async function fixture(): Promise<{ directory: string; template: string; output: string }> {
  const directory = await mkdtemp(join(tmpdir(), "tapioca-inject-"));
  cleanup.push(directory);
  const template = join(directory, ".env.template");
  const output = join(directory, ".env");
  await writeFile(
    template,
    "TOKEN=secret://payments/prod/api/token\nPORT=3000\n",
    "utf8",
  );
  return { directory, template, output };
}

describe("injectTemplate", () => {
  it("writes a complete mode-0600 file atomically", async () => {
    const files = await fixture();
    const result = await injectTemplate(
      { templatePath: files.template, outputPath: files.output },
      { gateway: gateway({ "payments/prod/api/token": "secret-value" }), isIgnored: async () => true },
    );

    expect(result).toEqual({ references: 1, outputPath: files.output });
    expect(await readFile(files.output, "utf8")).toBe("TOKEN=secret-value\nPORT=3000\n");
    expect((await stat(files.output)).mode & 0o777).toBe(0o600);
    expect((await import("node:fs/promises")).readdir(files.directory)).resolves.toEqual([
      ".env",
      ".env.template",
    ]);
  });

  it("does not touch an existing output when resolution fails", async () => {
    const files = await fixture();
    await writeFile(files.output, "KEEP=original\n", "utf8");

    await expect(
      injectTemplate(
        { templatePath: files.template, outputPath: files.output, force: true },
        { gateway: gateway({}), isIgnored: async () => true },
      ),
    ).rejects.toThrow("missing payments/prod/api/token");
    expect(await readFile(files.output, "utf8")).toBe("KEEP=original\n");
  });

  it("refuses overwrite without force", async () => {
    const files = await fixture();
    await writeFile(files.output, "KEEP=original\n", "utf8");
    await expect(
      injectTemplate(
        { templatePath: files.template, outputPath: files.output },
        { gateway: gateway({ "payments/prod/api/token": "secret" }), isIgnored: async () => true },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "OUTPUT_EXISTS" }));
  });

  it("refuses a Git-visible output unless explicitly allowed", async () => {
    const files = await fixture();
    await expect(
      injectTemplate(
        { templatePath: files.template, outputPath: files.output },
        { gateway: gateway({ "payments/prod/api/token": "secret" }), isIgnored: async () => false },
      ),
    ).rejects.toThrowError(InjectionError);

    await expect(
      injectTemplate(
        { templatePath: files.template, outputPath: files.output, allowUnignored: true },
        { gateway: gateway({ "payments/prod/api/token": "secret" }), isIgnored: async () => false },
      ),
    ).resolves.toMatchObject({ references: 1 });
  });
});
