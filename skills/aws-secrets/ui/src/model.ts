import type { SecretMetadataDto } from "./api";

export interface SecretItem extends SecretMetadataDto {
  domain: string;
  environment: string;
  product: string;
  key: string;
  jsonBase64: boolean;
}

export function toSecretItem(secret: SecretMetadataDto): SecretItem {
  const [domain = "", environment = "", product = "", key = ""] = secret.name.split("/");
  return {
    ...secret,
    domain,
    environment,
    product,
    key,
    jsonBase64:
      secret.tags["tapioca:encoding"] === "base64" &&
      secret.tags["tapioca:content-type"] === "application/json",
  };
}

export function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function updatedLabel(value?: string): string {
  if (!value) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}
