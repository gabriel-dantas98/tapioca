import { describe, expect, it } from "vitest";

import {
  ValueValidationError,
  decodeJsonValue,
  prepareJsonValue,
  prepareTextValue,
} from "../src/domain/value.js";

describe("secret values", () => {
  it("keeps plain text unchanged", () => {
    expect(prepareTextValue("sk_live_example")).toEqual({
      value: "sk_live_example",
      tags: {},
    });
  });

  it("sorts, compacts, and base64-encodes JSON", () => {
    const prepared = prepareJsonValue('{ "z": 1, "a": { "y": 2, "b": true } }');
    expect(Buffer.from(prepared.value, "base64").toString("utf8")).toBe(
      '{"a":{"b":true,"y":2},"z":1}',
    );
    expect(prepared.tags).toEqual({
      "tapioca:content-type": "application/json",
      "tapioca:encoding": "base64",
    });
  });

  it("decodes tagged JSON for display", () => {
    const prepared = prepareJsonValue('{"enabled":true}');
    expect(decodeJsonValue(prepared.value)).toEqual({ enabled: true });
  });

  it("rejects malformed JSON", () => {
    expect(() => prepareJsonValue("{oops")).toThrowError(
      expect.objectContaining({ code: "INVALID_JSON" }),
    );
  });

  it("rejects a value larger than the AWS limit after encoding", () => {
    const oversized = JSON.stringify({ value: "x".repeat(50_000) });
    expect(() => prepareJsonValue(oversized)).toThrowError(
      expect.objectContaining({ code: "VALUE_TOO_LARGE" }),
    );
  });

  it("rejects corrupted base64 JSON", () => {
    expect(() => decodeJsonValue("bm90LWpzb24=")).toThrowError(ValueValidationError);
  });
});
