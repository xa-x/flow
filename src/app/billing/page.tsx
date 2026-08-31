"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useSettings } from "@/lib/use-settings";
import { SettingsModal } from "@/components/SettingsModal";
import { readJson } from "@/lib/http";
import { fmtCost } from "@/lib/format";
import type { Plan } from "@/lib/billing";

export default function BillingPage() {
  const settings = useSettings();
  const [data, setData] = useState<{
    plan: Plan;
    plans: Plan[];
    usage: { runs: number; runLimit: number; amountUsd: number; tokens: number; creditAllowanceUsd: number };
  } | null>(null);

  useEffect(() => {
    fetch("/api/billing")
      .then((r) => readJson<NonNullable<typeof data>>(r))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div className="fb-atmosphere relative flex min-h-dvh flex-col">
      <AppHeader active="billing" onSettings={() => settings.setShowSettings(true)} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">Usage</p>
        <h1 className="mt-1.5 text-[28px] font-semibold text-ink">Plan & credits</h1>
        <p className="mt-1 max-w-xl text-[13.5px] text-muted">
          You pay for reliability: durable runs, history, triggers, and managed PYOK credits — not for drawing nodes.
        </p>
        {data && (
          <>
            <div className="mt-6 rounded-2xl border border-line bg-card/80 p-4">
              <p className="text-[14px] font-medium text-ink">Current: {data.plan.label}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                {data.usage.runs}/{data.usage.runLimit} runs this month ·{" "}
                {fmtCost(data.usage.amountUsd)} usage · {data.usage.tokens.toLocaleString()} tokens
              </p>
            </div>
            <ul className="mt-4 grid gap-3 md:grid-cols-3">
              {data.plans.map((p) => (
                <li key={p.id} className="rounded-2xl border border-line bg-card/70 p-4">
                  <p className="text-[15px] font-medium text-ink">{p.label}</p>
                  <p className="mt-1 text-[13px] text-muted">
                    {p.monthlyUsd
                      ? `$${p.monthlyUsd}/mo`
                      : p.seatUsd
                        ? `$${p.seatUsd}/seat`
                        : "Free"}
                  </p>
                  <ul className="mt-3 space-y-1 text-[12px] text-muted">
                    <li>{p.monthlyRuns.toLocaleString()} monthly runs</li>
                    <li>{p.monthlyCreditsUsd ? `$${p.monthlyCreditsUsd} PYOK credits` : "BYOK only"}</li>
                    <li>{p.schedules ? "Cron + webhooks" : "Manual runs"}</li>
                    <li>{p.mcp ? "MCP + API keys" : "No MCP"}</li>
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      {(settings.showSettings || settings.needsOnboard) && (
        <SettingsModal
          settings={settings.settings}
          env={settings.env}
          onboarding={settings.needsOnboard && !settings.showSettings}
          onSave={settings.persist}
          onClose={settings.dismissOnboard}
        />
      )}
    </div>
  );
}
