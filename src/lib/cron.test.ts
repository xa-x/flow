import { describe, expect, it } from "vitest";
import { nextCron } from "./cron";

describe("nextCron", () => {
  it("resolves the next matching minute", () => {
    const from = new Date(Date.UTC(2026, 0, 1, 10, 0, 0));
    const next = nextCron("5 * * * *", from);
    expect(next.getUTCMinutes()).toBe(5);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it("rejects invalid expressions", () => {
    expect(() => nextCron("* * *")).toThrow();
  });
});
