export interface SecretPathParts {
  domain: string;
  environment: string;
  product: string;
  key: string;
}

export interface SecretPrefix {
  value: string;
  segments: string[];
}

export type SecretPath = string & { readonly __brand: "SecretPath" };

export class PathValidationError extends Error {
  readonly code: "INVALID_PATH" | "INVALID_PREFIX";

  constructor(code: "INVALID_PATH" | "INVALID_PREFIX") {
    super(code);
    this.name = "PathValidationError";
    this.code = code;
  }
}

const SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validSegments(value: string, minimum: number, maximum: number): string[] | undefined {
  const segments = value.split("/");
  if (
    segments.length < minimum ||
    segments.length > maximum ||
    segments.some((segment) => !SEGMENT_PATTERN.test(segment))
  ) {
    return undefined;
  }
  return segments;
}

export function parseSecretPath(value: string): SecretPathParts {
  const segments = validSegments(value, 4, 4);
  if (!segments) {
    throw new PathValidationError("INVALID_PATH");
  }
  const [domain, environment, product, key] = segments;
  if (!domain || !environment || !product || !key) {
    throw new PathValidationError("INVALID_PATH");
  }
  return { domain, environment, product, key };
}

export function formatSecretPath(parts: SecretPathParts): SecretPath {
  const value = [parts.domain, parts.environment, parts.product, parts.key].join("/");
  parseSecretPath(value);
  return value as SecretPath;
}

export function parseSecretPrefix(value: string): SecretPrefix {
  const segments = validSegments(value, 1, 4);
  if (!segments) {
    throw new PathValidationError("INVALID_PREFIX");
  }
  return { value, segments };
}
