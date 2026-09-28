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
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { NODE_TYPES, matchPorts, nodeDef, portAccepts } from "@/lib/nodes";
import type {
  FlowNodeData,
  GraphDoc,
  NodeData,
  NodeOutput,
  RunEvent,
} from "@/lib/types";
import { ModelCatalogProvider, useModelCatalog } from "@/lib/model-catalog";
import { starterGraph } from "@/lib/starter";
import { downstreamIds } from "@/lib/graph";
import { layoutGraph } from "@/lib/layout";
import { watchRunEvents } from "@/lib/runs/watch";
import { fmtUsd } from "@/lib/format";
import { useSettings } from "@/lib/use-settings";
import { GraphHistory } from "@/lib/history";
import { parsePortable, remapPortable, toPortable } from "@/lib/portable";
import { AssistantPanel } from "./AssistantPanel";
import { FlowNode } from "./FlowNode";
import { DND_MIME, Palette } from "./Palette";
import { PlayBar } from "./PlayBar";
import { RunsPanel } from "./RunsPanel";
import { SettingsModal } from "./SettingsModal";
import { StatusScreen } from "./StatusScreen";
import { MiniConsole, type ConsoleLine } from "./MiniConsole";
import { PublishTemplate } from "./PublishTemplate";
import { toast } from "./Toast";
import { readJson } from "@/lib/http";
import { useTheme } from "./ThemeProvider";

type FN = Node<FlowNodeData, "flow">;

const nodeTypes = { flow: FlowNode };

export function Canvas({
  graphId,
  startAssistant = false,
  shareToken,
  readOnly = false,
}: {
  graphId: string;
  startAssistant?: boolean;
  shareToken?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [nodes, setNodes, onNodesChange] = useNodesState<FN>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [title, setTitle] = useState("Untitled");
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [showMini, setShowMini] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [showAssistant, setShowAssistant] = useState(startAssistant);
  const [showPublish, setShowPublish] = useState(false);
  const [books, setBooks] = useState<
    { id: string; title: string; updatedAt?: string | number }[]
  >([]);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const settingsApi = useSettings();
  const theme = useTheme();
  const historyRef = useRef(new GraphHistory());
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runCostUsd, setRunCostUsd] = useState<number | null>(null);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("flowbook.console.collapsed") === "1")
        setConsoleCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "flowbook.console.collapsed",
        consoleCollapsed ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [consoleCollapsed]);
  const { catalog, reload: reloadCatalog } = useModelCatalog(
    settingsApi.settings,
    settingsApi.env,
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputsRef = useRef<Record<string, NodeOutput[]>>({});
  const inflightRef = useRef(new Set<AbortController>());
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const stoppingRef = useRef(false);
  const watchAbortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const attachRunRef = useRef<(id: string) => Promise<void>>(async () => {});
  const rf = useReactFlow();
  activeRunIdRef.current = activeRunId;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
        shareToken
          ? `/api/graphs/${graphId}?share=${encodeURIComponent(shareToken)}`
          : `/api/graphs/${graphId}`,
      );
        if (res.status === 404) {
          if (alive) setMissing(true);
          return;
        }
        const { graph: g } = await readJson<{ graph?: { id: string; title: string; graph?: { nodes?: FN[]; edges?: Edge[]; viewport?: { x: number; y: number; zoom: number } } } }>(res);
        if (!alive || !g) return;
        setTitle(g.title);
        const loaded = (g.graph?.nodes ?? []).map(
          (n: {
            id: string;
            position: { x: number; y: number };
            data: FlowNodeData;
          }) =>
            ({
              id: n.id,
              type: "flow",
              position: n.position,
              data: n.data,
            }) as FN,
        );
        setNodes(loaded);
        setEdges(
          (g.graph?.edges ?? []).map((e: Edge) => ({
            ...e,
            type: e.type ?? "smoothstep",
          })),
        );
        outputsRef.current = Object.fromEntries(
          loaded
            .filter((n) => n.data.outputs?.length)
            .map((n) => [n.id, n.data.outputs as NodeOutput[]]),
        );
        setDirty(false);
        setReady(true);
        const viewport = g.graph?.viewport;
        if (viewport)
          setTimeout(() => rf.setViewport(viewport, { duration: 0 }), 80);
      } catch {
        if (alive) {
          toast("Couldn’t load this workbook.", "error");
          setMissing(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId]);

  useEffect(() => {
    return () => {
      watchAbortRef.current?.abort();
    };
  }, [graphId]);

  useEffect(() => {
    if (!ready || readOnly) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/runs?graphId=${graphId}&limit=1`);
        const j = await readJson<{
          runs?: { id: string; status: string; totalCostUsd: number }[];
        }>(res);
        const latest = j.runs?.[0];
        if (!alive || !latest) return;
        if (latest.totalCostUsd)
          setRunCostUsd(latest.totalCostUsd / 1e6);
        if (latest.status === "queued" || latest.status === "running") {
          await attachRunRef.current(latest.id);
          return;
        }
        const detail = await fetch(`/api/runs?runId=${latest.id}`);
        const d = await readJson<{
          nodes?: {
            nodeId: string;
            status: string;
            output: NodeOutput[] | null;
            costUsd: number;
            error: string | null;
          }[];
        }>(detail);
        if (!alive || !d.nodes?.length) return;
        setNodes((ns) =>
          ns.map((n) => {
            const row = d.nodes!.find((r) => r.nodeId === n.id);
            if (!row) return n;
            if (n.data.outputs?.length) return n;
            const outputs = (row.output ?? undefined) as NodeOutput[] | undefined;
            if (outputs?.length) outputsRef.current[n.id] = outputs;
            return {
              ...n,
              data: {
                ...n.data,
                runStatus: row.status as FlowNodeData["runStatus"],
                runError: row.error ?? undefined,
                outputs: outputs ?? n.data.outputs,
                runUsage: row.costUsd
                  ? { costUsd: row.costUsd / 1e6 }
                  : n.data.runUsage,
              },
            };
          }),
        );
      } catch {
        /* reconnect is best-effort */
      }
    })();
    return () => {
      alive = false;
    };
    // attachRun is stable enough for mount-time reconnect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, graphId, readOnly]);

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
          size: n.data.size,
          aspectRatio: n.data.aspectRatio,
          duration: n.data.duration,
          resolution: n.data.resolution,
          artifactId: n.data.artifactId,
          skillId: n.data.skillId,
          outputs: n.data.outputs,
          runStatus: n.data.runStatus,
          runError: n.data.runError,
          runUsage: n.data.runUsage,
        } as FlowNodeData,
      })),
      edges,
      viewport: rf.getViewport(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges],
  );

  const refreshBooks = useCallback(async () => {
    try {
      const res = await fetch("/api/graphs");
      const { graphs } = await readJson<{
        graphs?: { id: string; title: string; updatedAt?: string }[];
      }>(res);
      setBooks(
        (graphs ?? []).map(
          (g: { id: string; title: string; updatedAt?: string }) => ({
            id: g.id,
            title: g.title,
            updatedAt: g.updatedAt,
          }),
        ),
      );
    } catch {
      /* list is non-critical */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refreshBooks(), 0);
    return () => clearTimeout(t);
  }, [refreshBooks]);

  const save = useCallback(
    async (manual = false) => {
      try {
        const res = await fetch("/api/graphs", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: graphId, title, graph: doc }),
        });
        if (!res.ok) throw new Error("Save failed");
        setDirty(false);
        setSaved(new Date().toLocaleTimeString());
        refreshBooks();
        if (manual) setTimeout(() => setSaved(null), 2000);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Save failed", "error");
      }
    },
    [graphId, title, doc, refreshBooks],
  );

  useEffect(() => {
    if (!dirty || !ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, doc, save, ready]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void saveRef.current();
    };
  }, [graphId]);

  const applyDoc = useCallback(
    (next: GraphDoc, markDirty = true) => {
      setNodes(
        next.nodes.map(
          (n) =>
            ({
              id: n.id,
              type: "flow",
              position: n.position,
              data: n.data,
            }) as FN,
        ),
      );
      setEdges(next.edges.map((e) => ({ ...e, type: "smoothstep" })));
      if (markDirty) setDirty(true);
    },
    [setNodes, setEdges],
  );

  const snapshotNow = useCallback(() => {
    historyRef.current.remember({
      nodes: nodesRef.current.map((n) => ({
        id: n.id,
        type: "flow",
        position: n.position,
        data: n.data,
      })),
      edges: edgesRef.current.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? null,
        target: e.target,
        targetHandle: e.targetHandle ?? null,
      })),
    });
  }, []);

  const arrange = useCallback(() => {
    snapshotNow();
    const next = layoutGraph({
      nodes: nodesRef.current.map((n) => ({
        id: n.id,
        type: "flow",
        position: n.position,
        data: n.data,
      })),
      edges: edgesRef.current.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? null,
        target: e.target,
        targetHandle: e.targetHandle ?? null,
      })),
    });
    applyDoc(next);
    requestAnimationFrame(() =>
      rf.fitView({ padding: 0.22, duration: 400, maxZoom: 1 }),
    );
  }, [applyDoc, snapshotNow, rf]);

  const touch = useCallback(() => {
    if (readOnly) return;
    snapshotNow();
    setDirty(true);
  }, [readOnly, snapshotNow]);

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
          n.id === nodeId ? { ...n, data: { ...n.data, artifactId } } : n,
        ),
      );
      touch();
    };
    const onRemove = (e: Event) => {
      if (readOnly) return;
      const { nodeId } = (e as CustomEvent).detail as { nodeId: string };
      snapshotNow();
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) =>
        es.filter((ed) => ed.source !== nodeId && ed.target !== nodeId),
      );
      setDirty(true);
      toast("Node deleted.", "info", {
        label: "Undo",
        onClick: () => {
          const prev = historyRef.current.undo({
            nodes: nodesRef.current.map((n) => ({
              id: n.id,
              type: "flow",
              position: n.position,
              data: n.data,
            })),
            edges: edgesRef.current.map((ed) => ({
              id: ed.id,
              source: ed.source,
              sourceHandle: ed.sourceHandle ?? null,
              target: ed.target,
              targetHandle: ed.targetHandle ?? null,
            })),
          });
          if (prev) applyDoc(prev);
        },
      });
    };
    const onDuplicate = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail as { nodeId: string };
      setNodes((ns) => {
        const src = ns.find((n) => n.id === nodeId);
        if (!src) return ns;
        const id = `n${Date.now().toString(36)}${Math.random()
          .toString(36)
          .slice(2, 5)}`;
        return [
          ...ns,
          {
            ...src,
            id,
            selected: false,
            position: { x: src.position.x + 40, y: src.position.y + 40 },
            data: {
              ...src.data,
              runStatus: undefined,
              runError: undefined,
              outputs: undefined,
              streamingText: undefined,
            },
          },
        ];
      });
      touch();
    };
    const onExpandSkill = (e: Event) => {
      if (readOnly) return;
      const { nodeId } = (e as CustomEvent).detail as { nodeId: string };
      const src = nodesRef.current.find((n) => n.id === nodeId);
      if (!src || src.data.kind !== "skill") return;
      const stamp = Date.now().toString(36);
      const llmId = `n${stamp}l`;
      const imgId = `n${stamp}i`;
      const llmDef = nodeDef("llm");
      const imgDef = nodeDef("image.gen");
      if (!llmDef || !imgDef) return;
      snapshotNow();
      setNodes((ns) => [
        ...ns,
        {
          id: llmId,
          type: "flow",
          position: { x: src.position.x + 340, y: src.position.y },
          data: {
            kind: "llm",
            label: llmDef.label,
            model: llmDef.models?.[0]?.id,
            skillId: src.data.skillId,
            prompt: "Turn the skill into a concrete image brief for the next node.",
          },
        },
        {
          id: imgId,
          type: "flow",
          position: { x: src.position.x + 680, y: src.position.y },
          data: {
            kind: "image.gen",
            label: imgDef.label,
            model: imgDef.models?.[0]?.id,
          },
        },
      ]);
      setEdges((es) => {
        const next = [...es];
        const a = matchPorts("skill", "llm");
        const b = matchPorts("llm", "image.gen");
        if (a) {
          next.push({
            id: `e${stamp}a`,
            source: nodeId,
            target: llmId,
            sourceHandle: a.sourceHandle,
            targetHandle: a.targetHandle,
            type: "smoothstep",
          });
        }
        if (b) {
          next.push({
            id: `e${stamp}b`,
            source: llmId,
            target: imgId,
            sourceHandle: b.sourceHandle,
            targetHandle: b.targetHandle,
            type: "smoothstep",
          });
        }
        return next;
      });
      setDirty(true);
    };
    window.addEventListener("flowbook:update", onUpdate);
    window.addEventListener("flowbook:set-artifact", onArtifact);
    window.addEventListener("flowbook:remove-node", onRemove);
    window.addEventListener("flowbook:duplicate-node", onDuplicate);
    window.addEventListener("flowbook:expand-skill", onExpandSkill);
    return () => {
      window.removeEventListener("flowbook:update", onUpdate);
      window.removeEventListener("flowbook:set-artifact", onArtifact);
      window.removeEventListener("flowbook:remove-node", onRemove);
      window.removeEventListener("flowbook:duplicate-node", onDuplicate);
      window.removeEventListener("flowbook:expand-skill", onExpandSkill);
    };
  }, [setNodes, setEdges, touch]);

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
      addAt(
        type,
        c.x - 130 + (Math.random() - 0.5) * 90,
        c.y - 40 + (Math.random() - 0.5) * 70,
      );
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

  const [runsTick, setRunsTick] = useState(0);

  const resetInFlight = useCallback(
    (status: "idle" | "error", error?: string, ids?: string[]) => {
      const mine = ids ? new Set(ids) : null;
      setNodes((ns) =>
        ns.map((n) =>
          (n.data.runStatus === "queued" || n.data.runStatus === "running") &&
          (!mine || mine.has(n.id))
            ? {
                ...n,
                data: {
                  ...n.data,
                  runStatus: status,
                  runError: error,
                  streamingText: undefined,
                },
              }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const applyRunEvent = useCallback(
    (ev: RunEvent) => {
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
        return;
      }
      if (ev.type === "run") {
        if (ev.runId) {
          setActiveRunId(ev.runId);
          activeRunIdRef.current = ev.runId;
        }
        if (ev.status !== "started" && ev.usage?.totalCostUsd)
          setRunCostUsd(ev.usage.totalCostUsd);
        setConsoleLines((xs) => [
          ...xs.slice(-80),
          {
            seq: xs.length + 1,
            type: "run",
            level: ev.status === "error" ? "error" : "info",
            status: ev.status,
            ts: ev.ts,
          },
        ]);
        if (
          ev.status === "done" ||
          ev.status === "error" ||
          ev.status === "cancelled" ||
          ev.status === "timed_out"
        ) {
          setRunsTick((t) => t + 1);
          setDirty(true);
        }
        return;
      }
      setConsoleLines((xs) => [
        ...xs.slice(-80),
        {
          seq: xs.length + 1,
          type: "node",
          level: ev.status === "error" ? "error" : "info",
          nodeId: ev.nodeId,
          status: ev.status,
          message: ev.error,
          ts: ev.ts,
        },
      ]);
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
                  runUsage:
                    ev.status === "running" || ev.status === "queued"
                      ? undefined
                      : (ev.usage ?? n.data.runUsage),
                  streamingText:
                    ev.status === "running" || ev.status === "queued"
                      ? n.data.streamingText
                      : undefined,
                },
              }
            : n,
        ),
      );
      if (ev.status === "done" && ev.outputs)
        outputsRef.current[ev.nodeId] = ev.outputs;
      if (ev.status === "done" && ev.usage?.costUsd)
        setRunCostUsd((c) => (c ?? 0) + (ev.usage?.costUsd ?? 0));
    },
    [setNodes],
  );

  const attachRun = useCallback(
    async (runId: string) => {
      watchAbortRef.current?.abort();
      const ac = new AbortController();
      watchAbortRef.current = ac;
      inflightRef.current.add(ac);
      setActiveRunId(runId);
      activeRunIdRef.current = runId;
      setRunning(true);
      try {
        await watchRunEvents(runId, { signal: ac.signal, onEvent: applyRunEvent });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          if (stoppingRef.current) {
            resetInFlight("idle");
            toast("Run cancelled.");
          }
        } else {
          const msg = e instanceof Error ? e.message : "Run failed";
          resetInFlight("error", msg);
          toast(msg, "error");
        }
      } finally {
        inflightRef.current.delete(ac);
        if (watchAbortRef.current === ac) watchAbortRef.current = null;
        if (!inflightRef.current.size) {
          stoppingRef.current = false;
          setRunning(false);
        }
      }
    },
    [applyRunEvent, resetInFlight],
  );
  attachRunRef.current = attachRun;

  const run = useCallback(
    async (from?: string) => {
      stoppingRef.current = false;
      setRunCostUsd(null);
      setConsoleLines([]);
      const payload = {
        graph: {
          nodes: nodesRef.current.map((n) => ({
            id: n.id,
            position: n.position,
            data: n.data as NodeData,
          })),
          edges: edgesRef.current,
        },
        graphId,
        from,
        cached: outputsRef.current,
      };
      const targets = from
        ? downstreamIds(from, edgesRef.current)
        : nodesRef.current.map((n) => n.id);
      setNodes((ns) =>
        ns.map((n) =>
          targets.includes(n.id)
            ? {
                ...n,
                data: {
                  ...n.data,
                  runStatus: "queued" as const,
                  runError: undefined,
                  runUsage: undefined,
                  streamingText: undefined,
                },
              }
            : n,
        ),
      );
      setRunning(true);
      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await readJson<{ runId?: string; error?: string }>(res);
        if (!res.ok || !j.runId) {
          throw new Error(
            typeof j.error === "string" ? j.error : `Run failed (${res.status})`,
          );
        }
        await attachRun(j.runId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Run failed";
        resetInFlight("error", msg, targets);
        toast(msg, "error");
        setRunning(false);
      }
    },
    [setNodes, graphId, resetInFlight, attachRun],
  );

  const stop = useCallback(() => {
    stoppingRef.current = true;
    const id = activeRunIdRef.current;
    watchAbortRef.current?.abort();
    for (const ac of inflightRef.current) ac.abort();
    if (id) {
      void fetch(`/api/runs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
    }
  }, []);

  const onNodeDoubleClick = useCallback(
    (e: MouseEvent, n: FN) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, button, label, video, audio"))
        return;
      run(n.id);
    },
    [run],
  );

  const openBook = useCallback(
    async (id: string) => {
      if (id === graphId || running) return;
      if (dirty) await save();
      router.push(`/w/${id}`);
    },
    [graphId, running, dirty, save, router],
  );

  const newBook = useCallback(async () => {
    if (running) return;
    if (dirty) await save();
    try {
      const res = await fetch("/api/graphs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Untitled", graph: starterGraph() }),
      });
      const j = await readJson<{ graph?: { id: string }; error?: string }>(res);
      if (!res.ok || !j.graph?.id) throw new Error(j.error || "Create failed");
      router.push(`/w/${j.graph.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t create workbook.", "error");
    }
  }, [running, dirty, save, router]);

  useEffect(() => {
    const onRunNode = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail;
      run(nodeId);
    };
    window.addEventListener("flowbook:run-node", onRunNode);
    return () => window.removeEventListener("flowbook:run-node", onRunNode);
  }, [run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, [contenteditable=true]");
      if (meta && e.key === "s") {
        e.preventDefault();
        if (!readOnly) save(true);
      }
      if (meta && e.key === "z" && !e.shiftKey && !typing) {
        e.preventDefault();
        const prev = historyRef.current.undo({
          nodes: nodesRef.current.map((n) => ({
            id: n.id,
            type: "flow",
            position: n.position,
            data: n.data,
          })),
          edges: edgesRef.current.map((ed) => ({
            id: ed.id,
            source: ed.source,
            sourceHandle: ed.sourceHandle ?? null,
            target: ed.target,
            targetHandle: ed.targetHandle ?? null,
          })),
        });
        if (prev) applyDoc(prev);
      }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey)) && !typing) {
        e.preventDefault();
        const next = historyRef.current.redo({
          nodes: nodesRef.current.map((n) => ({
            id: n.id,
            type: "flow",
            position: n.position,
            data: n.data,
          })),
          edges: edgesRef.current.map((ed) => ({
            id: ed.id,
            source: ed.source,
            sourceHandle: ed.sourceHandle ?? null,
            target: ed.target,
            targetHandle: ed.targetHandle ?? null,
          })),
        });
        if (next) applyDoc(next);
      }
      if (meta && e.key === "c" && !typing) {
        const selected = nodesRef.current.filter((n) => n.selected);
        if (!selected.length) return;
        const pack = toPortable(
          {
            nodes: nodesRef.current.map((n) => ({
              id: n.id,
              type: "flow",
              position: n.position,
              data: n.data,
            })),
            edges: edgesRef.current.map((ed) => ({
              id: ed.id,
              source: ed.source,
              sourceHandle: ed.sourceHandle ?? null,
              target: ed.target,
              targetHandle: ed.targetHandle ?? null,
            })),
          },
          { nodeIds: selected.map((n) => n.id) },
        );
        void navigator.clipboard.writeText(JSON.stringify(pack, null, 2));
        toast("Copied nodes.", "ok");
      }
      if (meta && e.key === "v" && !typing && !readOnly) {
        void (async () => {
          const text = await navigator.clipboard.readText();
          const pack = parsePortable(text);
          if (!pack) return;
          snapshotNow();
          const incoming = remapPortable(pack, {
            x: 80 + Math.random() * 40,
            y: 80 + Math.random() * 40,
          });
          applyDoc({
            nodes: [
              ...nodesRef.current.map((n) => ({
                id: n.id,
                type: "flow" as const,
                position: n.position,
                data: n.data,
              })),
              ...incoming.nodes,
            ],
            edges: [
              ...edgesRef.current.map((ed) => ({
                id: ed.id,
                source: ed.source,
                sourceHandle: ed.sourceHandle ?? null,
                target: ed.target,
                targetHandle: ed.targetHandle ?? null,
              })),
              ...incoming.edges,
            ],
          });
          toast("Pasted nodes.", "ok");
        })();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, applyDoc, snapshotNow, readOnly]);

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

  if (missing) {
    return (
      <StatusScreen
        kicker="404"
        title="This workbook isn’t here"
        body="It may have been deleted, or the link is stale."
        action={
          <Link
            href="/"
            className="fb-btn-primary rounded-full px-4 py-2 text-[13px] font-medium"
          >
            Back to workbooks
          </Link>
        }
      />
    );
  }

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
          onStop={stop}
          onSave={() => save(true)}
          saved={saved}
          dirty={dirty}
          costLabel={fmtUsd(runCostUsd)}
          books={books}
          activeId={graphId}
          onOpen={(id) => openBook(id)}
          onNew={() => newBook()}
          onSettings={() => settingsApi.setShowSettings(true)}
          assistantOpen={showAssistant}
          onAssistant={() => setShowAssistant((v) => !v)}
          onPublish={readOnly ? undefined : () => setShowPublish(true)}
          onShare={
            readOnly
              ? undefined
              : async () => {
                  try {
                    const res = await fetch(`/api/graphs/${graphId}/share`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ permission: "view" }),
                    });
                    const j = await readJson<{ url?: string; error?: string }>(res);
                    if (!res.ok || !j.url) throw new Error(j.error || "Share failed");
                    const url = `${window.location.origin}${j.url}`;
                    await navigator.clipboard.writeText(url);
                    toast("Share link copied.", "ok");
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "Share failed", "error");
                  }
                }
          }
        />
        <div className="relative flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow<FN>
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            onNodesChange={(c) => {
              if (readOnly) return;
              onNodesChange(c);
              if (c.some((ch) => ch.type === "position" || ch.type === "remove"))
                touch();
            }}
            onEdgesChange={(c) => {
              if (readOnly) return;
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
            colorMode={theme.resolved}
            zoomOnDoubleClick={false}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.3}
              color="#1c1c1c"
            />
            {showMini && (
              <MiniMap
                pannable
                zoomable
                position="top-right"
                maskColor="rgba(9,9,9,0.75)"
                style={{
                  background: "#111111",
                  border: "1px solid #222222",
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
                  onClick={arrange}
                  title="Arrange nodes"
                  className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-card/80 px-2 text-faint backdrop-blur transition-colors hover:text-ink"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <rect x="1" y="1.5" width="4" height="3" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
                    <rect x="7" y="4" width="4" height="3" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
                    <rect x="1" y="7.5" width="4" height="3" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5 3h2M5 9h2" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em]">
                    Arrange
                  </span>
                </button>
                <button
                  onClick={() => setShowMini((v) => !v)}
                  title={showMini ? "Hide minimap" : "Show minimap"}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur transition-colors ${
                    showMini
                      ? "border-line2 bg-card text-ink"
                      : "border-line bg-card/80 text-faint hover:text-muted"
                  }`}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden
                  >
                    <rect
                      x="1.5"
                      y="1.5"
                      width="11"
                      height="11"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <rect x="4" y="5" width="3" height="2" rx="0.6" fill="currentColor" />
                    <rect
                      x="8"
                      y="8.5"
                      width="2.5"
                      height="2"
                      rx="0.6"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
            </Panel>
            {ready && nodes.length === 0 && (
              <Panel position="top-center">
                <div className="fb-pop rounded-full border border-line bg-card/80 px-4 py-1.5 text-[11.5px] text-muted backdrop-blur">
                  Empty workbook — drag a node in from the panel.
                </div>
              </Panel>
            )}
          </ReactFlow>
          {!readOnly && <Palette onAdd={addNode} defs={NODE_TYPES} />}
          <div className="absolute bottom-3 left-3 z-10 w-[min(420px,calc(100vw-1.5rem))]">
              <MiniConsole
                lines={consoleLines}
                runId={activeRunId}
                costUsd={runCostUsd}
                collapsed={consoleCollapsed}
                onToggle={() => setConsoleCollapsed((v) => !v)}
              />
            </div>
          {showAssistant && !readOnly && (
            <AssistantPanel
              graphId={graphId}
              selectedNodeIds={nodes.filter((n) => n.selected).map((n) => n.id)}
              graph={{
                nodes: nodes.map((n) => ({
                  id: n.id,
                  type: "flow",
                  position: n.position,
                  data: n.data,
                })),
                edges: edges.map((e) => ({
                  id: e.id,
                  source: e.source,
                  sourceHandle: e.sourceHandle ?? null,
                  target: e.target,
                  targetHandle: e.targetHandle ?? null,
                })),
              }}
              settings={settingsApi.settings}
              onApply={(next: GraphDoc) => {
                setNodes(
                  next.nodes.map(
                    (n) =>
                      ({
                        id: n.id,
                        type: "flow",
                        position: n.position,
                        data: n.data,
                      }) as FN,
                  ),
                );
                setEdges(
                  next.edges.map((e) => ({ ...e, type: "smoothstep" })),
                );
                touch();
              }}
              onClose={() => setShowAssistant(false)}
            />
          )}
          {showRuns && (
            <div className="fb-pop absolute bottom-3 right-3 z-10 max-h-[50vh] w-80 overflow-auto rounded-xl border border-line bg-card/95 shadow-2xl backdrop-blur">
              <div className="sticky top-0 flex items-center justify-between border-b border-line bg-card/95 px-3 py-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
                  Run history
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/runs?graphId=${graphId}`}
                    className="font-mono text-[9px] uppercase tracking-wider text-faint hover:text-live"
                  >
                    All runs
                  </Link>
                  <button
                    onClick={() => setShowRuns(false)}
                    className="flex h-4 w-4 items-center justify-center rounded text-faint transition-colors hover:bg-white/5 hover:text-muted"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                      <path
                        d="M1.5 1.5 6.5 6.5M6.5 1.5 1.5 6.5"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <RunsPanel graphId={graphId} refreshKey={runsTick} />
            </div>
          )}
        </div>

        {(settingsApi.showSettings || settingsApi.needsOnboard) && (
          <SettingsModal
            settings={settingsApi.settings}
            env={settingsApi.env}
            onboarding={settingsApi.needsOnboard && !settingsApi.showSettings}
            onSave={(s) => {
              settingsApi.persist(s);
              reloadCatalog();
            }}
            onClose={settingsApi.dismissOnboard}
          />
        )}
        {showPublish && (
          <PublishTemplate
            graphId={graphId}
            title={title}
            onClose={() => setShowPublish(false)}
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
        <circle cx="3" cy="6" r="1.1" fill="currentColor" />
        <circle cx="6" cy="6" r="1.1" fill="currentColor" />
        <circle cx="9" cy="6" r="1.1" fill="currentColor" />
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em]">
        Runs
      </span>
    </button>
  );
}
