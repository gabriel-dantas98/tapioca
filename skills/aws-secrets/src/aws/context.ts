import { loadSharedConfigFiles } from "@smithy/shared-ini-file-loader";

import { TapiocaSecretsError } from "./errors.js";

export interface AwsContext {
  profile: string;
  region: string;
}

export interface AwsContextInput {
  profile?: string;
  region?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export interface AwsContextDependencies {
  loadProfileRegion(profile: string): Promise<string | undefined>;
}

async function defaultLoadProfileRegion(profile: string): Promise<string | undefined> {
  const { configFile } = await loadSharedConfigFiles();
  return configFile[profile]?.["region"];
}

export async function resolveAwsContext(
  input: AwsContextInput,
  dependencies: AwsContextDependencies = { loadProfileRegion: defaultLoadProfileRegion },
): Promise<AwsContext> {
  const env = input.env ?? process.env;
  const profile = input.profile ?? env["AWS_PROFILE"] ?? "default";
  const region =
    input.region ??
    env["AWS_REGION"] ??
    env["AWS_DEFAULT_REGION"] ??
    (await dependencies.loadProfileRegion(profile));
  if (!region) {
    throw new TapiocaSecretsError(
      "REGION_REQUIRED",
      `Nenhuma região foi configurada para o profile ${profile}.`,
    );
  }
  return { profile, region };
}
