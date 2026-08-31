import { describe, expect, it } from "vitest";
import { assertOrgAccess, canEdit, TenantError } from "./tenant";

describe("tenant isolation", () => {
  it("blocks cross-org access", () => {
    expect(() => assertOrgAccess("org_a", "org_b")).toThrow(TenantError);
    expect(() => assertOrgAccess("org_a", "org_a")).not.toThrow();
  });

  it("treats viewers as read-only", () => {
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit("editor")).toBe(true);
  });
});
