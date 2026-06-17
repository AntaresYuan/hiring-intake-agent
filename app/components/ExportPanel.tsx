"use client";

import { useState } from "react";
import type { HiringState } from "@/lib/schema";

// 交接产物：按需生成初版 JD + 面试框架 + 候选人评估标准（一次 LLM 调用，不进每轮循环）。

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  }
  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold text-gray-600">{title}</span>
        <button
          onClick={copy}
          className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed text-gray-800">
        {text}
      </pre>
    </div>
  );
}

export default function ExportPanel({
  state,
  ready,
}: {
  state: HiringState | null;
  ready: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    jd: string;
    interview: string;
    candidate_evaluation: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!state) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "生成失败");
      setResult({
        jd: data.jd,
        interview: data.interview,
        candidate_evaluation: data.candidate_evaluation,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  if (!state) {
    return (
      <div className="p-6 text-sm text-gray-400">
        澄清推进后，这里可一键生成给 HR 的初版 JD、面试框架和候选人评估标准（业务初稿，待 HR 校准）。
      </div>
    );
  }

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {loading ? "生成中…" : result ? "重新生成" : "生成 JD + 面试 + 评估"}
        </button>
        {!ready && (
          <span className="text-xs text-amber-600">
            尚未达到交接条件，现在生成的是不完整初稿
          </span>
        )}
      </div>
      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-3">
          <CopyBlock title="初版 JD（业务初稿，待 HR 校准）" text={result.jd} />
          <CopyBlock title="面试框架（初稿）" text={result.interview} />
          <CopyBlock
            title="候选人评估标准 / 评分卡（初稿）"
            text={result.candidate_evaluation}
          />
        </div>
      )}
    </div>
  );
}
