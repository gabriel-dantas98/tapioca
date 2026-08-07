export interface SecretTags {
  [key: string]: string;
}

export interface SecretMetadata {
  name: string;
  arn?: string;
  description?: string;
  updatedAt?: Date;
  tags: SecretTags;
}

export interface SecretValue extends SecretMetadata {
  value: string;
  versionId?: string;
}

export interface DoctorResult {
  accountId: string;
  arn: string;
  profile: string;
  region: string;
  canListSecrets: boolean;
}

export interface WriteSecretInput {
  name: string;
  value: string;
  tags: SecretTags;
  description?: string;
}

export interface SecretsGateway {
  doctor(): Promise<DoctorResult>;
  listSecrets(prefix?: string): Promise<SecretMetadata[]>;
  getSecret(path: string): Promise<SecretValue>;
  createSecret(input: WriteSecretInput): Promise<SecretMetadata>;
  putSecretValue(input: WriteSecretInput): Promise<SecretMetadata>;
}
