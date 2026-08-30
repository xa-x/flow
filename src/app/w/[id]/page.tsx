"use client";

import { use } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "@/components/Canvas";

export default function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assistant?: string }>;
}) {
  const { id } = use(params);
  const q = use(searchParams);
  return (
    <ReactFlowProvider>
      <Canvas
        key={id}
        graphId={id}
        startAssistant={q.assistant === "1"}
      />
    </ReactFlowProvider>
  );
}
