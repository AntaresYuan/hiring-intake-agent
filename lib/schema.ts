// 招聘需求澄清 Agent —— 结构化状态 Schema
// 设计原则（见项目记忆）：单 Agent + 持续更新的结构化状态，而非只依赖长 Prompt。
// 每项要求必须可追溯：业务目标 → 成功结果 → 任务 → 能力 → 行为 → 候选人证据 → 面试验证。

/** 要求的固化类型：决定用哪种归一化方法 */
export type RequirementCategory =
  | "quantifiable" // 可直接量化（薪资/年限/到岗/地点/周期/规模）
  | "behavioral" // 软性要求 → 岗位场景/期待行为/候选人证据
  | "leveled" // 按岗位所需深度分级（懂 AI / 数据分析 / 管理）
  | "semi_quantifiable" // 半量化（快速出结果 / 有一定经验 / 独立负责）
  | "risk"; // 偏见/岗位相关性不足风险（年轻 / 大厂气质 / 性格相似）

/** 一项要求当前存在的问题，触发追问或 HR 审核 */
export type RequirementIssue =
  | "vague" // 模糊词，缺场景
  | "missing" // 关键信息缺失
  | "subjective" // 主观、未行为化
  | "conflict" // 与其他要求冲突
  | "bias_risk"; // 偏见 / 岗位相关性存疑

/** 优先级分级 */
export type Priority = "must_have" | "preferred" | "trainable";

/** 责任归属：谁能最终拍板这一项 */
export type Owner = "business" | "hr" | "shared";

/** 置信度 / 未确定状态 */
export type Confidence = "confirmed" | "inferred" | "uncertain";

/** 单项招聘要求的完整结构化记录 */
export interface RequirementItem {
  id: string;
  raw: string; // 原始表达（用人经理原话）
  category: RequirementCategory; // 类型
  issues: RequirementIssue[]; // 当前问题
  clarified: string; // 澄清后的定义（量化/行为化/分级后的表述）
  priority: Priority | null; // must-have / preferred / trainable
  business_scenario: string; // 对应的业务场景
  candidate_evidence: string; // 候选人可证明此项的经历证据
  interview_check: string; // 面试验证方式
  derivation: string; // 推导来源：来自哪个业务目标 / 任务
  owner: Owner; // 责任归属
  needs_hr_calibration: boolean; // 是否需要 HR 校准
  confidence: Confidence; // 已确认事实 / AI 推断 / 未确定
}

/** 识别出的内部冲突 */
export interface Conflict {
  id: string;
  description: string; // 冲突描述
  related_item_ids: string[]; // 涉及哪些要求
  tradeoff: string; // 需要在哪些维度间取舍的建议
  owner: Owner; // 业务方可决 / 需提交 HR
}

/** 业务约束（业务侧通常能确定的部分） */
export interface Constraints {
  experience: string; // 经验
  budget: string; // 预算
  urgency: string; // 紧急度（HR 反馈缺的一环）
  location: string; // 地点
  timeline: string; // 到岗 / 周期
  team_gap: string; // 团队缺口
}

/** 完整的”业务招聘需求初稿”结构化状态 */
export interface HiringState {
  role_title: string; // 暂定岗位名（可空，避免过早收敛）
  background: string; // 招聘背景与业务目标
  kpi_ownership: string; // 一句话：岗位对哪个 KPI 负责（HR DoD 第 1 条）
  milestone_30: string; // 30 天里程碑
  milestone_90: string; // 90 天里程碑（核心交付，职责倒推锚点）
  milestone_180: string; // 180 天里程碑
  core_tasks: string[]; // 核心工作任务
  internal_check: string; // 内部转岗排查结论：是否确认无人可转 + 说明（HR 反馈缺的一环）
  constraints: Constraints;
  requirements: RequirementItem[];
  conflicts: Conflict[];
  open_questions_for_hr: string[]; // HR 待校准问题
}

/** 单轮诊断：对用人经理最新输入的即时分析（入口先展示诊断而非直接生成 JD） */
export interface TurnDiagnosis {
  vague_terms: string[]; // 识别出的模糊词
  missing_info: string[]; // 缺失的关键信息
  conflicts_found: string[]; // 本轮发现的冲突
  questions_asked: string[]; // 本轮提出的高信息增益问题（1-2 个）
}

/** 交接就绪判断（停止条件） */
export interface HandoffReadiness {
  ready: boolean;
  missing_for_handoff: string[]; // 距离可交接还差什么
}

/** 结构化选择题：当本轮追问可枚举时附带，减少用人经理打字 */
export interface ChoiceGroup {
  question: string; // 这组选项对应的问题
  multi: boolean; // 是否多选
  options: string[]; // 候选项
  allow_custom: boolean; // 是否允许“其他（自由填写）”
}

/** Agent 每轮返回的完整结果 */
export interface AgentTurnResult {
  reply: string; // 给用人经理的对话回复（含本轮 1-2 个追问）
  state: HiringState; // 全量更新后的结构化状态
  diagnosis: TurnDiagnosis; // 本轮诊断
  handoff: HandoffReadiness; // 是否可交接 HR
  choices: ChoiceGroup[]; // 本轮可点选的结构化选项（可为空）
}

/** 初始空状态 */
export function emptyState(): HiringState {
  return {
    role_title: "",
    background: "",
    kpi_ownership: "",
    milestone_30: "",
    milestone_90: "",
    milestone_180: "",
    core_tasks: [],
    internal_check: "",
    constraints: {
      experience: "",
      budget: "",
      urgency: "",
      location: "",
      timeline: "",
      team_gap: "",
    },
    requirements: [],
    conflicts: [],
    open_questions_for_hr: [],
  };
}
