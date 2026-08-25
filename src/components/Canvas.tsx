"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NODE_TYPES, nodeDef, portAccepts } from "@/lib/nodes";
import type { NodeData, NodeOutput, RunEvent } from "@/lib/types";
import { FlowNode } from "./FlowNode";
import { Palette } from "./Palette";
import { PlayBar } from "./PlayBar";

export type FlowNodeData = NodeData & {
  runStatus?: "idle" | "queued" | "running" | "done" | "error";
  runError?: string;
};

type FN = Node<FlowNodeData, "flow">;

const nodeTypes = { flow: FlowNode };

export function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FN>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [graphId, setGraphId] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled");
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rf = useReactFlow();

  // ------- load latest graph on mount -------
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/graphs");
      const { graphs } = await res.json();
      if (graphs?.length) {
        const g = graphs[0];
        setGraphId(g.id);
        setTitle(g.title);
        setNodes(
          (g.graph?.nodes ?? []).map(
            (n: { id: string; position: { x: number; y: number }; data: FlowNodeData }) =>
              ({
                id: n.id,
                type: "flow",
                position: n.position,
                data: n.data,
              }) as FN,
          ),
        );
        setEdges(g.graph?.edges ?? []);
        if (g.graph?.viewport)
          setTimeout(
            () => rf.setViewport(g.graph.viewport, { duration: 0 }),
            80,
          );
      } else {
        const seed = starterGraph();
        setNodes(seed.nodes);
        setEdges(seed.edges);
        setDirty(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- autosave (debounced) -------
  const doc = useMemo(
    () => ({
      nodes: nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: {
          kind: n.data.kind,
          label: n.data.label,
          text: n.data.text,
          prompt: n.data.prompt,
          model: n.data.model,
          voice: n.data.voice,
          artifactId: n.data.artifactId,
        } as FlowNodeData,
      })),
      edges,
      viewport: rf.getViewport(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges],
  );

  const save = useCallback(
    async (manual = false) => {
      const body = { id: graphId, title, graph: doc };
      let res: Response;
      if (graphId) {
        res = await fetch("/api/graphs", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/graphs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (j.graph?.id) setGraphId(j.graph.id);
      }
      setDirty(false);
      setSaved(new Date().toLocaleTimeString());
      if (manual) setTimeout(() => setSaved(null), 2000);
    },
    [graphId, title, doc],
  );

  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, doc, save]);

  const touch = useCallback(() => setDirty(true), []);

  // ------- node updates from FlowNode (custom events) -------
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const { nodeId, patch } = (e as CustomEvent).detail;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, ...(patch as Partial<FlowNodeData>) } }
            : n,
        ),
      );
      touch();
    };
    const onArtifact = (e: Event) => {
      const { nodeId, artifactId } = (e as CustomEvent).detail;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, artifactId } }
            : n,
        ),
      );
      touch();
    };
    window.addEventListener("flowbook:update", onUpdate);
    window.addEventListener("flowbook:set-artifact", onArtifact);
    return () => {
      window.removeEventListener("flowbook:update", onUpdate);
      window.removeEventListener("flowbook:set-artifact", onArtifact);
    };
  }, [setNodes, touch]);

  // ------- connections -------
  const isValidConnection = useCallback<IsValidConnection>(
    (conn) => {
      const src = nodes.find((n) => n.id === conn.source);
      const tgt = nodes.find((n) => n.id === conn.target);
      if (!src || !tgt || src.id === tgt.id) return false;
      const sDef = nodeDef(src.data.kind);
      const tDef = nodeDef(tgt.data.kind);
      const sPort = sDef?.outputs.find((p) => p.id === conn.sourceHandle);
      const tPort = tDef?.inputs.find((p) => p.id === conn.targetHandle);
      if (!sPort || !tPort) return false;
      return portAccepts(tPort.type, sPort.type);
    },
    [nodes],
  );

  const onConnect = useCallback(
    (c: Connection | Edge) => {
      setEdges((eds) =>
        addEdge({ ...c }, eds)
          .filter(
            (e, i, arr) =>
              arr.findIndex(
                (x) =>
                  x.source === e.source &&
                  x.target === e.target &&
                  x.sourceHandle === e.sourceHandle &&
                  x.targetHandle === e.targetHandle,
              ) === i,
          )
          .map((e) => ({ ...e, type: "smoothstep" })),
      );
      touch();
    },
    [setEdges, touch],
  );

  // ------- add node -------
  const addNode = useCallback(
    (type: string) => {
      const def = nodeDef(type);
      if (!def) return;
      const id = `n${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 5)}`;
      const center = rf.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const jitter = () => (Math.random() - 0.5) * 140;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: "flow",
          position: { x: center.x + jitter(), y: center.y + jitter() },
          data: {
            kind: type,
            label: def.label,
            model: def.models?.[0]?.id,
          },
        },
      ]);
      touch();
    },
    [setNodes, touch, rf],
  );

  // ------- run -------
  const outputsRef = useRef<Record<string, NodeOutput[]>>({});
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const run = useCallback(
    async (only?: string) => {
      setRunning(true);
      const payload = {
        graph: {
          nodes: nodesRef.current.map((n) => ({
            id: n.id,
            position: n.position,
            data: n.data as NodeData,
          })),
          edges: edgesRef.current,
        },
        only,
        cached: outputsRef.current,
      };
      const targets = only ? [only] : nodesRef.current.map((n) => n.id);
      setNodes((ns) =>
        ns.map((n) =>
          targets.includes(n.id)
            ? {
                ...n,
                data: { ...n.data, runStatus: "queued", runError: undefined },
              }
            : n,
        ),
      );
      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as RunEvent;
            setNodes((ns) =>
              ns.map((n) =>
                n.id === ev.nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        runStatus: ev.status,
                        runError: ev.error,
                        outputs: ev.outputs,
                      },
                    }
                  : n,
              ),
            );
            if (ev.status === "done" && ev.outputs)
              outputsRef.current[ev.nodeId] = ev.outputs;
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setRunning(false);
      }
    },
    [setNodes],
  );

  // cmd/ctrl+s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  return (
    <div className="flex h-dvh w-full flex-col bg-[#0d0e12]">
      <PlayBar
        title={title}
        onTitle={(t: string) => {
          setTitle(t);
          touch();
        }}
        running={running}
        onRun={() => run()}
        onSave={() => save(true)}
        saved={saved}
        dirty={dirty}
      />
      <div className="relative flex-1">
        <ReactFlow<FN>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(c) => {
            onNodesChange(c);
            if (c.some((ch) => ch.type === "position" || ch.type === "remove"))
              touch();
          }}
          onEdgesChange={(c) => {
            onEdgesChange(c);
            if (c.some((ch) => ch.type === "remove")) touch();
          }}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeDoubleClick={(_, n) => run(n.id)}
          defaultEdgeOptions={{ type: "smoothstep" }}
          fitView
          minZoom={0.05}
          maxZoom={4}
          colorMode="dark"
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.4}
            color="#1d1f27"
          />
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(10,11,14,0.75)"
            style={{ background: "#101218", border: "1px solid #23262f" }}
          />
          <Controls
            showInteractive={false}
            className="!border !border-[#23262f] !bg-[#14161c] [&>button]:!border-none [&>button]:!bg-[#14161c] [&>button]:!fill-[#c9ccd4]"
          />
        </ReactFlow>
        <Palette onAdd={addNode} defs={NODE_TYPES} />
      </div>
    </div>
  );
}

export type FlowNodeProps = NodeProps<FN>;

function starterGraph(): { nodes: FN[]; edges: Edge[] } {
  const b = Date.now().toString(36);
  return {
    nodes: [
      {
        id: `t${b}`,
        type: "flow",
        position: { x: 40, y: 160 },
        data: {
          kind: "text",
          label: "Text",
          text: "Paste an article here, then hit Run.",
        },
      },
      {
        id: `l${b}`,
        type: "flow",
        position: { x: 380, y: 160 },
        data: {
          kind: "llm",
          label: "AI Text",
          model: "deepseek/deepseek-v4-pro-0813",
          prompt: "Summarize the following article in 5 bullet points:",
        },
      },
      {
        id: `o${b}`,
        type: "flow",
        position: { x: 740, y: 160 },
        data: { kind: "out.text", label: "Text Out" },
      },
    ],
    edges: [
      {
        id: `e1${b}`,
        source: `t${b}`,
        sourceHandle: "out",
        target: `l${b}`,
        targetHandle: "in",
        type: "smoothstep",
      },
      {
        id: `e2${b}`,
        source: `l${b}`,
        sourceHandle: "out",
        target: `o${b}`,
        targetHandle: "in",
        type: "smoothstep",
      },
    ],
  };
}
