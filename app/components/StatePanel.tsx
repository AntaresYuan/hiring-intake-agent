import type {
  HiringState,
  RequirementItem,
  RequirementCategory,
  Priority,
} from "@/lib/schema";

// 结构化状态视图：完整的「业务招聘需求初稿」。

const CATEGORY_LABEL: Record<RequirementCategory, string> = {
  quantifiable: "可量化",
  behavioral: "行为化",
  leveled: "分级",
  semi_quantifiable: "半量化",
  risk: "偏见风险",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  must_have: "必备",
  preferred: "加分",
  trainable: "可培养",
};

// 单色"强度=重要度"：必备最重，可培养最轻
const PRIORITY_CLASS: Record<Priority, string> = {
  must_have: "bg-gray-900 text-white",
  preferred: "bg-gray-200 text-gray-700",
  trainable: "bg-gray-100 text-gray-400",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-400">{label}</div>
      <div className="text-sm text-gray-800">{value || "—"}</div>
    </div>
  );
}

function RequirementCard({ r }: { r: RequirementItem }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-gray-900">
          {r.clarified || r.raw}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {r.priority && (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_CLASS[r.priority]}`}
            >
              {PRIORITY_LABEL[r.priority]}
            </span>
          )}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
            {CATEGORY_LABEL[r.category]}
          </span>
        </div>
      </div>
      {r.raw && r.raw !== r.clarified && (
        <div className="mt-1 text-xs text-gray-400">原话：{r.raw}</div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {r.business_scenario && <Field label="业务场景" value={r.business_scenario} />}
        {r.derivation && <Field label="推导来源" value={r.derivation} />}
        {r.candidate_evidence && (
          <Field label="候选人证据" value={r.candidate_evidence} />
        )}
        {r.interview_check && <Field label="面试验证" value={r.interview_check} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-gray-400">
          责任：
          {r.owner === "business" ? "业务方" : r.owner === "hr" ? "HR" : "共同"}
        </span>
        {r.needs_hr_calibration && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
            待 HR 校准
          </span>
        )}
        {r.confidence === "uncertain" && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
            未确定
          </span>
        )}
        {r.confidence === "inferred" && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-400">
            AI 推断
          </span>
        )}
      </div>
    </div>
  );
}

export default function StatePanel({ state }: { state: HiringState }) {
  const c = state.constraints;
  const hasConstraints =
    c.experience || c.budget || c.urgency || c.location || c.timeline || c.team_gap;
  return (
    <div className="space-y-5 p-5">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          业务背景与目标
        </h3>
        <Field label="招聘背景 / 业务目标" value={state.background} />
        <Field label="对哪个 KPI 负责" value={state.kpi_ownership} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="30 天里程碑" value={state.milestone_30} />
          <Field label="90 天里程碑" value={state.milestone_90} />
          <Field label="180 天里程碑" value={state.milestone_180} />
        </div>
        <Field label="内部转岗排查" value={state.internal_check} />
        {state.core_tasks.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-400">核心任务</div>
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {state.core_tasks.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {hasConstraints && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            约束
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {c.experience && <Field label="经验" value={c.experience} />}
            {c.budget && <Field label="预算" value={c.budget} />}
            {c.urgency && <Field label="紧急度" value={c.urgency} />}
            {c.location && <Field label="地点" value={c.location} />}
            {c.timeline && <Field label="到岗 / 周期" value={c.timeline} />}
            {c.team_gap && <Field label="团队缺口" value={c.team_gap} />}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          要求清单（{state.requirements.length}）
        </h3>
        {state.requirements.length === 0 ? (
          <div className="text-sm text-gray-300">尚未拆解出要求</div>
        ) : (
          <div className="space-y-2">
            {state.requirements.map((r) => (
              <RequirementCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      {state.conflicts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            冲突（{state.conflicts.length}）
          </h3>
          {state.conflicts.map((cf) => (
            <div
              key={cf.id}
              className="rounded-lg border border-amber-200 bg-amber-50 p-3"
            >
              <div className="text-sm font-medium text-amber-900">
                {cf.description}
              </div>
              <div className="mt-1 text-xs text-amber-700">取舍：{cf.tradeoff}</div>
              <div className="mt-1 text-[11px] text-amber-500">
                {cf.owner === "hr" ? "需提交 HR 校准" : "业务方可决"}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
