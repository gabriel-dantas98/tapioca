import { describe, expect, it } from "vitest";

import {
  TemplateValidationError,
  parseTemplate,
  renderTemplate,
} from "../src/templates/dotenv.js";

describe("dotenv templates", () => {
  const source = [
    "# app config",
    "DATABASE_URL=secret://payments/prod/checkout-api/database-url",
    "SERVICE_CONFIG=secret://platform/prod/worker/service-config",
    "PORT=3000",
    "",
  ].join("\n");

  it("finds full-value secret references and preserves other lines", () => {
    const parsed = parseTemplate(source);
    expect(parsed.references).toEqual([
      {
        variable: "DATABASE_URL",
        path: "payments/prod/checkout-api/database-url",
        line: 2,
      },
      {
        variable: "SERVICE_CONFIG",
        path: "platform/prod/worker/service-config",
        line: 3,
      },
    ]);
    expect(parsed.source).toBe(source);
  });

  it("renders resolved values without changing comments or static variables", () => {
    const parsed = parseTemplate(source);
    const rendered = renderTemplate(
      parsed,
      new Map([
        ["payments/prod/checkout-api/database-url", "postgres://localhost/app"],
        ["platform/prod/worker/service-config", "eyJlbmFibGVkIjp0cnVlfQ=="],
      ]),
    );
    expect(rendered).toBe(
      [
        "# app config",
        "DATABASE_URL=postgres://localhost/app",
        "SERVICE_CONFIG=eyJlbmFibGVkIjp0cnVlfQ==",
        "PORT=3000",
        "",
      ].join("\n"),
    );
  });

  it("rejects inline interpolation", () => {
    expect(() =>
      parseTemplate("URL=https://example.test?token=secret://payments/prod/api/token"),
    ).toThrowError(expect.objectContaining({ code: "INLINE_REFERENCE" }));
  });

  it("rejects malformed and duplicate environment variables", () => {
    expect(() => parseTemplate("TOKEN=secret://bad/path")).toThrowError(
      TemplateValidationError,
    );
    expect(() => parseTemplate("TOKEN=one\nTOKEN=two\n")).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_VARIABLE" }),
    );
  });

  it("rejects multiline secret values", () => {
    const parsed = parseTemplate("TOKEN=secret://payments/prod/api/token\n");
    expect(() =>
      renderTemplate(parsed, new Map([["payments/prod/api/token", "line 1\nline 2"]])),
    ).toThrowError(expect.objectContaining({ code: "MULTILINE_VALUE" }));
  });

  it("quotes parser-sensitive values without changing their bytes", () => {
    const parsed = parseTemplate("TOKEN=secret://payments/prod/api/token\n");
    const value = '  hash# double" dollar$ backslash\\ unicode-ç  ';
    expect(renderTemplate(parsed, new Map([["payments/prod/api/token", value]]))).toBe(
      `TOKEN='${value}'\n`,
    );
  });

  it("rejects values that cannot be represented portably in dotenv", () => {
    const parsed = parseTemplate("TOKEN=secret://payments/prod/api/token\n");
    expect(() =>
      renderTemplate(parsed, new Map([["payments/prod/api/token", "don't # truncate"]])),
    ).toThrowError(expect.objectContaining({ code: "UNSAFE_VALUE" }));
  });
});
