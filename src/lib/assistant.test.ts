import { describe, expect, it } from "vitest";
import { applyGraphOps, autoWireNodes } from "./assistant";
import { matchPorts } from "./nodes";
import { layoutGraph } from "./layout";
import type { GraphDoc } from "./types";

const empty: GraphDoc = { nodes: [], edges: [] };

describe("matchPorts", () => {
  it("wires image → video first-frame, not the prompt handle", () => {
    expect(matchPorts("image.in", "video.gen")).toEqual({
      sourceHandle: "out",
      targetHandle: "image",
    });
  });

  it("wires skill text into an AI Image prompt port", () => {
    expect(matchPorts("skill", "image.gen")).toEqual({
      sourceHandle: "out",
      targetHandle: "prompt",
    });
  });

  it("wires video → media out video port", () => {
    expect(matchPorts("video.gen", "out.media")).toEqual({
      sourceHandle: "out",
      targetHandle: "video",
    });
  });

  it("remaps a bogus in handle to the typed port", () => {
    expect(matchPorts("image.in", "video.gen", "out", "in")).toEqual({
      sourceHandle: "out",
      targetHandle: "image",
    });
  });
});

describe("applyGraphOps", () => {
  it("adds a pipeline and connects typed edges even without connect ops", () => {
    const next = applyGraphOps(empty, [
      { op: "add_node", id: "img", kind: "image.in", label: "Image" },
      { op: "add_node", id: "vid", kind: "video.gen", label: "AI Video" },
      { op: "add_node", id: "out", kind: "out.media", label: "Media Out" },
    ]);
    expect(next.nodes.map((n) => n.data.kind)).toEqual([
      "image.in",
      "video.gen",
      "out.media",
    ]);
    expect(next.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHandle: "out",
          targetHandle: "image",
        }),
        expect.objectContaining({
          sourceHandle: "out",
          targetHandle: "video",
        }),
      ]),
    );
    expect(next.edges).toHaveLength(2);
  });

  it("connects with wrong handles by remapping types", () => {
    const seeded = applyGraphOps(empty, [
      { op: "add_node", id: "img", kind: "image.in" },
      { op: "add_node", id: "vid", kind: "video.gen" },
    ]);
    const next = applyGraphOps(
      { nodes: seeded.nodes, edges: [] },
      [{ op: "connect", source: "img", target: "vid", sourceHandle: "out", targetHandle: "in" }],
    );
    expect(next.edges[0]).toMatchObject({
      sourceHandle: "out",
      targetHandle: "image",
    });
  });
});

describe("autoWireNodes", () => {
  it("does not duplicate existing edges", () => {
    const doc = applyGraphOps(empty, [
      { op: "add_node", id: "a", kind: "text" },
      { op: "add_node", id: "b", kind: "llm" },
      { op: "connect", source: "a", target: "b" },
    ]);
    const ids = doc.nodes.map((n) => n.id);
    const again = autoWireNodes(doc.nodes, doc.edges, ids);
    expect(again).toHaveLength(doc.edges.length);
  });
});

describe("layoutGraph", () => {
  it("places sources left of their targets", () => {
    const doc = applyGraphOps(empty, [
      { op: "add_node", id: "img", kind: "image.in" },
      { op: "add_node", id: "vid", kind: "video.gen" },
      { op: "add_node", id: "out", kind: "out.media" },
    ]);
    const laid = layoutGraph(doc);
    const x = Object.fromEntries(
      laid.nodes.map((n) => [n.data.kind, n.position.x]),
    );
    expect(x["image.in"]).toBeLessThan(x["video.gen"]);
    expect(x["video.gen"]).toBeLessThan(x["out.media"]);
  });
});
