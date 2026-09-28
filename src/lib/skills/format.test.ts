import { describe, expect, it } from "vitest";
import { parseSkillMd, resolveSkill } from "./format";

describe("parseSkillMd", () => {
  it("reads quoted and folded frontmatter", () => {
    const parsed = parseSkillMd(`---
name: image-edit
displayName: "Image Edit"
description: >
  Edit images while keeping the subject.
  Use when the user has a reference photo.
---

# Image Edit

Keep identity. Change only what was asked.

## Prompting

Studio light, sharp subject, clean background.
`);
    expect(parsed.name).toBe("image-edit");
    expect(parsed.displayName).toBe("Image Edit");
    expect(parsed.description).toContain("Edit images while keeping the subject.");
    expect(parsed.description).toContain("reference photo");
    expect(parsed.body).toContain("Keep identity");
  });

  it("treats files without frontmatter as the body", () => {
    const parsed = parseSkillMd("Just write five bullets.");
    expect(parsed.name).toBe("");
    expect(parsed.body).toBe("Just write five bullets.");
  });

  it("survives missing fields and unclosed fences", () => {
    const parsed = parseSkillMd("---\nfoo: bar\n");
    expect(parsed.name).toBe("");
    expect(parsed.body).toContain("foo: bar");
  });
});

describe("resolveSkill", () => {
  it("builds a capped brief from description + Prompting", () => {
    const resolved = resolveSkill({
      name: "cinematic-product",
      description: "Product photo looks.",
      body: `# Title\n\nLong body that should not all go into a media prompt.\n\n## Prompting\nSoft key light, 85mm, shallow depth.\n`,
    });
    expect(resolved.displayName).toBe("Cinematic Product");
    expect(resolved.brief).toContain("Product photo looks.");
    expect(resolved.brief).toContain("Soft key light");
    expect(resolved.instructions).toContain("Long body");
  });

  it("caps brief around 800 characters", () => {
    const resolved = resolveSkill({
      name: "huge",
      description: "x".repeat(1200),
      body: "y".repeat(200),
    });
    expect(resolved.brief.length).toBeLessThanOrEqual(800);
    expect(resolved.brief.endsWith("…")).toBe(true);
  });
});
