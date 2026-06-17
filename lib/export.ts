import { chatJSON, hasApiKey, type ChatMessage } from "./llm";
import type { HiringState, RequirementItem } from "./schema";
import { collectHrCalibration } from "./handoff";
import { loadJdSamples } from "./jdCorpus";
import {
  inferJdJobFamily,
  selectFewShotSamples,
  type JdSample,
} from "./jdSamples";

// 交接产物：初版 JD + 面试框架 + 候选人评估标准（HR 反馈第 5 点）。
// 按需触发，不进每轮对话循环。无 API key 时走确定性拼装兜底（硬基线）。
// 红线：先澄清、JD 是副产品；薪资/职级标"估算待 HR 校准"；不编造 state 里没有的硬信息。

export interface ExportResult {
  jd: string; // markdown
  interview: string; // markdown
  candidate_evaluation: string; // markdown
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
  candidate_evaluation?: {
    resume_screen?: {
      must_have_checks?: {
        requirement?: string;
        resume_evidence?: string;
        pass_signal?: string;
        risk_signal?: string;
      }[];
      preferred_signals?: string[];
      hr_review_flags?: string[];
    };
    interview_scorecard?: {
      dimensions?: {
        dimension?: string;
        weight?: string;
        evaluates?: string;
        strong_signal?: string;
        pass_signal?: string;
        risk_signal?: string;
      }[];
    };
    rating_scale?: {
      score?: string;
      label?: string;
      description?: string;
    }[];
    decision_guidance?: string[];
  };
}

const EXPORT_SYSTEM = `你是招聘需求澄清 Agent 的"交接产物生成"模块。基于已澄清的结构化招聘需求，生成三份**初稿**：一份初版 JD，一份面试框架，一份候选人评估标准/评分卡。

要求：
- 只用给定结构化数据里的事实，不要编造未提供的硬信息（薪资、职级、福利等）。
- 涉及薪资/职级处，统一标注"（估算，待 HR 校准）"。
- 这是交给 HR 的初稿，不是最终定稿；在 JD 末尾注明"本 JD 为业务初稿，需 HR 校准职级/薪酬/合规与正式表述"。
- 真实 JD few-shot 只用于学习结构、语气、职责/要求颗粒度，不得照抄，也不得覆盖结构化需求里的事实。
- JD 风格尽量贴近字节招聘页：使用"职位描述 / 职位要求"两段，条目用 1、2、3、，语言具体、业务导向、少空话。
- 面试框架：按每条"必备能力"逐条给出考察点、参考问题（1-2 个，行为化）、评估标准、候选人证据。冲突点单列"需重点验证的取舍"。
- 候选人评估标准：用于 HR/面试官人工评估候选人是否匹配 JD，不做自动淘汰，不替 HR/用人经理做最终录用决定；必须包含简历证据核验、面试评分维度、1-5 分锚点、推进建议边界。
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
  },
  "candidate_evaluation": {
    "resume_screen": {
      "must_have_checks": [
        {
          "requirement": "对应必备能力",
          "resume_evidence": "简历中应看到的可核验证据",
          "pass_signal": "简历层面较匹配的信号",
          "risk_signal": "需要面试追问或 HR 复核的风险信号"
        }
      ],
      "preferred_signals": ["加分但不能替代必备能力的信号"],
      "hr_review_flags": ["需 HR 人工复核/校准的事项"]
    },
    "interview_scorecard": {
      "dimensions": [
        {
          "dimension": "评分维度",
          "weight": "建议权重，如 30%",
          "evaluates": "评估什么",
          "strong_signal": "4-5 分信号",
          "pass_signal": "3 分信号",
          "risk_signal": "1-2 分信号"
        }
      ]
    },
    "rating_scale": [
      { "score": "5", "label": "强匹配", "description": "可独立胜任并有可验证结果" },
      { "score": "3", "label": "基本匹配", "description": "能胜任主要任务，但部分深度需验证/培养" },
      { "score": "1", "label": "明显不匹配", "description": "关键证据缺失或与岗位目标错位" }
    ],
    "decision_guidance": ["面试结论建议如何给 HR，但不得写成自动淘汰或最终录用决定"]
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
    const fallback = assembleFallback(state);
    const jd = typeof parsed.jd === "string" && parsed.jd.trim() ? parsed.jd : "";
    const interview =
      typeof parsed.interview === "string" && parsed.interview.trim()
        ? parsed.interview
        : "";
    const candidateEvaluation =
      typeof parsed.candidate_evaluation === "string" &&
      parsed.candidate_evaluation.trim()
        ? parsed.candidate_evaluation
        : "";
    if (!jd && !interview && !candidateEvaluation) {
      return { ...assembleFallback(state), style_sources: fewShots.map((s) => s.title) };
    }
    return {
      jd: jd || fallback.jd,
      interview: interview || fallback.interview,
      candidate_evaluation: candidateEvaluation || fallback.candidate_evaluation,
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
  const evaluationDraft = draft.candidate_evaluation ?? {};
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

  return {
    jd,
    interview,
    candidate_evaluation: renderCandidateEvaluation(evaluationDraft, state),
    style_sources: draft.style_source_titles ?? [],
  };
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

  return { jd, interview, candidate_evaluation: assembleCandidateEvaluation(state) };
}

function renderCandidateEvaluation(
  draft: NonNullable<StructuredJdDraft["candidate_evaluation"]>,
  state: HiringState
): string {
  const resume = draft.resume_screen ?? {};
  const scorecard = draft.interview_scorecard ?? {};
  const mustChecks = Array.isArray(resume.must_have_checks)
    ? resume.must_have_checks
    : [];
  const dimensions = Array.isArray(scorecard.dimensions)
    ? scorecard.dimensions
    : [];
  const scale = Array.isArray(draft.rating_scale) ? draft.rating_scale : [];

  if (!mustChecks.length && !dimensions.length && !scale.length) {
    return assembleCandidateEvaluation(state);
  }

  const fallbackChecks = resumeCheckItems(state);
  const resumeChecks = mustChecks.length
    ? mustChecks
    : fallbackChecks.map((item) => ({
        requirement: item.requirement,
        resume_evidence: item.resumeEvidence,
        pass_signal: item.passSignal,
        risk_signal: item.riskSignal,
      }));
  const scoreDimensions = dimensions.length
    ? dimensions
    : scorecardDimensions(state).map((item) => ({
        dimension: item.dimension,
        weight: item.weight,
        evaluates: item.evaluates,
        strong_signal: item.strongSignal,
        pass_signal: item.passSignal,
        risk_signal: item.riskSignal,
      }));

  return [
    `# 候选人评估标准 / 评分卡（初稿）`,
    ``,
    `> 用途：帮助 HR 和面试官把 JD、简历证据、面试表现对齐。此评分卡只做人工评估参考，不做自动淘汰规则，不替代 HR/用人经理最终决策。`,
    ``,
    `## 1. 简历证据核验（人工初筛参考）`,
    resumeChecks
      .map((item, index) =>
        [
          `### ${index + 1}. ${textOr(item.requirement, `必备能力 ${index + 1}`)}`,
          `- 【应看证据】${textOr(item.resume_evidence, "与岗位目标直接相关的项目/职责/结果")}`,
          `- 【较匹配信号】${textOr(item.pass_signal, "简历能说明候选人承担过类似任务，并有可核验结果")}`,
          `- 【风险信号】${textOr(item.risk_signal, "只有泛泛关键词，缺少场景、职责或结果，需面试追问")}`,
        ].join("\n")
      )
      .join("\n\n"),
    ``,
    `## 2. 面试评分维度`,
    scoreDimensions
      .map((item, index) =>
        [
          `### ${index + 1}. ${textOr(item.dimension, `维度 ${index + 1}`)}（${textOr(item.weight, "权重待定")}）`,
          `- 【评估内容】${textOr(item.evaluates, "是否能支撑岗位目标")}`,
          `- 【4-5 分信号】${textOr(item.strong_signal, "能独立说明目标、行动、判断依据和结果，并可迁移到本岗位")}`,
          `- 【3 分信号】${textOr(item.pass_signal, "有相关经历，但深度、复杂度或独立性需要进一步确认")}`,
          `- 【1-2 分信号】${textOr(item.risk_signal, "只有概念或参与经历，无法说明个人贡献/业务结果")}`,
        ].join("\n")
      )
      .join("\n\n"),
    ``,
    `## 3. 统一评分锚点`,
    scale.length ? renderScale(scale) : renderDefaultScale(),
    ``,
    `## 4. 加分项与 HR 复核项`,
    `**加分项（不能替代必备能力）：**`,
    bullets(arrayOr(resume.preferred_signals, reqsByPriority(state, "preferred")).length ? arrayOr(resume.preferred_signals, reqsByPriority(state, "preferred")) : ["（暂无）"]),
    ``,
    `**需 HR/用人经理复核：**`,
    bullets(arrayOr(resume.hr_review_flags, evaluationReviewFlags(state)).length ? arrayOr(resume.hr_review_flags, evaluationReviewFlags(state)) : ["（暂无）"]),
    ``,
    `## 5. 推进建议边界`,
    bullets(
      arrayOr(draft.decision_guidance, [
        "建议输出“强推荐 / 推荐 / 待定 / 不建议推进”的人工面试意见，并附关键证据。",
        "不得把学校、年龄、性别、婚育、地域等与岗位无关因素作为评分项。",
        "薪酬、职级、录用与否由 HR/用人经理结合市场、预算和面试证据最终校准。",
      ])
    ),
  ].join("\n");
}

function assembleCandidateEvaluation(state: HiringState): string {
  const resumeChecks = resumeCheckItems(state);
  const dimensions = scorecardDimensions(state);
  return [
    `# 候选人评估标准 / 评分卡（初稿）`,
    ``,
    `> 用途：帮助 HR 和面试官把 JD、简历证据、面试表现对齐。此评分卡只做人工评估参考，不做自动淘汰规则，不替代 HR/用人经理最终决策。`,
    ``,
    `## 1. 简历证据核验（人工初筛参考）`,
    resumeChecks.length
      ? resumeChecks
          .map((item, index) =>
            [
              `### ${index + 1}. ${item.requirement}`,
              `- 【应看证据】${item.resumeEvidence}`,
              `- 【较匹配信号】${item.passSignal}`,
              `- 【风险信号】${item.riskSignal}`,
            ].join("\n")
          )
          .join("\n\n")
      : "（暂无已分级的必备能力，请先在对话中澄清并分级）",
    ``,
    `## 2. 面试评分维度`,
    dimensions.length
      ? dimensions
          .map((item, index) =>
            [
              `### ${index + 1}. ${item.dimension}（${item.weight}）`,
              `- 【评估内容】${item.evaluates}`,
              `- 【4-5 分信号】${item.strongSignal}`,
              `- 【3 分信号】${item.passSignal}`,
              `- 【1-2 分信号】${item.riskSignal}`,
            ].join("\n")
          )
          .join("\n\n")
      : "（暂无可评分维度）",
    ``,
    `## 3. 统一评分锚点`,
    renderDefaultScale(),
    ``,
    `## 4. 加分项与 HR 复核项`,
    `**加分项（不能替代必备能力）：**`,
    bullets(reqsByPriority(state, "preferred").length ? reqsByPriority(state, "preferred") : ["（暂无）"]),
    ``,
    `**需 HR/用人经理复核：**`,
    bullets(evaluationReviewFlags(state).length ? evaluationReviewFlags(state) : ["（暂无）"]),
    ``,
    `## 5. 推进建议边界`,
    bullets([
      "建议输出“强推荐 / 推荐 / 待定 / 不建议推进”的人工面试意见，并附关键证据。",
      "不得把学校、年龄、性别、婚育、地域等与岗位无关因素作为评分项。",
      "薪酬、职级、录用与否由 HR/用人经理结合市场、预算和面试证据最终校准。",
    ]),
  ].join("\n");
}

function resumeCheckItems(state: HiringState): {
  requirement: string;
  resumeEvidence: string;
  passSignal: string;
  riskSignal: string;
}[] {
  return state.requirements
    .filter((r) => r.priority === "must_have")
    .map((r) => {
      const requirement = r.clarified || r.raw;
      const evidence = r.candidate_evidence || r.business_scenario;
      return {
        requirement,
        resumeEvidence: evidence || `与「${requirement}」直接相关的项目、职责、结果或作品`,
        passSignal: evidence
          ? `能在简历中看到「${evidence}」对应的项目背景、个人贡献和结果`
          : "有同类业务场景下的独立贡献，并能提供结果数据或可复核产出",
        riskSignal: "只出现关键词或参与描述，缺少本人职责、判断过程、结果数据，需面试重点追问",
      };
    });
}

function scorecardDimensions(state: HiringState): {
  dimension: string;
  weight: string;
  evaluates: string;
  strongSignal: string;
  passSignal: string;
  riskSignal: string;
}[] {
  const musts = state.requirements.filter((r) => r.priority === "must_have");
  const baseWeight = musts.length ? Math.max(15, Math.floor(70 / musts.length)) : 35;
  const dimensions = musts.map((r) => {
    const label = r.clarified || r.raw;
    return {
      dimension: label,
      weight: `${baseWeight}%`,
      evaluates: r.business_scenario || r.derivation || "是否能支撑岗位核心目标",
      strongSignal:
        r.interview_check ||
        "能用完整案例说明目标、约束、个人判断、关键行动、结果与复盘，并能迁移到本岗位",
      passSignal: r.candidate_evidence
        ? `能提供「${r.candidate_evidence}」相关证据，但复杂度或独立性需继续确认`
        : "有相关经历，能说明个人贡献，但证据深度或结果量化不足",
      riskSignal: "停留在概念、团队成果或泛泛参与，无法说明个人贡献和业务结果",
    };
  });

  dimensions.push({
    dimension: "目标理解与岗位匹配",
    weight: "20%",
    evaluates: state.kpi_ownership || "是否理解岗位要解决的业务问题和成功指标",
    strongSignal: "能把个人经历映射到本岗位 KPI/里程碑，主动说明取舍和风险",
    passSignal: "能理解岗位目标，但对指标拆解或落地节奏还需面试官引导",
    riskSignal: "只复述 JD 技能词，无法说明为什么这些能力支撑岗位目标",
  });

  if (state.conflicts.length || collectHrCalibration(state).length) {
    dimensions.push({
      dimension: "约束与风险认知",
      weight: "10%",
      evaluates: "是否理解岗位约束、冲突和需要校准的地方",
      strongSignal: "能识别资源/预算/职责边界，并提出现实可行的解决路径",
      passSignal: "能接受岗位约束，但对冲突取舍需要进一步沟通",
      riskSignal: "无视关键约束，承诺明显超出岗位资源或职责范围的结果",
    });
  }

  return dimensions;
}

function evaluationReviewFlags(state: HiringState): string[] {
  return [
    ...collectHrCalibration(state),
    ...state.conflicts.map((c) => `${c.description}${c.tradeoff ? `；建议取舍：${c.tradeoff}` : ""}`),
    ...state.open_questions_for_hr,
  ].filter(Boolean);
}

function renderScale(
  scale: NonNullable<NonNullable<StructuredJdDraft["candidate_evaluation"]>["rating_scale"]>
): string {
  return scale
    .map(
      (item) =>
        `- ${textOr(item.score, "N")} 分｜${textOr(item.label, "未命名")}：${textOr(
          item.description,
          "（待补充）"
        )}`
    )
    .join("\n");
}

function renderDefaultScale(): string {
  return bullets([
    "5 分｜强匹配：独立负责过高度相似场景，能说明目标、判断、行动、结果和复盘，可较快承担岗位核心任务。",
    "4 分｜较匹配：有相近复杂度经验，关键证据清楚，少量业务差异可通过入职适应补齐。",
    "3 分｜基本匹配：具备主要能力，但独立性、规模、指标结果或业务迁移性需要进一步验证。",
    "2 分｜风险较高：只有局部参与或概念理解，缺少关键能力证据，需要明显培养成本。",
    "1 分｜明显不匹配：关键能力证据缺失，或经历与岗位目标明显错位。",
  ]);
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
