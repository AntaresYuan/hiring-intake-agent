import { describe, it, expect } from "vitest";
import { assembleFallback } from "./export";
import { emptyState, type HiringState } from "./schema";

describe("assembleFallback", () => {
  const state: HiringState = {
    ...emptyState(),
    role_title: "推荐算法工程师",
    background: "支撑信息流推荐",
    kpi_ownership: "对信息流 CTR 负责",
    milestone_90: "召回模型上线，CTR+5%",
    core_tasks: ["特征工程", "召回模型迭代"],
    requirements: [
      {
        id: "req-1",
        raw: "能独立扛事",
        category: "semi_quantifiable",
        issues: [],
        clarified: "能独立负责召回模型从0到1",
        priority: "must_have",
        business_scenario: "独立推进召回项目",
        candidate_evidence: "主导过推荐召回上线",
        interview_check: "请讲一个你独立负责的召回项目",
        derivation: "来自90天上线目标",
        owner: "business",
        needs_hr_calibration: false,
        confidence: "confirmed",
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
    constraints: { ...emptyState().constraints, budget: "35k" },
  };

  it("JD 含关键字段且标注待 HR 校准", () => {
    const { jd } = assembleFallback(state);
    expect(jd).toContain("推荐算法工程师");
    expect(jd).toContain("对信息流 CTR 负责");
    expect(jd).toContain("能独立负责召回模型从0到1");
    expect(jd).toContain("待 HR 校准");
  });

  it("面试框架按必备能力逐条 + 含冲突取舍节", () => {
    const { interview } = assembleFallback(state);
    expect(interview).toContain("能独立负责召回模型从0到1");
    expect(interview).toContain("考察点");
    expect(interview).toContain("重点验证的取舍");
    expect(interview).toContain("提预算或降资历");
  });
});
