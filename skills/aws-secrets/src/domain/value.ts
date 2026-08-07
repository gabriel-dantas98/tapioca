import type { SecretTags } from "./types.js";

const AWS_SECRET_VALUE_MAX_BYTES = 65_536;

export interface PreparedValue {
  value: string;
  tags: SecretTags;
}

export class ValueValidationError extends Error {
  readonly code: "INVALID_JSON" | "VALUE_TOO_LARGE" | "CORRUPT_JSON_VALUE";

  constructor(code: ValueValidationError["code"], message: string) {
    super(message);
    this.name = "ValueValidationError";
    this.code = code;
  }
}

function assertSize(value: string): void {
  if (Buffer.byteLength(value, "utf8") > AWS_SECRET_VALUE_MAX_BYTES) {
    throw new ValueValidationError(
      "VALUE_TOO_LARGE",
      "O valor excede o limite de 65.536 bytes do AWS Secrets Manager.",
    );
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function prepareTextValue(value: string): PreparedValue {
  assertSize(value);
  return { value, tags: {} };
}

export function prepareJsonValue(source: string): PreparedValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new ValueValidationError("INVALID_JSON", "O arquivo não contém JSON válido.");
  }
  const compact = JSON.stringify(canonicalize(parsed));
  const value = Buffer.from(compact, "utf8").toString("base64");
  assertSize(value);
  return {
    value,
    tags: {
      "tapioca:content-type": "application/json",
      "tapioca:encoding": "base64",
    },
  };
}

export function decodeJsonValue(value: string): unknown {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(decoded) as unknown;
  } catch {
    throw new ValueValidationError(
      "CORRUPT_JSON_VALUE",
      "O secret marcado como JSON base64 está corrompido.",
    );
  }
}
