export type TapiocaSecretsErrorCode =
  | "REGION_REQUIRED"
  | "AUTH_REQUIRED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TRANSIENT"
  | "BINARY_UNSUPPORTED"
  | "AWS_ERROR";

export class TapiocaSecretsError extends Error {
  readonly code: TapiocaSecretsErrorCode;
  override readonly cause: unknown;

  constructor(code: TapiocaSecretsErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "TapiocaSecretsError";
    this.code = code;
    this.cause = cause;
  }
}

export function normalizeAwsError(error: unknown): TapiocaSecretsError {
  if (error instanceof TapiocaSecretsError) return error;
  const name = error instanceof Error ? error.name : "UnknownAwsError";
  switch (name) {
    case "AccessDeniedException":
    case "UnauthorizedException":
      return new TapiocaSecretsError(
        "ACCESS_DENIED",
        "Seu profile não tem permissão para esta operação.",
        error,
      );
    case "ExpiredTokenException":
    case "CredentialsProviderError":
    case "UnrecognizedClientException":
      return new TapiocaSecretsError(
        "AUTH_REQUIRED",
        "Sessão AWS ausente ou expirada. Execute aws login novamente.",
        error,
      );
    case "ResourceNotFoundException":
      return new TapiocaSecretsError("NOT_FOUND", "Secret não encontrado.", error);
    case "ResourceExistsException":
      return new TapiocaSecretsError("CONFLICT", "O secret já existe.", error);
    case "ThrottlingException":
    case "TooManyRequestsException":
    case "ServiceUnavailableException":
      return new TapiocaSecretsError(
        "TRANSIENT",
        "A AWS está temporariamente indisponível. Tente novamente.",
        error,
      );
    default:
      return new TapiocaSecretsError("AWS_ERROR", "A operação na AWS falhou.", error);
  }
}
