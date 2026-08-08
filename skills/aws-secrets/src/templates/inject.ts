import { constants } from "node:fs";
import { access, chmod, link, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import type { SecretsGateway } from "../domain/types.js";
import { parseTemplate, renderTemplate } from "./dotenv.js";

export interface InjectOptions {
  templatePath: string;
  outputPath: string;
  force?: boolean;
  allowUnignored?: boolean;
}

export interface InjectDependencies {
  gateway: SecretsGateway;
  isIgnored(path: string): Promise<boolean>;
}

export interface InjectResult {
  references: number;
  outputPath: string;
}

export class InjectionError extends Error {
  readonly code: "OUTPUT_EXISTS" | "OUTPUT_NOT_IGNORED";

  constructor(code: InjectionError["code"], message: string) {
    super(message);
    this.name = "InjectionError";
    this.code = code;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function injectTemplate(
  options: InjectOptions,
  dependencies: InjectDependencies,
): Promise<InjectResult> {
  const outputPath = resolve(options.outputPath);
  if ((await exists(outputPath)) && !options.force) {
    throw new InjectionError("OUTPUT_EXISTS", `${outputPath} já existe; use --force.`);
  }
  if (!options.allowUnignored && !(await dependencies.isIgnored(outputPath))) {
    throw new InjectionError(
      "OUTPUT_NOT_IGNORED",
      `${outputPath} não está ignorado pelo Git.`,
    );
  }

  const parsed = parseTemplate(await readFile(resolve(options.templatePath), "utf8"));
  const uniquePaths = [...new Set(parsed.references.map((reference) => reference.path))];
  const secrets = await Promise.all(uniquePaths.map((path) => dependencies.gateway.getSecret(path)));
  const values = new Map(secrets.map((secret) => [secret.name, secret.value]));
  const rendered = renderTemplate(parsed, values);

  const temporaryPath = join(dirname(outputPath), `.${randomUUID()}.tapioca.tmp`);
  let temporaryCreated = false;
  try {
    const file = await open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    try {
      await file.writeFile(rendered, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await chmod(temporaryPath, 0o600);
    if (options.force) {
      await rename(temporaryPath, outputPath);
      temporaryCreated = false;
    } else {
      try {
        await link(temporaryPath, outputPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new InjectionError("OUTPUT_EXISTS", `${outputPath} já existe; use --force.`);
        }
        throw error;
      }
      await unlink(temporaryPath);
      temporaryCreated = false;
    }
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch(() => undefined);
  }

  return { references: parsed.references.length, outputPath };
}
