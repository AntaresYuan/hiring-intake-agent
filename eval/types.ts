import type { HiringState, RecruitType } from "../lib/schema";

// 测评框架的类型定义。
// 设计来源（见项目记忆 [[评估框架与基础测试案例]]）：
//   - hidden-state 设计借鉴 ClarQ-LLM：gold 不是「标准对话」，而是一份「水下真相」，
//     模拟用人经理只在 Agent 问到点上时才透露。
//   - persona 行为借鉴 ClarifyMT-Bench：用人经理不只有「理想配合」一种。
//   - 每问一个问题，最终交付是否真的变好（ProClare 思想）→ 用覆盖率/效率衡量。
//   - 指标与产品共用口径：复用 lib/gaps 的 DoD 停止条件，不另造标准。

/** 一条「关键事实」：埋在水下、Agent 必须靠提问挖出来的真相 */
export interface CriticalFact {
  id: string;
  label: string; // 人类可读名（报告里展示）
  truth: string; // 水下真相（标准答案，喂给模拟经理，不给被测 Agent）
  weight: 1 | 2 | 3; // 加权：3=没它就不能交接，1=锦上添花
  /** 该事实最终应落到结构化 state 的哪个区域（仅作定位提示，覆盖判定用 judge 语义匹配） */
  lands_in:
    | "background"
    | "kpi_ownership"
    | "milestone"
    | "core_tasks"
    | "constraints"
    | "requirement"
    | "internal_check"
    | "conflict";
  /** 披露条件：Agent 的提问意图命中什么时，模拟经理才透露（给模拟经理看） */
  reveal_when: string;
}

/** 预埋冲突：必须被 Agent 主动暴露并要求取舍 */
export interface PlantedConflict {
  id: string;
  description: string; // 冲突内容（标准答案）
  must_surface: boolean; // true=漏掉它则本案视为「早停/不合格」
}

/** 一张隐藏角色卡（gold specification）。被测 Agent 只能看到 initial_request。 */
export interface GoldCard {
  id: string;
  type: "ambiguous" | "conflict" | "missing_goal" | "type_mismatch";
  recruit_type: RecruitType; // 社招/校招/转正实习/日常实习 —— 喂给模拟经理，让它扮对类型
  title: string;
  role_family: string; // 命中 KB 的岗位名（算法工程师 / 产品经理 / 运营）→ 让预算冲突检测能触发
  initial_request: string; // 用人经理开场那句模糊话（唯一暴露给 Agent 的输入）
  critical_information: CriticalFact[];
  planted_conflicts: PlantedConflict[];
  must_detect: string[]; // 应被诊断出的模糊/缺失/偏见点（给报告做人读参考）
  acceptable_question_intents: string[]; // 合格追问意图（judge 语义匹配用）
  forbidden_inferences: string[]; // 不得无依据断言的事项 → 命中即记 Unsupported Assumption
  expected_hr_escalations: string[]; // 应交 HR 校准的事项
}

/** 模拟用人经理的人格（ClarifyMT 六类行为） */
export interface Persona {
  id:
    | "cooperative" // 配合且表达清晰
    | "partial" // 只回答一半
    | "vague" // 持续使用模糊词
    | "contradictory" // 前后矛盾
    | "impatient" // 不耐烦、想快点结束
    | "deferring"; // 把问题推给 HR / 让 Agent 替自己拿主意
  label: string;
  instruction: string; // 注入模拟经理 prompt 的行为指令
}

/** 模拟用人经理每轮的结构化输出 */
export interface ManagerReply {
  reply: string; // 自然语言回答（成为下一轮 Agent 的 user 输入）
  revealed_fact_ids: string[]; // 本轮实际透露了卡上的哪些关键事实（披露账本，供打分对照）
}

/** 一轮对话的记录 */
export interface TurnRecord {
  round: number;
  agent_reply: string;
  questions_asked: string[];
  manager_reply: string;
  revealed_fact_ids: string[];
  handoff_ready: boolean;
  gaps_remaining: string[];
}

/** 一次完整 run（一张卡 × 一个 persona）的结果 */
export interface RunResult {
  card_id: string;
  persona_id: Persona["id"];
  transcript: TurnRecord[];
  final_state: HiringState;
  stopped_round: number;
  stopped_reason: "handoff" | "max_rounds";
  /** 全程被透露过的关键事实 id（披露账本汇总） */
  revealed_fact_ids: string[];
}

/** judge 对一次 run 的 reference-anchored 判定（一次 LLM 调用产出） */
export interface JudgeOutput {
  /** 每条关键事实是否落进了最终 state：yes=完整 / partial=部分 / no=没有 */
  captured: Record<string, "yes" | "partial" | "no">;
  /** 被成功暴露的预埋冲突 id */
  conflicts_surfaced: string[];
  /** Agent 主动暴露的、其他实质且正确的冲突（不在预埋清单里，但确实成立）——避免“找到真冲突却记 0 分” */
  other_valid_conflicts: string[];
  /** Agent 无依据就断言的事项（来自 forbidden_inferences，命中即列出） */
  forbidden_asserted: string[];
}

/** 落盘的完整测评报告（给看板页读） */
export interface EvalReport {
  generated_at: string;
  models: { agent: string; sim: string; judge: string };
  scores: CaseScore[];
  // 用结构化字面量避免 types.ts ↔ fairness.ts 循环依赖
  fairness: {
    case_id: string;
    label: string;
    passed: boolean;
    violations: string[];
    agent_replies: string[]; // 存下来便于复核 judge 判定（防 judge 误判悄悄过去）
  }[];
  runs: RunResult[]; // 含每案 transcript，供看板点开钻取
}

/** 单案最终评分卡 */
export interface CaseScore {
  card_id: string;
  persona_id: Persona["id"];
  rounds: number;
  critical_info_recovery: number; // 0-1，加权
  clarification_efficiency: number; // 加权回收 / 轮数
  unsupported_assumption_rate: number; // 0-1，无依据断言占比
  conflict_detection_rate: number; // 0-1，暴露的预埋冲突 / 全部预埋冲突
  extra_conflicts: number; // 额外找到的、其他实质正确冲突数（仅信息展示，不计入 rate）
  stop_accuracy: "correct" | "early" | "late";
  reasoning_chain_breaks: number; // checkReasoningChain 断链数
}

/** 单案 live 运行时,SSE 推给前端的事件 */
export type EvalEvent =
  | { type: "turn"; turn: TurnRecord }
  | { type: "scored"; score: CaseScore; final_state: HiringState }
  | { type: "error"; message: string };
