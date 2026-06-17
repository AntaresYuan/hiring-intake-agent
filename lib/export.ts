import { chatJSON, hasApiKey, type ChatMessage } from "./llm";
import type { HiringState, RequirementItem } from "./schema";
import { collectHrCalibration } from "./handoff";
import { loadJdSamples } from "./jdCorpus";
import {
  inferJdJobFamily,
  selectFewShotSamples,
  type JdSample,
} from "./jdSamples";

// 交接产物：初版 JD + 面试框架（HR 反馈第 5 点）。
// 按需触发，不进每轮对话循环。无 API key 时走确定性拼装兜底（硬基线）。
// 红线：先澄清、JD 是副产品；薪资/职级标"估算待 HR 校准"；不编造 state 里没有的硬信息。

export interface ExportResult {
  jd: string; // markdown
  interview: string; // markdown
  style_sources?: string[]; // 选中的真实 JD 风格参考标题
}

export interface StructuredJdDraft {
  style_source_titles?: string[];
  jd?: {
    title?: string;
    team_and_business?: string;
    role_reason?: string;
    responsibilities?: string[];
    requirements?: {
      must_have?: string[];
      preferred?: string[];
      trainable?: string[];
    };
    constraints?: string[];
    hr_calibration_notes?: string[];
    risk_notes?: string[];
  };
  interview?: {
    sections?: {
      requirement?: string;
      evaluation_point?: string;
      questions?: string[];
      pass_criteria?: string;
      evidence?: string;
    }[];
    tradeoff_checks?: string[];
  };
}

const EXPORT_SYSTEM = `你是招聘需求澄清 Agent 的"交接产物生成"模块。基于已澄清的结构化招聘需求，生成两份**初稿**：一份初版 JD，一份面试框架。

要求：
- 只用给定结构化数据里的事实，不要编造未提供的硬信息（薪资、职级、福利等）。
- 涉及薪资/职级处，统一标注"（估算，待 HR 校准）"。
- 这是交给 HR 的初稿，不是最终定稿；在 JD 末尾注明"本 JD 为业务初稿，需 HR 校准职级/薪酬/合规与正式表述"。
- 真实 JD few-shot 只用于学习结构、语气、职责/要求颗粒度，不得照抄，也不得覆盖结构化需求里的事实。
- JD 风格尽量贴近字节招聘页：使用"职位描述 / 职位要求"两段，条目用 1、2、3、，语言具体、业务导向、少空话。
- 面试框架：按每条"必备能力"逐条给出考察点、参考问题（1-2 个，行为化）、评估标准、候选人证据。冲突点单列"需重点验证的取舍"。
- 中文输出。

只输出 JSON 对象，严格符合这个结构：
{
  "style_source_titles": ["使用到的 few-shot JD 标题"],
  "jd": {
    "title": "岗位名",
    "team_and_business": "团队与业务背景，信息不足则写待补充",
    "role_reason": "这个岗位为什么存在，必须绑定 KPI/里程碑，信息不足则写待补充",
    "responsibilities": ["职位描述条目，每条一个完整职责"],
    "requirements": {
      "must_have": ["必备要求"],
      "preferred": ["加分项"],
      "trainable": ["可培养/可放宽项"]
    },
    "constraints": ["经验/地点/到岗/预算等约束，预算职级标待 HR 校准"],
    "hr_calibration_notes": ["需要 HR 校准的事项"],
    "risk_notes": ["冲突/风险/未确认假设"]
  },
  "interview": {
    "sections": [
      {
        "requirement": "对应的必备能力",
        "evaluation_point": "考察点",
        "questions": ["行为化参考问题1", "行为化参考问题2"],
        "pass_criteria": "什么样算通过",
        "evidence": "候选人应提供的经历证据"
      }
    ],
    "tradeoff_checks": ["面试或沟通中需验证的取舍"]
  }
}`;

const STATE_KEYWORDS = [
  "大模型",
  "LLM",
  "VLM",
  "Agent",
  "推荐",
  "搜索",
  "多模态",
  "强化学习",
  "电商",
  "广告",
  "商业化",
  "飞书",
  "抖音",
  "TikTok",
  "数据分析",
  "SQL",
  "Python",
  "A/B",
  "用户增长",
  "物流",
  "直播",
  "语音",
  "音频",
];

export function buildExportMessages(
  state: HiringState,
  samples: JdSample[] = []
): ChatMessage[] {
  const fewShots = pickExportFewShots(state, samples);
  return [
    { role: "system", content: EXPORT_SYSTEM },
    {
      role: "system",
      content: `真实字节 JD 风格参考（只学结构/语气/颗粒度，不照抄，不补编事实）：\n${formatFewShotSamples(
        fewShots
      )}`,
    },
    {
      role: "user",
      content: `结构化招聘需求：\n${JSON.stringify(state)}`,
    },
  ];
}

export async function runExport(state: HiringState): Promise<ExportResult> {
  const samples = loadJdSamples();
  const fewShots = pickExportFewShots(state, samples);
  if (!hasApiKey()) return { ...assembleFallback(state), style_sources: fewShots.map((s) => s.title) };
  try {
    let res = await chatJSON(buildExportMessages(state, samples));
    if (res.truncated) res = await chatJSON(buildExportMessages(state, samples), 16384);
    const parsed = parseJsonObject(res.content) as Partial<ExportResult> & StructuredJdDraft;
    if (parsed.jd && typeof parsed.jd === "object") {
      return {
        ...renderStructuredExport(parsed, state),
        style_sources: fewShots.map((s) => s.title),
      };
    }
    const jd = typeof parsed.jd === "string" && parsed.jd.trim() ? parsed.jd : "";
    const interview =
      typeof parsed.interview === "string" && parsed.interview.trim()
        ? parsed.interview
        : "";
    if (!jd && !interview) {
      return { ...assembleFallback(state), style_sources: fewShots.map((s) => s.title) };
    }
    return {
      jd: jd || assembleFallback(state).jd,
      interview: interview || assembleFallback(state).interview,
      style_sources: fewShots.map((s) => s.title),
    };
  } catch {
    return { ...assembleFallback(state), style_sources: fewShots.map((s) => s.title) };
  }
}

export function pickExportFewShots(state: HiringState, samples: JdSample[]): JdSample[] {
  const text = stateText(state);
  return selectFewShotSamples(
    samples,
    {
      role_title: state.role_title,
      recruit_type: state.recruit_type,
      job_family: inferJdJobFamily(text),
      keywords: extractStateKeywords(text),
    },
    3
  );
}

export function renderStructuredExport(
  draft: StructuredJdDraft,
  state: HiringState
): ExportResult {
  const fallback = assembleFallback(state);
  const jdDraft = draft.jd ?? {};
  const interviewDraft = draft.interview ?? {};
  const title = textOr(jdDraft.title, state.role_title || "（岗位名待定）");
  const responsibilities = arrayOr(jdDraft.responsibilities, state.core_tasks);
  const requirements = {
    must_have: arrayOr(
      jdDraft.requirements?.must_have,
      reqsByPriority(state, "must_have")
    ),
    preferred: arrayOr(
      jdDraft.requirements?.preferred,
      reqsByPriority(state, "preferred")
    ),
    trainable: arrayOr(
      jdDraft.requirements?.trainable,
      reqsByPriority(state, "trainable")
    ),
  };
  const constraints = arrayOr(jdDraft.constraints, constraintLines(state));
  const hrNotes = arrayOr(jdDraft.hr_calibration_notes, collectHrCalibration(state));
  const riskNotes = arrayOr(jdDraft.risk_notes, conflictLines(state));

  const jd = [
    `# ${title}（业务初稿）`,
    ``,
    `## 职位描述`,
    numbered([
      textOr(jdDraft.team_and_business, state.background || "（团队与业务背景待补充）"),
      textOr(jdDraft.role_reason, roleReasonFallback(state)),
      ...responsibilities,
    ]),
    ``,
    `## 职位要求`,
    numbered(requirements.must_have.length ? requirements.must_have : ["（必备要求待补充）"]),
    requirements.preferred.length ? `\n加分项：\n${bullets(requirements.preferred)}` : "",
    requirements.trainable.length ? `\n可培养/可放宽项：\n${bullets(requirements.trainable)}` : "",
    constraints.length ? `\n约束条件：\n${bullets(constraints)}` : "",
    ``,
    `## HR 待校准`,
    hrNotes.length ? bullets(hrNotes) : "- （暂无）",
    ``,
    `## 风险与未确认假设`,
    riskNotes.length ? bullets(riskNotes) : "- （暂未发现）",
    ``,
    `---`,
    `> 本 JD 为业务初稿，需 HR 校准职级/薪酬/合规与正式表述。`,
  ]
    .filter((part) => part !== "")
    .join("\n");

  const sections = Array.isArray(interviewDraft.sections)
    ? interviewDraft.sections
    : [];
  const interviewBody = sections.length
    ? sections
        .map((section, index) =>
          [
            `### ${index + 1}. ${textOr(section.requirement, `必备能力 ${index + 1}`)}`,
            `- 【考察点】${textOr(section.evaluation_point, "（待补充）")}`,
            `- 【参考问题】${arrayOr(section.questions, [
              "请候选人结合一个具体项目说明当时的目标、行动和结果。",
            ]).join(" / ")}`,
            `- 【评估标准】${textOr(section.pass_criteria, "能给出具体行为、判断依据与业务结果")}`,
            `- 【候选人证据】${textOr(section.evidence, "相关项目经历或可验证结果")}`,
          ].join("\n")
        )
        .join("\n\n")
    : fallback.interview;

  const tradeoffs = arrayOr(interviewDraft.tradeoff_checks, conflictLines(state));
  const interview = interviewBody.startsWith("#")
    ? interviewBody
    : [
        `# 面试框架（初稿）`,
        ``,
        `## 按必备能力逐条考察`,
        interviewBody,
        ``,
        `## 需在面试/沟通中重点验证的取舍`,
        tradeoffs.length ? bullets(tradeoffs) : "- （暂未发现）",
        ``,
        `---`,
        `> 评估"合理性"尺度、最终成功画像与录用决策由 HR 与用人经理共同拍板。`,
      ].join("\n");

  return { jd, interview, style_sources: draft.style_source_titles ?? [] };
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
    `## 职位描述`,
    numbered([
      state.background || "（团队与业务背景待补充）",
      roleReasonFallback(state),
      ...(state.core_tasks.length ? state.core_tasks : ["（核心职责待补充）"]),
    ]),
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
    bullets([
      `经验：${c.experience || "（待补充）"}`,
      `预算：${c.budget || "（待补充）"}（估算，待 HR 校准）`,
      `紧急度/到岗：${c.urgency || c.timeline || "（待补充）"}`,
      `地点：${c.location || "（待补充）"}`,
    ]),
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

function stateText(state: HiringState): string {
  return [
    state.role_title,
    state.recruit_type,
    state.background,
    state.kpi_ownership,
    state.core_tasks.join(" "),
    ...state.requirements.flatMap((r) => [r.raw, r.clarified, r.business_scenario]),
  ].join(" ");
}

function extractStateKeywords(text: string): string[] {
  return STATE_KEYWORDS.filter((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );
}

function formatFewShotSamples(samples: JdSample[]): string {
  if (!samples.length) return "[]";
  return JSON.stringify(
    samples.map((sample) => ({
      title: sample.title,
      recruit_type: sample.recruit_type,
      job_family: sample.job_family,
      category: sample.category,
      responsibilities: sample.responsibilities.slice(0, 4),
      requirements: sample.requirements.slice(0, 5),
      bonus_items: sample.bonus_items.slice(0, 3),
      keywords: sample.keywords,
    })),
    null,
    2
  );
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("LLM 未返回合法 JSON");
  }
}

function reqsByPriority(state: HiringState, priority: RequirementItem["priority"]): string[] {
  return state.requirements
    .filter((r) => r.priority === priority)
    .map((r) => r.clarified || r.raw)
    .filter(Boolean);
}

function constraintLines(state: HiringState): string[] {
  const c = state.constraints;
  return [
    c.experience ? `经验：${c.experience}` : "",
    c.budget ? `预算：${c.budget}（估算，待 HR 校准）` : "",
    c.location ? `地点：${c.location}` : "",
    c.urgency || c.timeline ? `紧急度/到岗：${c.urgency || c.timeline}` : "",
  ].filter(Boolean);
}

function conflictLines(state: HiringState): string[] {
  return state.conflicts.map(
    (c) => `${c.description}${c.tradeoff ? `；取舍：${c.tradeoff}` : ""}`
  );
}

function roleReasonFallback(state: HiringState): string {
  return [
    `岗位目标：${state.kpi_ownership || "（KPI 待补充）"}`,
    `30 天：${state.milestone_30 || "（待补充）"}`,
    `90 天：${state.milestone_90 || "（待补充）"}`,
    `180 天：${state.milestone_180 || "（待补充）"}`,
  ].join("；");
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayOr(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim())
    );
    if (items.length) return items.map((item) => item.trim());
  }
  return fallback.filter(Boolean);
}

function numbered(items: string[]): string {
  return items.map((item, index) => `${index + 1}、${item}`).join("\n");
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}
