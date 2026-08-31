"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { readJson } from "@/lib/http";
import { toast } from "@/components/Toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(j.error || "Auth failed");
      router.push("/");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Auth failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fb-atmosphere relative flex min-h-dvh flex-col">
      <AppHeader active="home" />
      <main className="mx-auto w-full max-w-sm flex-1 px-5 py-16">
        <h1 className="text-[24px] font-semibold text-ink">
          {mode === "login" ? "Sign in" : "Create workspace"}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Local-first SaaS account for this Flowbook instance.
        </p>
        <label className="mt-6 block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-faint">
            Email
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-faint">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none"
          />
        </label>
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="fb-btn-primary mt-5 w-full rounded-full py-2 text-[13px] font-medium disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-3 w-full text-[12px] text-muted"
        >
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </main>
    </div>
  );
}
