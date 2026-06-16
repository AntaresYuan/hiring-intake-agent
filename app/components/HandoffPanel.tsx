"use client";

import { useState } from "react";
import type { HiringState, RequirementItem, Priority } from "@/lib/schema";
import {
  buildHandoffBrief,
  buildHrAgentPrompt,
  collectHrCalibration,
} from "@/lib/handoff";

// HR 交接视图：简报体（结论先行），按主题组织，置信度作为行内小标记。
// 顶部两个一键复制：给人发的简报 / 给 HR Agent 的 A2A prompt。

const PRIORITY_LABEL: Record<Priority, string> = {
  must_have: "必备",
  preferred: "加分",
  trainable: "可培养",
};
const PRIORITY_CLASS: Record<Priority, string> = {
  must_have: "bg-gray-900 text-white",
  preferred: "bg-gray-200 text-gray-700",
  trainable: "bg-gray-100 text-gray-400",
};

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* 忽略 */
        }
      }}
      className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
    >
      {copied ? "已复制" : label}
    </button>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3
        className={`text-xs font-semibold uppercase tracking-wide ${
          accent ? "text-amber-600" : "text-gray-400"
        }`}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function ReqRow({ r }: { r: RequirementItem }) {
  const marks: { t: string; c: string }[] = [];
  if (r.needs_hr_calibration)
    marks.push({ t: "待HR校准", c: "bg-amber-50 text-amber-700" });
  if (r.confidence === "uncertain")
    marks.push({ t: "未确定", c: "bg-gray-100 text-gray-500" });
  else if (r.confidence === "inferred")
    marks.push({ t: "AI推断", c: "bg-gray-100 text-gray-400" });
  return (
    <div className="flex items-start gap-2 text-sm text-gray-700">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
      <span className="flex-1">
        {r.clarified || r.raw}
        {marks.map((m, i) => (
          <span
            key={i}
            className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] ${m.c}`}
          >
            {m.t}
          </span>
        ))}
      </span>
    </div>
  );
}

export default function HandoffPanel({ state }: { state: HiringState }) {
  const hasContent =
    state.role_title ||
    state.background ||
    state.requirements.length ||
    state.kpi_ownership;

  if (!hasContent) {
    return (
      <div className="p-6 text-sm text-gray-400">
        随着对话推进，这里生成给 HR 的交接简报：一句话摘要、里程碑、能力要求、关键冲突、需校准清单，并可一键复制发 HR。
      </div>
    );
  }

  const hrItems = collectHrCalibration(state);
  const byP = (p: Priority) => state.requirements.filter((r) => r.priority === p);

  return (
    <div className="space-y-5 p-5">
      {/* 顶部复制操作 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        <CopyButton label="复制交接简报" text={buildHandoffBrief(state)} />
        <CopyButton label="复制 HR Agent Prompt" text={buildHrAgentPrompt(state)} />
        <span className="text-[11px] text-gray-400">业务初稿，待 HR 校准</span>
      </div>

      {/* ① 一句话摘要 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="text-sm font-semibold text-gray-900">
          {state.role_title || "（岗位待定）"}
        </div>
        <div className="mt-0.5 text-xs text-gray-600">
          对「{state.kpi_ownership || "（KPI 待明确）"}」负责
          {state.constraints.urgency && ` · 紧急度：${state.constraints.urgency}`}
        </div>
      </div>

      {/* ② 为什么招 */}
      <Section title="为什么招">
        <p className="text-sm text-gray-700">{state.background || "（待补充）"}</p>
      </Section>

      {/* ③ 里程碑 */}
      <Section title="里程碑">
        <div className="space-y-1 text-sm text-gray-700">
          <div>30 天：{state.milestone_30 || "（待补充）"}</div>
          <div>90 天：{state.milestone_90 || "（待补充）"}</div>
          <div>180 天：{state.milestone_180 || "（待补充）"}</div>
        </div>
      </Section>

      {/* ④ 核心任务 */}
      {state.core_tasks.length > 0 && (
        <Section title="核心任务">
          <ul className="list-disc pl-5 text-sm text-gray-700">
            {state.core_tasks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* ⑤ 能力要求 */}
      <Section title="能力要求">
        {state.requirements.length === 0 ? (
          <div className="text-sm text-gray-300">（待澄清）</div>
        ) : (
          (["must_have", "preferred", "trainable"] as Priority[]).map((p) =>
            byP(p).length ? (
              <div key={p} className="mb-2">
                <span
                  className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_CLASS[p]}`}
                >
                  {PRIORITY_LABEL[p]}
                </span>
                <div className="space-y-1">
                  {byP(p).map((r) => (
                    <ReqRow key={r.id} r={r} />
                  ))}
                </div>
              </div>
            ) : null
          )
        )}
      </Section>

      {/* ⑥ 关键冲突与取舍 */}
      <Section title="⚠ 关键冲突与取舍" accent>
        {state.conflicts.length === 0 ? (
          <div className="text-sm text-gray-300">暂未发现冲突</div>
        ) : (
          <div className="space-y-2">
            {state.conflicts.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-amber-200 bg-amber-50 p-2.5"
              >
                <div className="text-sm text-amber-900">{c.description}</div>
                <div className="mt-1 text-xs text-amber-700">
                  取舍：{c.tradeoff || "（待定）"}　·
                  {c.owner === "hr" ? "需 HR 校准" : "业务方可决"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ⑦ 需 HR 校准清单 */}
      <Section title="✅ 需要 HR 校准的清单" accent>
        {hrItems.length === 0 ? (
          <div className="text-sm text-gray-300">暂无</div>
        ) : (
          <div className="space-y-1">
            {hrItems.map((h, i) => (
              <label
                key={i}
                className="flex items-start gap-2 text-sm text-gray-700"
              >
                <input type="checkbox" className="mt-1 accent-gray-700" />
                <span>{h}</span>
              </label>
            ))}
          </div>
        )}
      </Section>

      {/* ⑧ 内部排查 */}
      <Section title="内部转岗排查">
        <p className="text-sm text-gray-700">
          {state.internal_check || "（待补充）"}
        </p>
      </Section>

      {/* ⑨ 边界 */}
      <Section title="仅人工拍板（AI 不替代）">
        <ul className="list-disc pl-5 text-xs text-gray-400">
          <li>判断需求是否「合理」的尺度</li>
          <li>挑战用人经理时的情绪谈判</li>
          <li>确认最终成功画像</li>
          <li>签字并担责</li>
        </ul>
      </Section>
    </div>
  );
}
