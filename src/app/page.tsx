"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "@/components/Canvas";

export default function Home() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
