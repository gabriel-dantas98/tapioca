export interface SecretMetadataDto {
  name: string;
  arn?: string;
  description?: string;
  updatedAt?: string;
  tags: Record<string, string>;
}

export interface SecretsResponse {
  context: { profile: string; region: string };
  secrets: SecretMetadataDto[];
}

export interface RevealedSecret {
  name: string;
  value: string;
  decoded?: unknown;
  format: "text" | "json-base64";
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function sessionToken(): string {
  return window.location.hash.slice(1);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Tapioca-Session": sessionToken(),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = (await response.json()) as T | { error?: string; code?: string };
  if (!response.ok) {
    const failure = body as { error?: string; code?: string };
    throw new ApiError(failure.error ?? "A operação falhou.", failure.code);
  }
  return body as T;
}

export const api = {
  list: async (): Promise<SecretsResponse> => request<SecretsResponse>("/api/secrets"),
  reveal: async (path: string): Promise<RevealedSecret> =>
    request<RevealedSecret>("/api/reveal", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
};
