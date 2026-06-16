import type { TurnDiagnosis, HandoffReadiness } from "@/lib/schema";

// 诊断看板：入口先展示诊断而非直接生成 JD。
// 展示本轮识别的模糊词、缺失信息、冲突、追问，以及距离可交接还差什么。

function Chips({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "neutral" | "outline" | "accent" | "strong";
}) {
  const toneClass = {
    neutral: "bg-gray-100 text-gray-600 border-transparent",
    outline: "bg-white text-gray-500 border-gray-200",
    accent: "bg-amber-50 text-amber-700 border-amber-200",
    strong: "bg-gray-900 text-white border-transparent",
  }[tone];
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-gray-500">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-300">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((t, i) => (
            <span
              key={i}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${toneClass}`}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DiagnosisPanel({
  diagnosis,
  handoff,
}: {
  diagnosis: TurnDiagnosis | null;
  handoff: HandoffReadiness | null;
}) {
  if (!diagnosis) {
    return (
      <div className="p-6 text-sm text-gray-400">
        发出第一条招聘需求后，这里会实时显示 Agent 对你描述的诊断：哪些是模糊词、缺了什么、有没有冲突。
      </div>
    );
  }
  return (
    <div className="space-y-5 p-5">
      <Chips title="模糊词 / 需场景化" items={diagnosis.vague_terms} tone="neutral" />
      <Chips title="缺失的关键信息" items={diagnosis.missing_info} tone="outline" />
      <Chips title="发现的冲突" items={diagnosis.conflicts_found} tone="accent" />
      <Chips title="本轮追问" items={diagnosis.questions_asked} tone="strong" />

      {handoff && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                handoff.ready ? "bg-emerald-500" : "bg-gray-300"
              }`}
            />
            {handoff.ready ? "已可交接 HR" : "尚未达到交接条件"}
          </div>
          {!handoff.ready && handoff.missing_for_handoff.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-gray-500">
              {handoff.missing_for_handoff.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
