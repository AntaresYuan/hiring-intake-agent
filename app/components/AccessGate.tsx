"use client";

import { FormEvent, useEffect, useState } from "react";

type AccessState = "checking" | "open" | "locked";

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessState>("checking");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/access", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { enabled?: boolean; authorized?: boolean }) => {
        if (!alive) return;
        setState(!data.enabled || data.authorized ? "open" : "locked");
      })
      .catch(() => {
        if (alive) setState("locked");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "通行令校验失败");
      setState("open");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通行令校验失败");
    } finally {
      setLoading(false);
    }
  }

  if (state === "checking") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 text-sm text-gray-400">
        正在校验访问权限…
      </div>
    );
  }

  if (state === "open") return <>{children}</>;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 text-gray-900">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-5">
          <h1 className="text-base font-semibold">招聘需求澄清 Agent</h1>
          <p className="mt-1 text-sm text-gray-500">请输入通行令后继续使用。</p>
        </div>
        <label className="block text-xs font-medium text-gray-500" htmlFor="access-code">
          通行令
        </label>
        <input
          id="access-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={12}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-center text-lg tracking-[0.35em] outline-none focus:border-gray-500"
        />
        {error && (
          <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {loading ? "校验中…" : "进入"}
        </button>
      </form>
    </main>
  );
}
