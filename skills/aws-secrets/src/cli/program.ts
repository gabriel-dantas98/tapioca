import { Command, CommanderError } from "commander";

import { TapiocaSecretsError } from "../aws/errors.js";
import { parseSecretPath, parseSecretPrefix } from "../domain/path.js";
import type { SecretsGateway } from "../domain/types.js";
import { decodeJsonValue, prepareJsonValue, prepareTextValue } from "../domain/value.js";
import { injectTemplate } from "../templates/inject.js";
import type { CliIo } from "./io.js";
import { readValueSource } from "./io.js";

interface AwsOptions {
  profile?: string;
  region?: string;
}

export interface CliDependencies {
  gatewayFor(options: AwsOptions): Promise<SecretsGateway>;
  io: CliIo;
  isIgnored(path: string): Promise<boolean>;
  startUi(input: AwsOptions & { gateway: SecretsGateway }): Promise<void>;
}

function awsOptions(command: Command): Command {
  return command.option("--profile <name>", "AWS profile").option("--region <region>", "AWS region");
}

function selectedAwsOptions(command: Command): AwsOptions {
  const options = command.opts<AwsOptions>();
  return {
    ...(options.profile ? { profile: options.profile } : {}),
    ...(options.region ? { region: options.region } : {}),
  };
}

function isJson(tags: Readonly<Record<string, string>>): boolean {
  return (
    tags["tapioca:encoding"] === "base64" &&
    tags["tapioca:content-type"] === "application/json"
  );
}

export function createProgram(dependencies: CliDependencies): Command {
  const program = new Command("tapioca");
  program.description("Tapioca developer tools").showHelpAfterError();
  const secrets = program.command("secrets").description("Use AWS Secrets Manager like a vault");

  awsOptions(secrets.command("doctor").description("Validate AWS login and access")).action(
    async (_options, command: Command) => {
      const gateway = await dependencies.gatewayFor(selectedAwsOptions(command));
      const result = await gateway.doctor();
      dependencies.io.writeOut(`Conta: ${result.accountId}`);
      dependencies.io.writeOut(`Identidade: ${result.arn}`);
      dependencies.io.writeOut(`Profile: ${result.profile}`);
      dependencies.io.writeOut(`Região: ${result.region}`);
    },
  );

  awsOptions(secrets.command("list").description("List secret metadata").argument("[prefix]"))
    .action(async (prefix: string | undefined, _options, command: Command) => {
      if (prefix) parseSecretPrefix(prefix);
      const gateway = await dependencies.gatewayFor(selectedAwsOptions(command));
      const values = await gateway.listSecrets(prefix);
      for (const value of values) dependencies.io.writeOut(value.name);
    });

  awsOptions(
    secrets
      .command("get")
      .description("Read AWSCURRENT")
      .argument("<path>")
      .option("--copy", "Copy without printing")
      .option("--decode", "Decode tagged JSON base64"),
  ).action(async (path: string, options: { copy?: boolean; decode?: boolean }, command: Command) => {
    parseSecretPath(path);
    const gateway = await dependencies.gatewayFor(selectedAwsOptions(command));
    const secret = await gateway.getSecret(path);
    const value = options.decode && isJson(secret.tags)
      ? JSON.stringify(decodeJsonValue(secret.value), null, 2)
      : secret.value;
    if (options.copy) {
      await dependencies.io.copy(value);
      dependencies.io.writeOut("Secret copiado.");
    } else dependencies.io.writeOut(value);
  });

  awsOptions(
    secrets
      .command("create")
      .description("Create a new secret")
      .argument("<path>")
      .option("--stdin", "Read value from stdin")
      .option("--from-file <path>", "Read value from file")
      .option("--json", "Validate, compact, and store JSON as base64"),
  ).action(
    async (
      path: string,
      options: { stdin?: boolean; fromFile?: string; json?: boolean },
      command: Command,
    ) => {
      parseSecretPath(path);
      const source = await readValueSource(options, dependencies.io);
      const prepared = options.json ? prepareJsonValue(source) : prepareTextValue(source);
      const gateway = await dependencies.gatewayFor(selectedAwsOptions(command));
      await gateway.createSecret({ name: path, ...prepared });
      dependencies.io.writeOut(`Secret criado: ${path}`);
    },
  );

  awsOptions(
    secrets
      .command("edit")
      .description("Create a new AWSCURRENT version")
      .argument("<path>")
      .option("--stdin", "Read value from stdin")
      .option("--from-file <path>", "Read value from file")
      .option("--json", "Validate, compact, and store JSON as base64"),
  ).action(
    async (
      path: string,
      options: { stdin?: boolean; fromFile?: string; json?: boolean },
      command: Command,
    ) => {
      parseSecretPath(path);
      const gateway = await dependencies.gatewayFor(selectedAwsOptions(command));
      const current = await gateway.getSecret(path);
      const source = await readValueSource(options, dependencies.io);
      const prepared = options.json || isJson(current.tags)
        ? prepareJsonValue(source)
        : prepareTextValue(source);
      await gateway.putSecretValue({ name: path, ...prepared });
      dependencies.io.writeOut(`Nova versão criada: ${path}`);
    },
  );

  awsOptions(
    secrets
      .command("inject")
      .description("Resolve a .env.template")
      .argument("<template>")
      .requiredOption("--output <path>", "Output .env path")
      .option("--force", "Replace an existing output")
      .option("--allow-unignored", "Allow a Git-visible output"),
  ).action(
    async (
      template: string,
      options: { output: string; force?: boolean; allowUnignored?: boolean },
      command: Command,
    ) => {
      const gateway = await dependencies.gatewayFor(selectedAwsOptions(command));
      const result = await injectTemplate(
        {
          templatePath: template,
          outputPath: options.output,
          ...(options.force ? { force: true } : {}),
          ...(options.allowUnignored ? { allowUnignored: true } : {}),
        },
        { gateway, isIgnored: dependencies.isIgnored },
      );
      dependencies.io.writeOut(`${result.references} secrets gravados em ${result.outputPath}`);
    },
  );

  awsOptions(secrets.command("ui").description("Open the read-only local UI")).action(
    async (_options, command: Command) => {
      const options = selectedAwsOptions(command);
      const gateway = await dependencies.gatewayFor(options);
      await dependencies.startUi({ ...options, gateway });
    },
  );

  return program;
}

function exitCode(error: unknown): number {
  if (error instanceof CommanderError) return error.exitCode;
  if (error instanceof TapiocaSecretsError) {
    return {
      AUTH_REQUIRED: 3,
      ACCESS_DENIED: 4,
      NOT_FOUND: 5,
      CONFLICT: 6,
      TRANSIENT: 7,
      REGION_REQUIRED: 2,
      BINARY_UNSUPPORTED: 2,
      AWS_ERROR: 1,
    }[error.code];
  }
  if (error instanceof Error && "code" in error) return 2;
  return 1;
}

export async function runCli(argv: string[], dependencies: CliDependencies): Promise<number> {
  const program = createProgram(dependencies);
  program.exitOverride();
  program.configureOutput({
    writeOut: (value) => dependencies.io.writeOut(value.trimEnd()),
    writeErr: (value) => dependencies.io.writeError(value.trimEnd()),
  });
  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    if (!(error instanceof CommanderError && error.exitCode === 0)) {
      dependencies.io.writeError(error instanceof Error ? error.message : "Falha inesperada.");
    }
    return exitCode(error);
  }
}
