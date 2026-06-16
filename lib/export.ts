import { chatJSON, hasApiKey, type ChatMessage } from "./llm";
import type { HiringState, RequirementItem } from "./schema";

// 交接产物：初版 JD + 面试框架（HR 反馈第 5 点）。
// 按需触发，不进每轮对话循环。无 API key 时走确定性拼装兜底（硬基线）。
// 红线：先澄清、JD 是副产品；薪资/职级标"估算待 HR 校准"；不编造 state 里没有的硬信息。

export interface ExportResult {
  jd: string; // markdown
  interview: string; // markdown
}

const EXPORT_SYSTEM = `你是招聘需求澄清 Agent 的"交接产物生成"模块。基于已澄清的结构化招聘需求，生成两份**初稿**：一份初版 JD，一份面试框架。

要求：
- 只用给定结构化数据里的事实，不要编造未提供的硬信息（薪资、职级、福利等）。
- 涉及薪资/职级处，统一标注"（估算，待 HR 校准）"。
- 这是交给 HR 的初稿，不是最终定稿；在 JD 末尾注明"本 JD 为业务初稿，需 HR 校准职级/薪酬/合规与正式表述"。
- JD 结构：岗位名 / 团队与业务背景 / 这个岗位为什么存在（KPI 与里程碑）/ 核心职责 / 任职要求（必备·加分·可培养三档）/ 约束（经验·地点·到岗）。
- 面试框架：按每条"必备能力"逐条给出【考察点】【参考问题（1-2 个，行为化）】【评估标准（什么样算通过）】，每条对应到候选人证据。冲突点单列一节"需在面试/沟通中重点验证的取舍"。
- 中文输出。

只输出 JSON：{"jd": "markdown 字符串", "interview": "markdown 字符串"}`;

export function buildExportMessages(state: HiringState): ChatMessage[] {
  return [
    { role: "system", content: EXPORT_SYSTEM },
    {
      role: "user",
      content: `结构化招聘需求：\n${JSON.stringify(state)}`,
    },
  ];
}

export async function runExport(state: HiringState): Promise<ExportResult> {
  if (!hasApiKey()) return assembleFallback(state);
  try {
    let res = await chatJSON(buildExportMessages(state));
    if (res.truncated) res = await chatJSON(buildExportMessages(state), 16384);
    const parsed = JSON.parse(res.content) as Partial<ExportResult>;
    const jd = typeof parsed.jd === "string" && parsed.jd.trim() ? parsed.jd : "";
    const interview =
      typeof parsed.interview === "string" && parsed.interview.trim()
        ? parsed.interview
        : "";
    if (!jd && !interview) return assembleFallback(state);
    return {
      jd: jd || assembleFallback(state).jd,
      interview: interview || assembleFallback(state).interview,
    };
  } catch {
    return assembleFallback(state);
  }
}

/** 确定性拼装：无 LLM 也能产出可读初稿 */
export function assembleFallback(state: HiringState): ExportResult {
  const byPriority = (p: RequirementItem["priority"]) =>
    state.requirements
      .filter((r) => r.priority === p)
      .map((r) => `- ${r.clarified || r.raw}`)
      .join("\n") || "- （待补充）";

  const c = state.constraints;
  const jd = [
    `# ${state.role_title || "（岗位名待定）"}（初稿）`,
    ``,
    `## 团队与业务背景`,
    state.background || "（待补充）",
    ``,
    `## 这个岗位为什么存在`,
    `- 对哪个 KPI 负责：${state.kpi_ownership || "（待补充）"}`,
    `- 30 天：${state.milestone_30 || "（待补充）"}`,
    `- 90 天：${state.milestone_90 || "（待补充）"}`,
    `- 180 天：${state.milestone_180 || "（待补充）"}`,
    ``,
    `## 核心职责`,
    state.core_tasks.length
      ? state.core_tasks.map((t) => `- ${t}`).join("\n")
      : "- （待补充）",
    ``,
    `## 任职要求`,
    `**必备**`,
    byPriority("must_have"),
    `**加分**`,
    byPriority("preferred"),
    `**可培养**`,
    byPriority("trainable"),
    ``,
    `## 约束`,
    `- 经验：${c.experience || "（待补充）"}`,
    `- 预算：${c.budget || "（待补充）"}（估算，待 HR 校准）`,
    `- 紧急度/到岗：${c.urgency || c.timeline || "（待补充）"}`,
    `- 地点：${c.location || "（待补充）"}`,
    ``,
    `---`,
    `> 本 JD 为业务初稿，需 HR 校准职级/薪酬/合规与正式表述。`,
  ].join("\n");

  const musts = state.requirements.filter((r) => r.priority === "must_have");
  const interviewBody = musts.length
    ? musts
        .map((r, i) =>
          [
            `### ${i + 1}. ${r.clarified || r.raw}`,
            `- 【考察点】${r.business_scenario || "（待补充）"}`,
            `- 【参考问题】${r.interview_check || "请候选人结合具体经历说明在该场景下的做法与结果"}`,
            `- 【评估标准】能给出与「${
              r.candidate_evidence || "相关经历证据"
            }」一致的具体行为与结果`,
          ].join("\n")
        )
        .join("\n\n")
    : "（暂无已分级的必备能力，请先在对话中澄清并分级）";

  const conflictSection = state.conflicts.length
    ? state.conflicts
        .map((cf) => `- ${cf.description}　→　取舍：${cf.tradeoff || "（待定）"}`)
        .join("\n")
    : "- （暂未发现冲突）";

  const interview = [
    `# 面试框架（初稿）`,
    ``,
    `## 按必备能力逐条考察`,
    interviewBody,
    ``,
    `## 需在面试/沟通中重点验证的取舍`,
    conflictSection,
    ``,
    `---`,
    `> 评估"合理性"尺度、最终成功画像与录用决策由 HR 与用人经理共同拍板。`,
  ].join("\n");

  return { jd, interview };
}
