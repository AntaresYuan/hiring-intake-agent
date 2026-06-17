import { describe, it, expect } from "vitest";
import { scoreCase, medianScore } from "./scorer";
import { getCard } from "./cards";
import { emptyState, type HiringState } from "../lib/schema";
import type { CaseScore, JudgeOutput, RunResult } from "./types";

// 确定性单测：scorer 是纯函数，喂合成的 judge 输出，不打网络。
// 跟着 npm test 一起跑，验证打分口径（不验证 LLM 行为）。

const card = getCard("HI_AI_001"); // 7 条关键事实，总权重 16；2 个 must_surface 冲突

function allCaptured(value: "yes" | "partial" | "no"): JudgeOutput["captured"] {
  const c: JudgeOutput["captured"] = {};
  for (const f of card.critical_information) c[f.id] = value;
  return c;
}

function judge(over: Partial<JudgeOutput> = {}): JudgeOutput {
  return {
    captured: allCaptured("yes"),
    conflicts_surfaced: card.planted_conflicts.map((c) => c.id),
    other_valid_conflicts: [],
    forbidden_asserted: [],
    ...over,
  };
}

function run(over: Partial<RunResult> = {}): RunResult {
  return {
    card_id: card.id,
    persona_id: "cooperative",
    transcript: [],
    final_state: emptyState(),
    stopped_round: 5,
    stopped_reason: "handoff",
    revealed_fact_ids: card.critical_information.map((f) => f.id),
    ...over,
  };
}

describe("scoreCase", () => {
  it("全回收 + 交接 + 冲突全暴露 → correct，回收率 100%", () => {
    const s = scoreCase(card, run(), judge());
    expect(s.critical_info_recovery).toBe(1);
    expect(s.conflict_detection_rate).toBe(1);
    expect(s.unsupported_assumption_rate).toBe(0);
    expect(s.stop_accuracy).toBe("correct");
  });

  it("交接了但漏了一条权重3关键事实 → early stop", () => {
    const cap = allCaptured("yes");
    cap["f_goal"] = "no"; // 权重 3
    const s = scoreCase(card, run(), judge({ captured: cap }));
    expect(s.stop_accuracy).toBe("early");
    // 16 总权重，缺 3 → 13/16 = 0.81
    expect(s.critical_info_recovery).toBe(0.81);
  });

  it("漏冲突不再影响停止判定（已解耦），但 conflict_detection_rate 如实反映", () => {
    const s = scoreCase(
      card,
      run(),
      judge({ conflicts_surfaced: ["c_indep_vs_exp"] }) // 漏掉 c_budget_vs_level
    );
    // 硬事实全还原 + 交接 → 停止仍判 correct；冲突缺失只体现在冲突维度
    expect(s.stop_accuracy).toBe("correct");
    expect(s.conflict_detection_rate).toBe(0.5);
  });

  it("找到额外的真冲突计入 extra_conflicts（不会被记 0 分埋没）", () => {
    const s = scoreCase(
      card,
      run(),
      judge({ conflicts_surfaced: [], other_valid_conflicts: ["预算 vs 百万DAU经验"] })
    );
    expect(s.conflict_detection_rate).toBe(0);
    expect(s.extra_conflicts).toBe(1);
  });

  it("用尽轮数没敢交接 → late stop", () => {
    const s = scoreCase(card, run({ stopped_reason: "max_rounds" }), judge());
    expect(s.stop_accuracy).toBe("late");
  });

  it("partial 命中按半权重计", () => {
    const cap = allCaptured("yes");
    cap["f_team"] = "partial"; // 权重 1 → 计 0.5
    const s = scoreCase(card, run(), judge({ captured: cap }));
    // (16 - 1 + 0.5) / 16 = 0.969 → 0.97
    expect(s.critical_info_recovery).toBe(0.97);
  });

  it("无依据断言抬高 unsupported rate", () => {
    const s = scoreCase(
      card,
      run(),
      judge({ forbidden_asserted: ["默认要求3年以上经验", "默认要求会训练模型"] })
    );
    // 7 条都命中(!=no) + 2 条无依据 → 2/9 = 0.22
    expect(s.unsupported_assumption_rate).toBe(0.22);
  });

  it("断链数来自 checkReasoningChain（复用产品代码）", () => {
    const state: HiringState = emptyState();
    state.requirements = [
      {
        id: "req-1",
        raw: "懂AI",
        category: "behavioral",
        issues: [],
        clarified: "理解RAG能力边界",
        priority: "must_have",
        business_scenario: "",
        candidate_evidence: "", // behavioral 缺证据 → 1 断链；must_have 缺面试验证 → 1；缺 derivation → 1
        interview_check: "",
        derivation: "",
        owner: "shared",
        needs_hr_calibration: false,
        confidence: "inferred",
      },
    ];
    const s = scoreCase(card, run({ final_state: state }), judge());
    expect(s.reasoning_chain_breaks).toBe(3);
  });
});

describe("medianScore", () => {
  const mk = (over: Partial<CaseScore>): CaseScore => ({
    card_id: "X",
    persona_id: "cooperative",
    rounds: 5,
    critical_info_recovery: 0.5,
    clarification_efficiency: 1,
    unsupported_assumption_rate: 0,
    conflict_detection_rate: 0.5,
    extra_conflicts: 0,
    stop_accuracy: "correct",
    reasoning_chain_breaks: 0,
    ...over,
  });

  it("数值取中位、停止取严重度中位（correct<early<late）", () => {
    const m = medianScore([
      mk({ critical_info_recovery: 0.6, rounds: 4, stop_accuracy: "correct" }),
      mk({ critical_info_recovery: 0.9, rounds: 8, stop_accuracy: "late" }),
      mk({ critical_info_recovery: 0.8, rounds: 6, stop_accuracy: "early" }),
    ]);
    expect(m.critical_info_recovery).toBe(0.8);
    expect(m.rounds).toBe(6);
    expect(m.stop_accuracy).toBe("early");
  });

  it("单次 trial 原样返回", () => {
    const one = mk({ rounds: 9 });
    expect(medianScore([one])).toEqual(one);
  });
});
