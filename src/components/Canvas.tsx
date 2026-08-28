"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NODE_TYPES, nodeDef, portAccepts } from "@/lib/nodes";
import type {
  FlowNodeData,
  NodeData,
  NodeOutput,
  RunEvent,
  RunSettings,
} from "@/lib/types";
import { hasUsableProvider, loadSettings, saveSettings } from "@/lib/settings";
import { ModelCatalogProvider, useModelCatalog } from "@/lib/model-catalog";
import { FlowNode } from "./FlowNode";
import { DND_MIME, Palette } from "./Palette";
import { PlayBar } from "./PlayBar";
import { RunsPanel } from "./RunsPanel";
import { SettingsModal } from "./SettingsModal";

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
  const [showMini, setShowMini] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [books, setBooks] = useState<
    { id: string; title: string; updatedAt?: string | number }[]
  >([]);
  // provider credentials (local) + what the server already has (.env)
  const [settings, setSettings] = useState<RunSettings>(() => ({
    providers: {},
  }));
  const [env, setEnv] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [onboardDismissed, setOnboardDismissed] = useState(false);
  const [booted, setBooted] = useState(false);
  // live model catalogs from each configured provider
  const { catalog, reload: reloadCatalog } = useModelCatalog(settings, env);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // last known outputs per node — feeds single-node runs and survives re-renders
  const outputsRef = useRef<Record<string, NodeOutput[]>>({});
  const rf = useReactFlow();

  // ------- load local settings + server env flags on mount -------
  useEffect(() => {
    let alive = true;
    (async () => {
      const local = loadSettings();
      let cfg: { envProviders?: Record<string, boolean> } = {};
      try {
        cfg = await fetch("/api/config").then((r) => r.json());
      } catch {
        /* server unreachable — treat as env-less */
      }
      if (!alive) return;
      setSettings(local);
      setEnv(cfg.envProviders ?? {});
      setOnboardDismissed(
        window.localStorage.getItem("flowbook.onboarded") === "1",
      );
      setBooted(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ------- load latest graph + workbook list on mount -------
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/graphs");
      const { graphs } = await res.json();
      setBooks(
        (graphs ?? []).map((g: { id: string; title: string; updatedAt?: string }) => ({
          id: g.id,
          title: g.title,
          updatedAt: g.updatedAt,
        })),
      );
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
          provider: n.data.provider,
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

  const refreshBooks = useCallback(async () => {
    const res = await fetch("/api/graphs");
    const { graphs } = await res.json();
    setBooks(
      (graphs ?? []).map((g: { id: string; title: string; updatedAt?: string }) => ({
        id: g.id,
        title: g.title,
        updatedAt: g.updatedAt,
      })),
    );
  }, []);

  const save = useCallback(
    async (manual = false) => {
      const body = { id: graphId, title, graph: doc };
      if (graphId) {
        await fetch("/api/graphs", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const res = await fetch("/api/graphs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (j.graph?.id) setGraphId(j.graph.id);
      }
      setDirty(false);
      setSaved(new Date().toLocaleTimeString());
      refreshBooks();
      if (manual) setTimeout(() => setSaved(null), 2000);
    },
    [graphId, title, doc, refreshBooks],
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

  // ------- add node (click palette or drag onto canvas) -------
  const addAt = useCallback(
    (type: string, x: number, y: number) => {
      const def = nodeDef(type);
      if (!def) return;
      const id = `n${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 5)}`;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: "flow",
          position: { x, y },
          data: {
            kind: type,
            label: def.label,
            model: def.models?.[0]?.id,
          },
        },
      ]);
      touch();
    },
    [setNodes, touch],
  );

  const addNode = useCallback(
    (type: string) => {
      const c = rf.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      addAt(type, c.x - 130 + (Math.random() - 0.5) * 90, c.y - 40 + (Math.random() - 0.5) * 70);
    },
    [addAt, rf],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DND_MIME);
      if (!type) return;
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addAt(type, p.x - 132, p.y - 16);
    },
    [addAt, rf],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  // ------- run -------
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const [runsTick, setRunsTick] = useState(0);

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
        graphId: graphId ?? undefined,
        only,
        cached: outputsRef.current,
        // local credentials ride along; server .env stays the fallback
        settings,
      };
      const targets = only ? [only] : nodesRef.current.map((n) => n.id);
      setNodes((ns) =>
        ns.map((n) =>
          targets.includes(n.id)
            ? {
                ...n,
                data: {
                  ...n.data,
                  runStatus: "queued",
                  runError: undefined,
                  streamingText: undefined,
                },
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
            if (ev.type === "delta") {
              setNodes((ns) =>
                ns.map((n) =>
                  n.id === ev.nodeId
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          streamingText: (n.data.streamingText ?? "") + ev.text,
                        },
                      }
                    : n,
                ),
              );
              continue;
            }
            if (ev.type === "run") {
              if (ev.status === "done" || ev.status === "error")
                setRunsTick((t) => t + 1); // refresh run history
              continue;
            }
            // node event
            setNodes((ns) =>
              ns.map((n) =>
                n.id === ev.nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        runStatus: ev.status,
                        runError: ev.error,
                        outputs: ev.outputs ?? n.data.outputs,
                        runUsage: ev.usage ?? n.data.runUsage,
                        streamingText:
                          ev.status === "done" || ev.status === "error"
                            ? undefined
                            : n.data.streamingText,
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
    [setNodes, settings, graphId],
  );

  // Double-click runs a node — but not when the click lands inside an
  // editor/control (selecting a word in a prompt, toggling media controls),
  // which triggered accidental runs.
  const onNodeDoubleClick = useCallback(
    (e: MouseEvent, n: FN) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, button, label, video, audio"))
        return;
      run(n.id);
    },
    [run],
  );

  // ------- workbooks: open another / start a new one -------
  const openBook = useCallback(
    async (id: string) => {
      if (id === graphId || running) return;
      const res = await fetch("/api/graphs");
      const { graphs } = await res.json();
      const g = (graphs ?? []).find((x: { id: string }) => x.id === id);
      if (!g) return;
      if (dirty) await save(); // flush pending changes of the current book
      setGraphId(g.id);
      setTitle(g.title);
      setNodes(
        (g.graph?.nodes ?? []).map(
          (n: { id: string; position: { x: number; y: number }; data: FlowNodeData }) =>
            ({ id: n.id, type: "flow", position: n.position, data: n.data }) as FN,
        ),
      );
      setEdges(g.graph?.edges ?? []);
      outputsRef.current = {}; // cached results are per-workbook
      setDirty(false); // freshly loaded doc must not re-trigger autosave
      if (g.graph?.viewport)
        requestAnimationFrame(() =>
          rf.setViewport(g.graph.viewport, { duration: 0 }),
        );
    },
    [graphId, running, dirty, save, rf, setNodes, setEdges],
  );

  const newBook = useCallback(() => {
    if (running) return;
    setGraphId(null); // next autosave POSTs a fresh workbook
    setTitle("Untitled");
    const seed = starterGraph();
    setNodes(seed.nodes);
    setEdges(seed.edges);
    outputsRef.current = {};
    setDirty(true);
    rf.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
  }, [running, rf, setNodes, setEdges]);

  // per-node run (▶ button in node header)
  useEffect(() => {
    const onRunNode = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail;
      run(nodeId);
    };
    window.addEventListener("flowbook:run-node", onRunNode);
    return () => window.removeEventListener("flowbook:run-node", onRunNode);
  }, [run]);

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

  // ------- live edges: dashes flow while either end is running -------
  const statusOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of nodes) m[n.id] = n.data.runStatus ?? "idle";
    return m;
  }, [nodes]);

  const styledEdges = useMemo(
    () =>
      edges.map((e) =>
        statusOf[e.source] === "running" || statusOf[e.target] === "running"
          ? { ...e, className: "fb-edge-live" }
          : e,
      ),
    [edges, statusOf],
  );

  return (
    <ModelCatalogProvider value={catalog}>
    <div className="flex h-dvh w-full flex-col bg-canvas">
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
        books={books}
        activeId={graphId}
        onOpen={(id) => openBook(id)}
        onNew={() => newBook()}
        onSettings={() => setShowSettings(true)}
      />
      <div className="relative flex-1" onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow<FN>
          nodes={nodes}
          edges={styledEdges}
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
          onNodeDoubleClick={onNodeDoubleClick}
          defaultEdgeOptions={{ type: "smoothstep" }}
          fitView
          fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
          minZoom={0.05}
          maxZoom={4}
          colorMode="dark"
          zoomOnDoubleClick={false}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.3}
            color="#191b21"
          />
          {showMini && (
            <MiniMap
              pannable
              zoomable
              position="top-right"
              maskColor="rgba(9,10,13,0.75)"
              style={{
                background: "#101218",
                border: "1px solid #23252e",
                borderRadius: 10,
                marginTop: 36,
                marginRight: 12,
                width: 160,
                height: 110,
              }}
            />
          )}
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <div className="flex items-center gap-2">
              <RunsToggle
                open={showRuns}
                onToggle={() => setShowRuns((v) => !v)}
              />
              <button
                onClick={() => setShowMini((v) => !v)}
                title={showMini ? "Hide minimap" : "Show minimap"}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur transition-colors ${
                  showMini
                    ? "border-line2 bg-card text-ink"
                    : "border-line bg-card/80 text-faint hover:text-muted"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="4" y="5" width="3" height="2" rx="0.6" fill="currentColor" />
                  <rect x="8" y="8.5" width="2.5" height="2" rx="0.6" fill="currentColor" />
                </svg>
              </button>
            </div>
          </Panel>
          {nodes.length === 0 && (
            <Panel position="top-center">
              <div className="fb-pop rounded-full border border-line bg-card/80 px-4 py-1.5 text-[11.5px] text-muted backdrop-blur">
                Empty workbook — drag a node in from the panel.
              </div>
            </Panel>
          )}
        </ReactFlow>
        <Palette onAdd={addNode} defs={NODE_TYPES} />
        {showRuns && (
          <div className="fb-pop absolute bottom-3 right-3 z-10 max-h-[50vh] w-80 overflow-auto rounded-xl border border-line bg-card/95 shadow-2xl backdrop-blur">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-card/95 px-3 py-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
                Run history
              </span>
              <button
                onClick={() => setShowRuns(false)}
                className="flex h-4 w-4 items-center justify-center rounded text-faint transition-colors hover:bg-white/5 hover:text-muted"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                  <path d="M1.5 1.5 6.5 6.5M6.5 1.5 1.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <RunsPanel graphId={graphId} refreshKey={runsTick} />
          </div>
        )}
      </div>

      {(showSettings ||
        (booted && !hasUsableProvider(settings, env) && !onboardDismissed)) && (
        <SettingsModal
          settings={settings}
          env={env}
          onboarding={
            booted &&
            !hasUsableProvider(settings, env) &&
            !onboardDismissed &&
            !showSettings
          }
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            window.localStorage.setItem("flowbook.onboarded", "1");
            setOnboardDismissed(true);
            reloadCatalog(); // refresh provider model lists
          }}
          onClose={() => {
            setShowSettings(false);
            if (!hasUsableProvider(settings, env))
              window.localStorage.setItem("flowbook.onboarded", "1");
            setOnboardDismissed(true);
          }}
        />
      )}
    </div>
    </ModelCatalogProvider>
  );
}

function RunsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={open ? "Hide run history" : "Show run history"}
      className={`flex h-7 items-center gap-1.5 rounded-lg border px-2 backdrop-blur transition-colors ${
        open
          ? "border-line2 bg-card text-ink"
          : "border-line bg-card/80 text-faint hover:text-muted"
      }`}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M1.5 6h9M6 1.5l4.5 4.5L6 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(45 6 6)" opacity="0" />
        <circle cx="3" cy="6" r="1.1" fill="currentColor" />
        <circle cx="6" cy="6" r="1.1" fill="currentColor" />
        <circle cx="9" cy="6" r="1.1" fill="currentColor" />
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em]">Runs</span>
    </button>
  );
}

function starterGraph(): { nodes: FN[]; edges: Edge[] } {
  const b = Date.now().toString(36);
  return {
    nodes: [
      {
        id: `t${b}`,
        type: "flow",
        position: { x: 60, y: 150 },
        data: {
          kind: "text",
          label: "Text",
          text: "Paste an article here, then hit Run.",
        },
      },
      {
        id: `l${b}`,
        type: "flow",
        position: { x: 400, y: 140 },
        data: {
          kind: "llm",
          label: "AI Text",
          model: "stealth/ox-alpha",
          prompt: "Summarize the following article in 5 bullet points:",
        },
      },
      {
        id: `o${b}`,
        type: "flow",
        position: { x: 750, y: 120 },
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
