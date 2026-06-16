import { chatJSON, hasApiKey } from "./llm";
import { buildTurnMessages } from "./prompts";
import { mockTurn } from "./mock";
import { detectGaps, computeHandoff, checkReasoningChain } from "./gaps";
import {
  lookupRole,
  archetypeForPrompt,
  detectBudgetLevelConflict,
} from "./kb";
import {
  AgentTurnResult,
  HiringState,
  emptyState,
  RequirementItem,
  Conflict,
  ChoiceGroup,
} from "./schema";

export interface TurnInput {
  history: { role: "user" | "assistant"; content: string }[];
  state: HiringState | null;
}

/**
 * Workflow controller：每轮编排「代码确定性步骤 + 单次 LLM 调用」。
 *   1. 代码：检测缺口 + 预取岗位知识 →（喂给 LLM，省去模型重算）
 *   2. LLM：拆解/分类/语义冲突/措辞/选项（开放、需语言理解的部分）
 *   3. 代码：数值冲突检测、确定性停止判定、推导链结构核查
 */
export async function runTurn(input: TurnInput): Promise<AgentTurnResult> {
  const prevState = input.state ?? emptyState();

  // 无 API key 时走确定性 mock，保证产品闭环始终可运行（硬基线）
  if (!hasApiKey()) {
    return mockTurn(input.history, prevState);
  }

  // --- 1. 代码侧前置：缺口 + 预取知识库（基于上一轮已知岗位）---
  const gaps = detectGaps(prevState);
  const archPrev = lookupRole(prevState.role_title);
  const kbContext = archPrev ? archetypeForPrompt(archPrev) : null;

  // --- 2. LLM 调用 + 鲁棒重试 ---
  // 失败模式：DeepSeek 偶发在 JSON 模式下整段输出空白/非 JSON（finish=stop）。
  // 原样重发往往还是空白，所以重试时追加一条纠正指令打破该模式，最多试 3 次。
  const messages = buildTurnMessages(input.history, prevState, gaps, kbContext);
  let res = await chatJSON(messages);
  for (let attempt = 1; attempt < 3 && (res.truncated || !isParseable(res.content)); attempt++) {
    const nudged = [
      ...messages,
      {
        role: "system" as const,
        content:
          "你上一次没有输出有效内容。现在请『只』输出一个合法的 JSON 对象（严格按要求的结构），不要输出空白、解释或代码围栏。",
      },
    ];
    res = await chatJSON(nudged, 16384, 0.8); // 调高温度打破"确定性空白"
  }

  // 兜底回复用代码已知的缺口来自然追问，而不是"装没看懂"
  const gapReply = gaps.length
    ? `我们接着把需求理清——可以先说说「${gaps[0].label}」吗？`
    : "我们接着聊，请补充一下这个岗位的细节。";
  const result = normalizeResult(res.content, prevState, gapReply);

  if (!isParseable(res.content)) {
    console.error("[chat] LLM 连续返回无效内容，已用缺口兜底", {
      finish: res.finishReason,
      len: res.content.length,
    });
  }

  // --- 3. 代码侧后置：数值冲突、停止判定、推导链核查 ---
  return applyWorkflow(result);
}

/** 对 LLM 产出的状态叠加确定性的 workflow 结果 */
export function applyWorkflow(result: AgentTurnResult): AgentTurnResult {
  const state = result.state;

  // 数值型冲突（预算 vs 职级）—— 代码侧检测后合并
  const arch = lookupRole(state.role_title);
  if (arch) {
    const kbConflict = detectBudgetLevelConflict(state, arch);
    if (kbConflict && !state.conflicts.some((c) => c.id === kbConflict.id)) {
      state.conflicts = [...state.conflicts, kbConflict];
    }
  }

  // 去重：LLM 常和 KB 重复报"预算 vs 职级"，保留带市场数值的 KB 那条
  state.conflicts = dedupeConflicts(state.conflicts);

  // 确定性停止判定（覆盖模型自评）
  const handoff = computeHandoff(state);

  // 推导链结构核查 → 并入诊断，提示下一轮该补什么
  const chainIssues = checkReasoningChain(state);
  const diagnosis = {
    ...result.diagnosis,
    missing_info: Array.from(
      new Set([...result.diagnosis.missing_info, ...chainIssues])
    ),
  };

  return { ...result, state, handoff, diagnosis };
}

/** 宽松判断一段文本是否像可解析的完整 JSON 对象（用于决定是否重试） */
export function isParseable(raw: string): boolean {
  return tryParse(raw) !== null;
}

/** 鲁棒解析：兼容 ```json 围栏、首尾多余文字，截取最外层 {…} 再解析 */
function tryParse(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const candidates = [raw];
  const fenced = raw.replace(/```json\s*/gi, "").replace(/```/g, "");
  candidates.push(fenced);
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(fenced.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === "object") return v as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** 把模型返回的 JSON 解析并补全为合法的 AgentTurnResult，避免缺字段导致前端崩溃 */
export function normalizeResult(
  raw: string,
  prevState: HiringState,
  fallbackReply = "（抱歉，我这边刚才处理你的回答时出了点状况，已记下你的选择。可以再补一句、或重发一次刚才的内容吗？）"
): AgentTurnResult {
  const parsed = (tryParse(raw) ?? {}) as Partial<AgentTurnResult>;

  const state = normalizeState(parsed.state, prevState);

  return {
    reply:
      typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply
        : fallbackReply,
    state,
    diagnosis: {
      vague_terms: arr(parsed.diagnosis?.vague_terms),
      missing_info: arr(parsed.diagnosis?.missing_info),
      conflicts_found: arr(parsed.diagnosis?.conflicts_found),
      questions_asked: arr(parsed.diagnosis?.questions_asked),
    },
    handoff: {
      ready: Boolean(parsed.handoff?.ready),
      missing_for_handoff: arr(parsed.handoff?.missing_for_handoff),
    },
    choices: normalizeChoices(parsed.choices),
  };
}

/** 是否属于"预算 vs 职级/经验"主题（用于去重；排除全才/复合类，避免误并） */
function isBudgetLevelTheme(c: Conflict): boolean {
  const d = c.description;
  return (
    /预算|薪资|薪酬/.test(d) &&
    /职级|经验|资深|年限|市场|p\d/i.test(d) &&
    !/全才|全能|复合|多领域/.test(d)
  );
}

/** 冲突去重：同主题预算/职级冲突只保留带市场数值的 KB 那条；并去掉完全重复的描述 */
export function dedupeConflicts(conflicts: Conflict[]): Conflict[] {
  // 让 KB（带数值，id 以 kb-conf 开头）排在前面，优先保留
  const ordered = [...conflicts].sort((a, b) => {
    const ak = a.id.startsWith("kb-conf") ? 1 : 0;
    const bk = b.id.startsWith("kb-conf") ? 1 : 0;
    return bk - ak;
  });

  const out: Conflict[] = [];
  const seen = new Set<string>();
  let budgetKept: Conflict | null = null;

  for (const c of ordered) {
    const norm = c.description.replace(/[\s，。、,.;；：:（）()「」"'%]/g, "");
    if (seen.has(norm)) continue;

    if (isBudgetLevelTheme(c)) {
      if (budgetKept) {
        // 合并被丢弃那条关联的要求 id，不丢失信息
        budgetKept.related_item_ids = Array.from(
          new Set([...budgetKept.related_item_ids, ...c.related_item_ids])
        );
        continue;
      }
      budgetKept = c;
    }

    seen.add(norm);
    out.push(c);
  }
  return out;
}

function normalizeChoices(v: unknown): ChoiceGroup[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c): ChoiceGroup => {
      const g = c as Partial<ChoiceGroup>;
      return {
        question: str(g.question, ""),
        multi: Boolean(g.multi),
        options: arr<string>(g.options).filter((o) => typeof o === "string"),
        allow_custom: g.allow_custom !== false,
      };
    })
    .filter((g) => g.options.length > 0);
}

function normalizeState(
  s: Partial<HiringState> | undefined,
  prev: HiringState
): HiringState {
  if (!s) return prev;
  return {
    role_title: str(s.role_title, prev.role_title),
    background: str(s.background, prev.background),
    kpi_ownership: str(s.kpi_ownership, prev.kpi_ownership),
    milestone_30: str(s.milestone_30, prev.milestone_30),
    milestone_90: str(s.milestone_90, prev.milestone_90),
    milestone_180: str(s.milestone_180, prev.milestone_180),
    core_tasks: arr(s.core_tasks),
    internal_check: str(s.internal_check, prev.internal_check),
    constraints: {
      experience: str(s.constraints?.experience, prev.constraints.experience),
      budget: str(s.constraints?.budget, prev.constraints.budget),
      urgency: str(s.constraints?.urgency, prev.constraints.urgency),
      location: str(s.constraints?.location, prev.constraints.location),
      timeline: str(s.constraints?.timeline, prev.constraints.timeline),
      team_gap: str(s.constraints?.team_gap, prev.constraints.team_gap),
    },
    requirements: Array.isArray(s.requirements)
      ? s.requirements.map(normalizeRequirement)
      : prev.requirements,
    conflicts: Array.isArray(s.conflicts)
      ? s.conflicts.map(normalizeConflict)
      : prev.conflicts,
    open_questions_for_hr: arr(s.open_questions_for_hr),
  };
}

function normalizeRequirement(r: Partial<RequirementItem>, i: number): RequirementItem {
  return {
    id: str(r.id, `req-${i + 1}`),
    raw: str(r.raw, ""),
    category: r.category ?? "behavioral",
    issues: arr(r.issues) as RequirementItem["issues"],
    clarified: str(r.clarified, ""),
    priority: r.priority ?? null,
    business_scenario: str(r.business_scenario, ""),
    candidate_evidence: str(r.candidate_evidence, ""),
    interview_check: str(r.interview_check, ""),
    derivation: str(r.derivation, ""),
    owner: r.owner ?? "shared",
    needs_hr_calibration: Boolean(r.needs_hr_calibration),
    confidence: r.confidence ?? "inferred",
  };
}

function normalizeConflict(c: Partial<Conflict>, i: number): Conflict {
  return {
    id: str(c.id, `conf-${i + 1}`),
    description: str(c.description, ""),
    related_item_ids: arr(c.related_item_ids),
    tradeoff: str(c.tradeoff, ""),
    owner: c.owner === "hr" ? "hr" : "business",
  };
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function arr<T = string>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
