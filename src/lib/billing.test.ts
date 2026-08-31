import { describe, expect, it } from "vitest";
import { planOf, PLANS } from "./billing";

describe("plans", () => {
  it("defaults unknown plans to free", () => {
    expect(planOf("nope").id).toBe("free");
    expect(planOf("pro").schedules).toBe(true);
    expect(PLANS.free.mcp).toBe(false);
    expect(PLANS.team.team).toBe(true);
  });
});
