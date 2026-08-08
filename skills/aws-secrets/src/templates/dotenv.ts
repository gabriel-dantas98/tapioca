import { parseSecretPath } from "../domain/path.js";

export interface TemplateReference {
  variable: string;
  path: string;
  line: number;
}

export interface ParsedTemplate {
  source: string;
  references: TemplateReference[];
}

export class TemplateValidationError extends Error {
  readonly code:
    | "INLINE_REFERENCE"
    | "INVALID_REFERENCE"
    | "DUPLICATE_VARIABLE"
    | "MISSING_VALUE"
    | "MULTILINE_VALUE"
    | "UNSAFE_VALUE";

  constructor(code: TemplateValidationError["code"], message: string) {
    super(message);
    this.name = "TemplateValidationError";
    this.code = code;
  }
}

const SAFE_UNQUOTED_VALUE = /^[A-Za-z0-9_./:@%+,=-]*$/;

function formatDotenvValue(path: string, value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new TemplateValidationError(
      "UNSAFE_VALUE",
      `${path} contém caracteres de controle; armazene o valor em base64.`,
    );
  }
  if (SAFE_UNQUOTED_VALUE.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  throw new TemplateValidationError(
    "UNSAFE_VALUE",
    `${path} não pode ser representado de forma portável em dotenv; armazene o valor em base64.`,
  );
}

export function parseTemplate(source: string): ParsedTemplate {
  const references: TemplateReference[] = [];
  const variables = new Set<string>();
  const lines = source.split("\n");

  for (const [index, line] of lines.entries()) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const variable = match[1];
    const value = match[2];
    if (!variable || value === undefined) continue;
    if (variables.has(variable)) {
      throw new TemplateValidationError(
        "DUPLICATE_VARIABLE",
        `A variável ${variable} aparece mais de uma vez.`,
      );
    }
    variables.add(variable);

    if (!value.includes("secret://")) continue;
    const reference = /^secret:\/\/(.+)$/.exec(value);
    if (!reference?.[1]) {
      throw new TemplateValidationError(
        "INLINE_REFERENCE",
        `A referência na linha ${index + 1} precisa ocupar o valor inteiro.`,
      );
    }
    try {
      parseSecretPath(reference[1]);
    } catch {
      throw new TemplateValidationError(
        "INVALID_REFERENCE",
        `Path inválido na linha ${index + 1}: ${reference[1]}`,
      );
    }
    references.push({ variable, path: reference[1], line: index + 1 });
  }

  return { source, references };
}

export function renderTemplate(parsed: ParsedTemplate, values: ReadonlyMap<string, string>): string {
  const byLine = new Map(parsed.references.map((reference) => [reference.line, reference]));
  return parsed.source
    .split("\n")
    .map((line, index) => {
      const reference = byLine.get(index + 1);
      if (!reference) return line;
      const value = values.get(reference.path);
      if (value === undefined) {
        throw new TemplateValidationError(
          "MISSING_VALUE",
          `Valor ausente para ${reference.path}.`,
        );
      }
      if (value.includes("\n") || value.includes("\r")) {
        throw new TemplateValidationError(
          "MULTILINE_VALUE",
          `${reference.path} contém múltiplas linhas; armazene o conteúdo em base64.`,
        );
      }
      return `${reference.variable}=${formatDotenvValue(reference.path, value)}`;
    })
    .join("\n");
}
