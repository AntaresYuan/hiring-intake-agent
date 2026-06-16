import { AgentTurnResult, HiringState } from "./schema";

// 确定性 mock：无 API key 时让产品闭环依然可跑通（演示 / 离线测试用）。
// 它不做真实推理，只根据轮次给出有代表性的诊断与追问。

export function mockTurn(
  history: { role: "user" | "assistant"; content: string }[],
  prevState: HiringState
): AgentTurnResult {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const userText = lastUser?.content ?? "";
  const turn = history.filter((m) => m.role === "user").length;

  const state: HiringState = {
    ...prevState,
    background:
      prevState.background ||
      "（mock）需补充：这个岗位是为了支撑哪条业务线、解决什么具体问题。",
    requirements: prevState.requirements.length
      ? prevState.requirements
      : [
          {
            id: "req-1",
            raw: userText.slice(0, 40) || "（用人经理初始描述）",
            category: "behavioral",
            issues: ["vague", "missing"],
            clarified: "（mock）尚未澄清：需要场景化这条要求。",
            priority: null,
            business_scenario: "",
            candidate_evidence: "",
            interview_check: "",
            derivation: "待确认对应的业务目标",
            owner: "business",
            needs_hr_calibration: false,
            confidence: "uncertain",
          },
        ],
  };

  return {
    reply:
      turn <= 1
        ? "（mock 模式，未配置 API key）先从业务目标说起：这个岗位招进来，主要是为了解决哪个最具体的业务问题？以及你期望他 3 个月内做出什么结果？"
        : "（mock 模式）收到。如果要配置真实模型，请在 .env.local 设置 LLM_API_KEY 后重启。",
    state,
    diagnosis: {
      vague_terms: ["（mock）能力强", "经验丰富"],
      missing_info: ["业务目标", "3/6 个月成功结果", "核心任务"],
      conflicts_found: [],
      questions_asked: ["这个岗位要解决的最具体业务问题是什么？"],
    },
    handoff: {
      ready: false,
      missing_for_handoff: ["业务目标", "核心任务", "关键能力深度", "可量化约束"],
    },
    choices:
      turn <= 1
        ? [
            {
              question: "“能力强”主要指哪些方向的能力？（可多选）",
              multi: true,
              options: ["模型研发", "工程落地", "算法优化", "数据分析"],
              allow_custom: true,
            },
          ]
        : [],
  };
}
