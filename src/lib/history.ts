import type { GraphDoc } from "./types";

const MAX = 80;

function cloneDoc(doc: GraphDoc): GraphDoc {
  return {
    nodes: doc.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      data: { ...n.data },
    })),
    edges: doc.edges.map((e) => ({ ...e })),
    viewport: doc.viewport ? { ...doc.viewport } : undefined,
  };
}

export function snapshotKey(doc: GraphDoc) {
  return JSON.stringify({
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      data: {
        kind: n.data.kind,
        label: n.data.label,
        text: n.data.text,
        prompt: n.data.prompt,
        model: n.data.model,
        provider: n.data.provider,
        artifactId: n.data.artifactId,
      },
    })),
    edges: doc.edges.map((e) => ({
      s: e.source,
      t: e.target,
      sh: e.sourceHandle,
      th: e.targetHandle,
    })),
  });
}

export class GraphHistory {
  private past: GraphDoc[] = [];
  private future: GraphDoc[] = [];
  private lastKey = "";

  remember(doc: GraphDoc) {
    const key = snapshotKey(doc);
    if (key === this.lastKey) return;
    this.past.push(cloneDoc(doc));
    if (this.past.length > MAX) this.past.shift();
    this.future = [];
    this.lastKey = key;
  }

  undo(current: GraphDoc): GraphDoc | null {
    if (!this.past.length) return null;
    this.future.push(cloneDoc(current));
    const prev = this.past.pop()!;
    this.lastKey = snapshotKey(prev);
    return prev;
  }

  redo(current: GraphDoc): GraphDoc | null {
    if (!this.future.length) return null;
    this.past.push(cloneDoc(current));
    const next = this.future.pop()!;
    this.lastKey = snapshotKey(next);
    return next;
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
