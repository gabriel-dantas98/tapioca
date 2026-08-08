import { describe, expect, it } from "vitest";

import { appendRawSecretBytes } from "../src/cli/io.js";

describe("hidden secret input", () => {
  it("preserves UTF-8 bytes and removes a complete code point on backspace", () => {
    const bytes: number[] = [];
    expect(appendRawSecretBytes(bytes, Buffer.from("segredo-çã"))).toBe("continue");
    expect(appendRawSecretBytes(bytes, Buffer.from([127]))).toBe("continue");
    expect(appendRawSecretBytes(bytes, Buffer.from("o\n"))).toBe("submit");
    expect(Buffer.from(bytes).toString("utf8")).toBe("segredo-ço");
  });

  it("recognizes cancellation without retaining the control byte", () => {
    const bytes: number[] = [];
    expect(appendRawSecretBytes(bytes, Buffer.from([0x61, 0x03]))).toBe("cancel");
    expect(Buffer.from(bytes).toString("utf8")).toBe("a");
  });
});
