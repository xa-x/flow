import { describe, expect, it } from "vitest";
import { GraphHistory } from "./history";
import type { GraphDoc } from "./types";

const doc = (label: string): GraphDoc => ({
  nodes: [
    {
      id: "n1",
      type: "flow",
      position: { x: 0, y: 0 },
      data: { kind: "text", label, text: label },
    },
  ],
  edges: [],
});

describe("GraphHistory", () => {
  it("undoes and redoes graph snapshots", () => {
    const h = new GraphHistory();
    const a = doc("a");
    const b = doc("b");
    h.remember(a);
    const undone = h.undo(b);
    expect(undone?.nodes[0].data.label).toBe("a");
    const redone = h.redo(undone!);
    expect(redone?.nodes[0].data.label).toBe("b");
  });
});
