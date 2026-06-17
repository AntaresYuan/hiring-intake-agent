import type { HiringState, HandoffReadiness } from "./schema";
import { parseMonthlySalary, parseDailyWage } from "./kb";

// Workflow 侧的确定性逻辑：缺口检测、停止判定、推导链结构核查。
// 这些不该花 LLM token —— 对 Schema 做检查即可。把结果喂给 LLM，让它只负责措辞与判断。

export interface Gap {
  field: string; // 机器可读标识
  label: string; // 给 LLM / 用户看的描述
}

/**
 * KPI 是否带「可量化目标」。只说方向（如“降低工单量”）不算——必须有数字/百分比/倍数，
 * 否则交接给 HR 的还是个含糊目标。（benchmark 抓到的早停根因之一）
 */
function kpiHasTarget(text: string): boolean {
  return /\d/.test(text) || /翻倍|翻番|翻一番|倍增|减半|腰斩/.test(text);
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
 * 检测距离「可交接 HR」还缺哪些信息。**按招聘类型裁剪**：
 *  - 社招（默认）：资深 HR 的「澄清完成」5 条（KPI带目标/可评估/预算/90天/内部转岗）。
 *  - 校招/应届：砍内部转岗；KPI 培养导向、不强制量化数字；不问经验。
 *  - 日常/转正实习：不背 KPI、无职级/内部转岗；改要「明确任务 + 到岗/时长 + 日薪」。
 * 冲突/现实性问题一旦已暴露，不强行卡在业务侧解决；可作为 HR 校准项交接。
 */
export function detectGaps(state: HiringState): Gap[] {
  const gaps: Gap[] = [];
  const t = state.recruit_type;
  const internship = t === "日常实习" || t === "转正实习";
  const campus = t === "校招";
  const experienced = t === "" || t === "社招"; // 默认按社招

  // —— KPI ——（实习不背 KPI；校招要但不强制量化；社招要且要量化目标）
  if (!internship) {
    if (!state.kpi_ownership.trim())
      gaps.push({
        field: "kpi_ownership",
        label: campus ? "培养目标 / 这个岗位要对什么结果负责" : "岗位对哪个 KPI 负责（能一句话说清）",
      });
    else if (experienced && !kpiHasTarget(state.kpi_ownership))
      gaps.push({
        field: "kpi_ownership",
        label: "KPI 需可量化目标（具体数字/百分比/倍数），只说方向不算（如“降低工单量”要逼到“自助解决率→30%”）",
      });
  }

  // —— 必备能力可评估 ——（实习放宽，不阻塞）
  if (!internship && !mustHavesAssessable(state))
    gaps.push({ field: "assessable", label: "必备能力要可评估（缺面试验证/候选人证据）" });

  // —— 预算 ——（所有类型都要；社招/校招月薪，实习日薪）
  if (!parseMonthlySalary(state.constraints.budget) && !parseDailyWage(state.constraints.budget))
    gaps.push({
      field: "budget",
      label: internship
        ? "实习日薪（具体数字，如 200 元/天；“待定”不算）"
        : "预算范围（需具体数字/区间，如月薪；“待HR定”不算）",
    });
  else if (hasUnresolvedBudgetConflict(state))
    gaps.push({ field: "budget_align", label: "预算与职级/职责现实性存在冲突（交给 HR 校准取舍）" });

  // —— 90 天里程碑 ——（实习周期更短，不强制 90 天）
  if (!internship && !state.milestone_90.trim())
    gaps.push({ field: "milestone_90", label: "90 天里程碑（入职 90 天要交出什么）" });

  // —— 内部转岗排查 ——（仅社招）
  if (experienced && !state.internal_check.trim())
    gaps.push({ field: "internal_check", label: "内部转岗排查（确认现有团队/内部无人可干）" });

  // —— 实习专属硬缺口：明确任务 + 到岗/时长 ——
  if (internship) {
    if (state.core_tasks.length === 0)
      gaps.push({ field: "intern_tasks", label: "明确的（协助性）工作任务" });
    if (!state.constraints.timeline.trim())
      gaps.push({ field: "intern_timeline", label: "到岗时间 / 实习时长 / 每周到岗天数" });
  }

  // —— 支撑性缺口（软，不阻塞交接但提示该补）——
  if (!state.background.trim())
    gaps.push({ field: "background", label: "招聘原因与业务目标" });
  if (!internship && state.core_tasks.length === 0)
    gaps.push({ field: "core_tasks", label: "核心工作任务" });
  if (!internship && (!state.milestone_30.trim() || !state.milestone_180.trim()))
    gaps.push({ field: "milestones", label: "30/180 天里程碑" });
  if (!state.constraints.urgency.trim())
    gaps.push({ field: "urgency", label: "紧急度（多久必须到岗）" });
  if (experienced && !state.constraints.experience.trim())
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

/** 该招聘类型下，哪些缺口是「阻塞交接」的硬条件 */
function blockingFields(t: HiringState["recruit_type"]): Set<string> {
  if (t === "日常实习" || t === "转正实习")
    return new Set(["budget", "intern_tasks", "intern_timeline"]);
  if (t === "校招")
    return new Set(["kpi_ownership", "assessable", "budget", "milestone_90"]);
  // 社招 / 默认：资深 HR 的 5 条
  return new Set([
    "kpi_ownership",
    "assessable",
    "budget",
    "milestone_90",
    "internal_check",
  ]);
}

/** 确定性停止判定（不依赖模型自评），硬条件按招聘类型裁剪 */
export function computeHandoff(state: HiringState): HandoffReadiness {
  const gaps = detectGaps(state);
  const blocking = blockingFields(state.recruit_type);
  const missing = gaps.filter((g) => blocking.has(g.field));
  return {
    ready: missing.length === 0,
    missing_for_handoff: missing.map((g) => g.label),
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
