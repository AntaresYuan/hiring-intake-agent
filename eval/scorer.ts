import { checkReasoningChain } from "../lib/gaps";
import type { GoldCard, RunResult, JudgeOutput, CaseScore } from "./types";

// 打分器：纯函数，不调 LLM。输入 = 卡 + run 记录 + judge 判定，输出 = 评分卡。
// 之所以纯，是为了让 scorer.test.ts 喂合成的 judge 输出做确定性单测（不打网络）。
// 复用产品代码 checkReasoningChain（product 与 eval 共用口径，见项目记忆）。

const PARTIAL = 0.5;

export function scoreCase(
  card: GoldCard,
  run: RunResult,
  judge: JudgeOutput
): CaseScore {
  const facts = card.critical_information;
  const totalWeight = facts.reduce((s, f) => s + f.weight, 0);
  const recoveredWeight = facts.reduce((s, f) => {
    const c = judge.captured[f.id];
    return s + (c === "yes" ? f.weight : c === "partial" ? f.weight * PARTIAL : 0);
  }, 0);
  const criticalInfoRecovery = totalWeight ? recoveredWeight / totalWeight : 0;

  const rounds = run.stopped_round || 1;
  // 澄清效率：单位轮数回收多少加权关键信息（堵“一口气抛 20 个问题”）
  const clarificationEfficiency = recoveredWeight / rounds;

  // 无依据断言占比：被断言的事实里，有多少是没依据硬编的
  const capturedCount = facts.filter((f) => judge.captured[f.id] !== "no").length;
  const unsupported = judge.forbidden_asserted.length;
  const denom = capturedCount + unsupported;
  const unsupportedAssumptionRate = denom ? unsupported / denom : 0;

  const planted = card.planted_conflicts;
  const conflictDetectionRate = planted.length
    ? judge.conflicts_surfaced.length / planted.length
    : 1;
  const extraConflicts = judge.other_valid_conflicts.length;

  // 停止准确性：只看「信息是否足够交接」（硬事实 weight-3 是否还原）。
  // 冲突识别单列为独立维度，不再塞进停止判定——否则一个找到了"不同但真实"冲突的
  // Agent 也会被判早停，严重失真（这是 0/8 correct 假象的主因）。
  const hardMissing = facts.some(
    (f) => f.weight === 3 && judge.captured[f.id] !== "yes"
  );
  let stopAccuracy: CaseScore["stop_accuracy"];
  if (run.stopped_reason === "handoff") {
    stopAccuracy = hardMissing ? "early" : "correct";
  } else {
    stopAccuracy = "late";
  }

  const reasoningChainBreaks = checkReasoningChain(run.final_state).length;

  return {
    card_id: card.id,
    persona_id: run.persona_id,
    rounds,
    critical_info_recovery: round2(criticalInfoRecovery),
    clarification_efficiency: round2(clarificationEfficiency),
    unsupported_assumption_rate: round2(unsupportedAssumptionRate),
    conflict_detection_rate: round2(conflictDetectionRate),
    extra_conflicts: extraConflicts,
    stop_accuracy: stopAccuracy,
    reasoning_chain_breaks: reasoningChainBreaks,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 把同一案例的多次 trial 取中位:数值取中位数,stop_accuracy 按严重度(correct<early<late)取中位。 */
export function medianScore(scores: CaseScore[]): CaseScore {
  if (scores.length === 0) throw new Error("medianScore: 空数组");
  if (scores.length === 1) return scores[0];
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const sev = ["correct", "early", "late"] as const;
  const ranks = scores.map((s) => sev.indexOf(s.stop_accuracy)).sort((a, b) => a - b);
  const base = scores[0];
  return {
    card_id: base.card_id,
    persona_id: base.persona_id,
    rounds: med(scores.map((s) => s.rounds)),
    critical_info_recovery: med(scores.map((s) => s.critical_info_recovery)),
    clarification_efficiency: med(scores.map((s) => s.clarification_efficiency)),
    unsupported_assumption_rate: med(scores.map((s) => s.unsupported_assumption_rate)),
    conflict_detection_rate: med(scores.map((s) => s.conflict_detection_rate)),
    extra_conflicts: med(scores.map((s) => s.extra_conflicts)),
    stop_accuracy: sev[ranks[Math.floor(ranks.length / 2)]],
    reasoning_chain_breaks: med(scores.map((s) => s.reasoning_chain_breaks)),
  };
}
