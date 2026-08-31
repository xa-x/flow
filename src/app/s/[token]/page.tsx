"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import { readJson } from "@/lib/http";
import { StatusScreen } from "@/components/StatusScreen";
import { Canvas } from "@/components/Canvas";

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<
    | { kind: "load" }
    | { kind: "err"; message: string }
    | { kind: "ok"; graphId: string; permission: string }
  >({ kind: "load" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/shares/${token}`);
        const j = await readJson<{ graphId?: string; permission?: string; error?: string }>(res);
        if (!res.ok || !j.graphId) throw new Error(j.error || "Share not found");
        if (alive)
          setState({
            kind: "ok",
            graphId: j.graphId,
            permission: j.permission || "view",
          });
      } catch (e) {
        if (alive)
          setState({
            kind: "err",
            message: e instanceof Error ? e.message : "Share not found",
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (state.kind === "load") {
    return <StatusScreen kicker="Share" title="Opening workbook…" body="Loading a read-only copy." />;
  }
  if (state.kind === "err") {
    return (
      <StatusScreen
        kicker="Share"
        title="This link isn’t available"
        body={state.message}
        action={
          <Link href="/" className="fb-btn-primary rounded-full px-4 py-2 text-[13px] font-medium">
            Back to workbooks
          </Link>
        }
      />
    );
  }

  return (
    <ReactFlowProvider>
      <Canvas
        key={state.graphId}
        graphId={state.graphId}
        shareToken={token}
        readOnly={state.permission === "view"}
      />
    </ReactFlowProvider>
  );
}
