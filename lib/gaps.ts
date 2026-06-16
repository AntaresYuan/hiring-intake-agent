import type { HiringState, HandoffReadiness } from "./schema";

// Workflow 侧的确定性逻辑：缺口检测、停止判定、推导链结构核查。
// 这些不该花 LLM token —— 对 Schema 做检查即可。把结果喂给 LLM，让它只负责措辞与判断。

export interface Gap {
  field: string; // 机器可读标识
  label: string; // 给 LLM / 用户看的描述
}

/** 是否存在未给取舍的预算/职级类冲突（影响「预算职级对齐」判定） */
function hasUnresolvedBudgetConflict(state: HiringState): boolean {
  return state.conflicts.some(
    (c) =>
      (c.id.includes("budget") || /预算|职级|薪资|薪酬/.test(c.description)) &&
      !c.tradeoff.trim()
  );
}

/** must-have 要求是否都「可评估」（有面试验证 + 证据） */
function mustHavesAssessable(state: HiringState): boolean {
  const musts = state.requirements.filter((r) => r.priority === "must_have");
  if (musts.length === 0) return false; // 还没分出必备项，谈不上可评估
  return musts.every((r) => r.interview_check.trim() && r.candidate_evidence.trim());
}

/**
 * 检测距离「可交接 HR」还缺哪些信息。
 * 硬缺口直接对齐资深 HR 给的「澄清完成」5 条标准（见项目记忆 HR 反馈第 7 点）。
 */
export function detectGaps(state: HiringState): Gap[] {
  const gaps: Gap[] = [];

  // —— DoD 5 条（硬缺口）——
  if (!state.kpi_ownership.trim())
    gaps.push({ field: "kpi_ownership", label: "岗位对哪个 KPI 负责（能一句话说清）" });
  if (!mustHavesAssessable(state))
    gaps.push({ field: "assessable", label: "必备能力要可评估（缺面试验证/候选人证据）" });
  if (!state.constraints.budget.trim())
    gaps.push({ field: "budget", label: "预算范围（可量化，用于职级对齐）" });
  else if (hasUnresolvedBudgetConflict(state))
    gaps.push({ field: "budget_align", label: "预算与职级未对齐（冲突待取舍）" });
  if (!state.milestone_90.trim())
    gaps.push({ field: "milestone_90", label: "90 天里程碑（入职 90 天要交出什么）" });
  if (!state.internal_check.trim())
    gaps.push({ field: "internal_check", label: "内部转岗排查（确认现有团队/内部无人可干）" });

  // —— 支撑性缺口（软，不阻塞交接但提示该补）——
  if (!state.background.trim())
    gaps.push({ field: "background", label: "招聘原因与业务目标" });
  if (state.core_tasks.length === 0)
    gaps.push({ field: "core_tasks", label: "核心工作任务" });
  if (!state.milestone_30.trim() || !state.milestone_180.trim())
    gaps.push({ field: "milestones", label: "30/180 天里程碑" });
  if (!state.constraints.urgency.trim())
    gaps.push({ field: "urgency", label: "紧急度（多久必须到岗）" });
  if (!state.constraints.experience.trim())
    gaps.push({ field: "experience", label: "经验要求（年限/方向）" });

  const reqs = state.requirements;
  if (reqs.length === 0)
    gaps.push({ field: "requirements", label: "尚未拆解出任何能力要求" });
  else {
    if (reqs.some((r) => r.priority === null))
      gaps.push({ field: "priority", label: "部分要求未分级（must-have/加分/可培养）" });
    if (reqs.some((r) => r.issues.includes("vague") && !r.business_scenario))
      gaps.push({ field: "scenario", label: "部分模糊要求还缺业务场景解释" });
    if (reqs.some((r) => r.confidence === "uncertain"))
      gaps.push({ field: "uncertain", label: "存在未确定的要求需澄清" });
  }

  if (state.conflicts.some((c) => !c.tradeoff.trim()))
    gaps.push({ field: "conflict_tradeoff", label: "已发现的冲突还未给出取舍方向" });

  return gaps;
}

// 硬条件 = 资深 HR 的「澄清完成」5 条标准
const BLOCKING_FIELDS = new Set([
  "kpi_ownership",
  "assessable",
  "budget",
  "budget_align",
  "milestone_90",
  "internal_check",
]);

/** 确定性停止判定（不依赖模型自评） */
export function computeHandoff(state: HiringState): HandoffReadiness {
  const gaps = detectGaps(state);
  const blocking = gaps.filter((g) => BLOCKING_FIELDS.has(g.field));
  return {
    ready: blocking.length === 0,
    missing_for_handoff: blocking.map((g) => g.label),
  };
}

/** 推导链结构核查：业务目标→任务→能力→证据→面试。找出断链（代码侧，0 token） */
export function checkReasoningChain(state: HiringState): string[] {
  const issues: string[] = [];
  for (const r of state.requirements) {
    const label = r.clarified || r.raw || r.id;
    if (!r.derivation.trim())
      issues.push(`「${label}」未追溯到具体业务目标/任务`);
    if (r.category === "behavioral" && !r.candidate_evidence.trim())
      issues.push(`「${label}」是行为化要求但缺候选人证据`);
    if (r.priority === "must_have" && !r.interview_check.trim())
      issues.push(`必备项「${label}」缺面试验证方式`);
  }
  return issues;
}
