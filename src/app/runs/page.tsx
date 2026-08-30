import { Suspense } from "react";
import { RunsHistory } from "@/components/RunsHistory";

export default function RunsPage() {
  return (
    <Suspense
      fallback={
        <div className="fb-atmosphere min-h-dvh">
          <div className="mx-auto max-w-5xl px-5 py-24">
            <div className="h-8 w-40 animate-pulse rounded bg-card" />
            <div className="mt-8 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-xl border border-line bg-card/60"
                />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <RunsHistory />
    </Suspense>
  );
}
