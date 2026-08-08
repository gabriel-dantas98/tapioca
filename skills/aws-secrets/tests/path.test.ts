import { describe, expect, it } from "vitest";

import {
  PathValidationError,
  formatSecretPath,
  parseSecretPath,
  parseSecretPrefix,
} from "../src/domain/path.js";

describe("parseSecretPath", () => {
  it("parses exactly four kebab-case segments", () => {
    expect(parseSecretPath("payments/prod/checkout-api/database-url")).toEqual({
      domain: "payments",
      environment: "prod",
      product: "checkout-api",
      key: "database-url",
    });
  });

  it.each([
    "payments/prod/checkout-api",
    "payments/prod/checkout-api/database-url/extra",
    "Payments/prod/checkout-api/database-url",
    "payments/prod/checkout_api/database-url",
    "payments//checkout-api/database-url",
    "payments/prod/-checkout/database-url",
  ])("rejects invalid secret path %s", (value) => {
    expect(() => parseSecretPath(value)).toThrowError(PathValidationError);
    try {
      parseSecretPath(value);
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_PATH" });
    }
  });

  it("formats parsed parts without changing the path", () => {
    const parsed = parseSecretPath("payments/prod/checkout-api/database-url");
    expect(formatSecretPath(parsed)).toBe("payments/prod/checkout-api/database-url");
  });
});

describe("parseSecretPrefix", () => {
  it.each([
    ["payments", ["payments"]],
    ["payments/prod", ["payments", "prod"]],
    ["payments/prod/checkout-api", ["payments", "prod", "checkout-api"]],
    [
      "payments/prod/checkout-api/database-url",
      ["payments", "prod", "checkout-api", "database-url"],
    ],
  ])("accepts prefix %s", (value, segments) => {
    expect(parseSecretPrefix(value)).toEqual({ value, segments });
  });

  it.each(["", "payments/", "payments/prod/checkout/api/extra", "Payments/prod"])(
    "rejects invalid prefix %s",
    (value) => {
      expect(() => parseSecretPrefix(value)).toThrowError(
        expect.objectContaining({ code: "INVALID_PREFIX" }),
      );
    },
  );
});
