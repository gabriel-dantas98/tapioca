import {
  CreateSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  ListSecretsCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
  TagResourceCommand,
  type CreateSecretCommandOutput,
  type DescribeSecretCommandOutput,
  type GetSecretValueCommandOutput,
  type ListSecretsCommandOutput,
  type PutSecretValueCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import {
  GetCallerIdentityCommand,
  STSClient,
  type GetCallerIdentityCommandOutput,
} from "@aws-sdk/client-sts";
import { fromLoginCredentials } from "@aws-sdk/credential-providers";

import type {
  DoctorResult,
  SecretMetadata,
  SecretsGateway,
  SecretTags,
  SecretValue,
  WriteSecretInput,
} from "../domain/types.js";
import type { AwsContext } from "./context.js";
import { normalizeAwsError, TapiocaSecretsError } from "./errors.js";

export interface AwsClient {
  send(command: unknown): Promise<unknown>;
}

export interface AwsClients {
  secrets: AwsClient;
  sts: AwsClient;
}

function tagsFromAws(
  tags: ReadonlyArray<{ Key?: string | undefined; Value?: string | undefined }> | undefined,
): SecretTags {
  return Object.fromEntries(
    (tags ?? [])
      .filter((tag): tag is { Key: string; Value: string } => tag.Key !== undefined && tag.Value !== undefined)
      .map((tag) => [tag.Key, tag.Value]),
  );
}

function tagsToAws(tags: SecretTags): Array<{ Key: string; Value: string }> {
  return Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
}

export class AwsSecretsGateway implements SecretsGateway {
  private readonly clients: AwsClients;

  constructor(
    private readonly context: AwsContext,
    clients?: AwsClients,
  ) {
    if (clients) {
      this.clients = clients;
      return;
    }
    const credentials = fromLoginCredentials({ profile: context.profile });
    this.clients = {
      secrets: new SecretsManagerClient({
        credentials,
        profile: context.profile,
        region: context.region,
      }) as unknown as AwsClient,
      sts: new STSClient({
        credentials,
        profile: context.profile,
        region: context.region,
      }) as unknown as AwsClient,
    };
  }

  private async send<T>(client: AwsClient, command: unknown): Promise<T> {
    try {
      return (await client.send(command)) as T;
    } catch (error) {
      throw normalizeAwsError(error);
    }
  }

  async doctor(): Promise<DoctorResult> {
    const identity = await this.send<GetCallerIdentityCommandOutput>(
      this.clients.sts,
      new GetCallerIdentityCommand({}),
    );
    await this.send<ListSecretsCommandOutput>(
      this.clients.secrets,
      new ListSecretsCommand({ MaxResults: 1 }),
    );
    if (!identity.Account || !identity.Arn) {
      throw new TapiocaSecretsError("AWS_ERROR", "A AWS não retornou a identidade atual.");
    }
    return {
      accountId: identity.Account,
      arn: identity.Arn,
      profile: this.context.profile,
      region: this.context.region,
      canListSecrets: true,
    };
  }

  async listSecrets(prefix?: string): Promise<SecretMetadata[]> {
    const found: SecretMetadata[] = [];
    let nextToken: string | undefined;
    do {
      const output = await this.send<ListSecretsCommandOutput>(
        this.clients.secrets,
        new ListSecretsCommand(nextToken ? { NextToken: nextToken } : {}),
      );
      for (const secret of output.SecretList ?? []) {
        if (!secret.Name || (prefix && !secret.Name.startsWith(prefix))) continue;
        const metadata: SecretMetadata = {
          name: secret.Name,
          tags: tagsFromAws(secret.Tags),
        };
        if (secret.ARN) metadata.arn = secret.ARN;
        if (secret.Description) metadata.description = secret.Description;
        if (secret.LastChangedDate) metadata.updatedAt = secret.LastChangedDate;
        found.push(metadata);
      }
      nextToken = output.NextToken;
    } while (nextToken);
    return found.sort((left, right) => left.name.localeCompare(right.name));
  }

  async getSecret(path: string): Promise<SecretValue> {
    const value = await this.send<GetSecretValueCommandOutput>(
      this.clients.secrets,
      new GetSecretValueCommand({ SecretId: path, VersionStage: "AWSCURRENT" }),
    );
    if (value.SecretString === undefined) {
      throw new TapiocaSecretsError(
        "BINARY_UNSUPPORTED",
        "SecretBinary não é suportado na v1; use SecretString.",
      );
    }
    const metadata = await this.send<DescribeSecretCommandOutput>(
      this.clients.secrets,
      new DescribeSecretCommand({ SecretId: path }),
    );
    const result: SecretValue = {
      name: value.Name ?? path,
      value: value.SecretString,
      tags: tagsFromAws(metadata.Tags),
    };
    if (value.ARN) result.arn = value.ARN;
    if (value.VersionId) result.versionId = value.VersionId;
    if (value.CreatedDate) result.updatedAt = value.CreatedDate;
    if (metadata.Description) result.description = metadata.Description;
    return result;
  }

  async createSecret(input: WriteSecretInput): Promise<SecretMetadata> {
    const output = await this.send<CreateSecretCommandOutput>(
      this.clients.secrets,
      new CreateSecretCommand({
        Name: input.name,
        SecretString: input.value,
        Tags: tagsToAws(input.tags),
        ...(input.description ? { Description: input.description } : {}),
      }),
    );
    const result: SecretMetadata = { name: output.Name ?? input.name, tags: input.tags };
    if (output.ARN) result.arn = output.ARN;
    return result;
  }

  async putSecretValue(input: WriteSecretInput): Promise<SecretMetadata> {
    const output = await this.send<PutSecretValueCommandOutput>(
      this.clients.secrets,
      new PutSecretValueCommand({
        SecretId: input.name,
        SecretString: input.value,
        VersionStages: ["AWSCURRENT"],
      }),
    );
    if (Object.keys(input.tags).length > 0) {
      await this.send(
        this.clients.secrets,
        new TagResourceCommand({ SecretId: input.name, Tags: tagsToAws(input.tags) }),
      );
    }
    const result: SecretMetadata = { name: output.Name ?? input.name, tags: input.tags };
    if (output.ARN) result.arn = output.ARN;
    return result;
  }
}
