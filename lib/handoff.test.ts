import { describe, it, expect } from "vitest";
import {
  buildHandoffBrief,
  buildHrAgentPrompt,
  collectHrCalibration,
} from "./handoff";
import { emptyState, type HiringState } from "./schema";

function sample(): HiringState {
  return {
    ...emptyState(),
    role_title: "推荐算法工程师",
    background: "信息流CTR增长乏力",
    kpi_ownership: "对信息流CTR负责",
    milestone_90: "召回模型上线，CTR+5%",
    core_tasks: ["特征工程"],
    internal_check: "团队内无人做过召回",
    requirements: [
      {
        id: "req-1",
        raw: "大厂经验",
        category: "risk",
        issues: ["bias_risk"],
        clarified: "头部互联网推荐方向经验",
        priority: "must_have",
        business_scenario: "",
        candidate_evidence: "",
        interview_check: "",
        derivation: "",
        owner: "hr",
        needs_hr_calibration: true,
        confidence: "inferred",
      },
    ],
    conflicts: [
      {
        id: "kb-conf-budget-level",
        description: "预算低于职级区间",
        related_item_ids: [],
        tradeoff: "提预算或降资历",
        owner: "hr",
      },
    ],
    constraints: { ...emptyState().constraints, budget: "20k", urgency: "两个月内" },
    open_questions_for_hr: ["确认职级"],
  };
}

describe("collectHrCalibration", () => {
  it("汇总待校准项、含 needs_hr_calibration 的要求与预算职级", () => {
    const items = collectHrCalibration(sample());
    expect(items).toContain("确认职级");
    expect(items).toContain("头部互联网推荐方向经验");
    expect(items.some((i) => i.includes("预算与职级"))).toBe(true);
  });
});

describe("buildHandoffBrief", () => {
  it("简报含摘要/里程碑/冲突/待校准等关键段落", () => {
    const md = buildHandoffBrief(sample());
    expect(md).toContain("一句话摘要");
    expect(md).toContain("推荐算法工程师");
    expect(md).toContain("对「对信息流CTR负责」负责");
    expect(md).toContain("⚠ 关键冲突与取舍");
    expect(md).toContain("提预算或降资历");
    expect(md).toContain("需要 HR 校准的清单");
    expect(md).toContain("仅人工拍板");
    // 行内标记
    expect(md).toContain("待HR校准");
  });
});

describe("buildHrAgentPrompt", () => {
  it("含角色定义、结构化 JSON、待校准与冲突", () => {
    const p = buildHrAgentPrompt(sample());
    expect(p).toContain("HR 校准 Agent");
    expect(p).toContain("```json");
    expect(p).toContain("推荐算法工程师");
    expect(p).toContain("待你校准的清单");
    expect(p).toContain("需 HR 决策的冲突");
  });
});
