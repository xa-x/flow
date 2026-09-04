import { describe, expect, it } from "vitest";
import { redactPayload } from "../redact";

describe("run event redaction", () => {
  it("drops secrets but keeps stream text", () => {
    const out = redactPayload({
      type: "delta",
      apiKey: "sk-secret",
      text: "hello",
      status: "running",
    });
    expect(out.apiKey).toBeUndefined();
    expect(out.text).toBe("hello");
    expect(out.status).toBe("running");
  });
});
