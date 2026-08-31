import { describe, expect, it } from "vitest";
import { redactPayload } from "../redact";

describe("run event redaction", () => {
  it("drops secrets and prompts", () => {
    const out = redactPayload({
      type: "node",
      apiKey: "sk-secret",
      prompt: "hidden",
      status: "running",
    });
    expect(out.apiKey).toBeUndefined();
    expect(out.prompt).toBeUndefined();
    expect(out.status).toBe("running");
  });
});
