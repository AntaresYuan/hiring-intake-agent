import type { HiringState, RequirementItem, Priority } from "./schema";

// 交接产物（确定性拼装，不调 LLM）：
//  1) buildHandoffBrief —— 给人看的简报体 markdown，可一键复制发 HR
//  2) buildHrAgentPrompt —— 给「HR 校准 Agent」的 A2A 交接 prompt（路线图：业务 Agent → HR Agent）

const PRIORITY_LABEL: Record<Priority, string> = {
  must_have: "必备",
  preferred: "加分",
  trainable: "可培养",
};

const HUMAN_ONLY = [
  "判断需求是否「合理」的尺度",
  "挑战用人经理时的情绪谈判",
  "确认最终成功画像",
  "签字并担责",
];

/** 汇总「需要 HR 校准」的清单 */
export function collectHrCalibration(state: HiringState): string[] {
  const items = [...state.open_questions_for_hr];
  for (const r of state.requirements) {
    if (r.needs_hr_calibration) items.push(r.clarified || r.raw);
  }
  if (state.conflicts.some((c) => c.id.startsWith("kb-conf") || /预算|职级|薪酬/.test(c.description))) {
    items.push("预算与职级对齐（对标市场区间）");
  }
  return Array.from(new Set(items.filter(Boolean)));
}

function reqsByPriority(state: HiringState, p: Priority): RequirementItem[] {
  return state.requirements.filter((r) => r.priority === p);
}

function reqLine(r: RequirementItem): string {
  const marks: string[] = [];
  if (r.needs_hr_calibration) marks.push("待HR校准");
  if (r.confidence === "uncertain") marks.push("未确定");
  else if (r.confidence === "inferred") marks.push("AI推断");
  const suffix = marks.length ? `（${marks.join("、")}）` : "";
  return `${r.clarified || r.raw}${suffix}`;
}

/** 给人看的交接简报（倒金字塔：结论先行，冲突与待校准靠前） */
export function buildHandoffBrief(state: HiringState): string {
  const L: string[] = [];
  const role = state.role_title || "（岗位待定）";

  L.push(`# 招聘需求交接简报（业务初稿，待 HR 校准）`, ``);

  // ① 一句话摘要
  L.push(`## 一句话摘要`);
  L.push(
    `**${role}** · 对「${state.kpi_ownership || "（KPI 待明确）"}」负责` +
      (state.constraints.urgency ? ` · 紧急度：${state.constraints.urgency}` : ""),
    ``
  );

  // ② 为什么招
  L.push(`## 为什么招`, state.background || "（待补充）", ``);

  // ③ 里程碑
  L.push(`## 里程碑`);
  L.push(`- 30 天：${state.milestone_30 || "（待补充）"}`);
  L.push(`- 90 天：${state.milestone_90 || "（待补充）"}`);
  L.push(`- 180 天：${state.milestone_180 || "（待补充）"}`, ``);

  // ④ 核心任务
  if (state.core_tasks.length) {
    L.push(`## 核心任务`);
    state.core_tasks.forEach((t) => L.push(`- ${t}`));
    L.push(``);
  }

  // ⑤ 能力要求
  L.push(`## 能力要求`);
  (["must_have", "preferred", "trainable"] as Priority[]).forEach((p) => {
    const rs = reqsByPriority(state, p);
    if (rs.length) {
      L.push(`**${PRIORITY_LABEL[p]}**`);
      rs.forEach((r) => L.push(`- ${reqLine(r)}`));
    }
  });
  L.push(``);

  // ⑥ 关键冲突与取舍
  L.push(`## ⚠ 关键冲突与取舍`);
  if (state.conflicts.length) {
    state.conflicts.forEach((c) =>
      L.push(
        `- ${c.description} → 取舍：${c.tradeoff || "（待定）"}（${
          c.owner === "hr" ? "需 HR 校准" : "业务方可决"
        }）`
      )
    );
  } else L.push(`- （暂未发现冲突）`);
  L.push(``);

  // ⑦ 需 HR 校准清单
  const hr = collectHrCalibration(state);
  L.push(`## ✅ 需要 HR 校准的清单`);
  if (hr.length) hr.forEach((h) => L.push(`- [ ] ${h}`));
  else L.push(`- （暂无）`);
  L.push(``);

  // ⑧ 内部排查
  L.push(`## 内部转岗排查`, state.internal_check || "（待补充）", ``);

  // ⑨ 边界
  L.push(`## 边界：仅人工拍板（AI 不替代）`);
  HUMAN_ONLY.forEach((h) => L.push(`- ${h}`));
  L.push(``, `---`, `> 来源：业务侧澄清 Agent；薪酬/职级为估算，须 HR 校准。`);

  return L.join("\n");
}

/** 给「HR 校准 Agent」的 A2A 交接 prompt */
export function buildHrAgentPrompt(state: HiringState): string {
  const hr = collectHrCalibration(state);
  const conflicts = state.conflicts.map(
    (c) => `- ${c.description}（取舍方向：${c.tradeoff || "待定"}）`
  );
  return [
    `# 角色`,
    `你是「HR 校准 Agent」，承接业务侧澄清 Agent 输出的招聘需求初稿。`,
    ``,
    `# 任务`,
    `基于下方结构化需求，完成 HR 侧专业校准并产出：`,
    `1. 职级与薪酬建议（对标市场，给区间与依据）`,
    `2. 对「待校准清单」逐条给出结论`,
    `3. 对「关键冲突」给出 HR 视角的现实性判断与取舍建议`,
    `4. 正式 JD（合规、符合公司规范的表述）`,
    `5. 结构化面试框架的补充建议`,
    `约束：不要替业务方改写业务目标；合理性尺度、最终成功画像与录用决策需人工拍板。`,
    ``,
    `# 业务侧已澄清的需求（结构化）`,
    "```json",
    JSON.stringify(state, null, 2),
    "```",
    ``,
    `# 待你校准的清单`,
    hr.length ? hr.map((h) => `- ${h}`).join("\n") : "- （暂无）",
    ``,
    `# 需 HR 决策的冲突`,
    conflicts.length ? conflicts.join("\n") : "- （暂无）",
  ].join("\n");
}
