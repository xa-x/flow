import { describe, expect, it } from "vitest";
import { isPortable, parsePortable, remapPortable, toPortable } from "./portable";
import type { GraphDoc } from "./types";

const doc: GraphDoc = {
  nodes: [
    {
      id: "a",
      type: "flow",
      position: { x: 10, y: 20 },
      data: { kind: "text", label: "A", text: "hello", runStatus: "done", outputs: [] },
    },
    {
      id: "b",
      type: "flow",
      position: { x: 200, y: 20 },
      data: { kind: "llm", label: "B", prompt: "sum" },
    },
  ],
  edges: [
    { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
  ],
};

describe("portable workbook", () => {
  it("strips runtime fields and remaps ids", () => {
    const pack = toPortable(doc, { title: "T", nodeIds: ["a", "b"] });
    expect(isPortable(pack)).toBe(true);
    expect(pack.nodes[0].data.runStatus).toBeUndefined();
    const next = remapPortable(pack);
    expect(next.nodes).toHaveLength(2);
    expect(next.nodes.some((n) => n.id === "a")).toBe(false);
    expect(next.edges).toHaveLength(1);
  });

  it("keeps inlined skills on export", () => {
    const pack = toPortable(doc, {
      title: "T",
      skills: [
        {
          slug: "summarize-bullets",
          displayName: "Summarize",
          description: "Five bullets",
          body: "Write five bullets.",
        },
      ],
    });
    expect(pack.version).toBe(2);
    expect(pack.skills?.[0].slug).toBe("summarize-bullets");
  });

  it("rejects junk clipboard text", () => {
    expect(parsePortable("not-json")).toBeNull();
    expect(parsePortable(JSON.stringify({ nodes: [] }))).toBeNull();
  });
});
