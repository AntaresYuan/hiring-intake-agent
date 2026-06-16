import { describe, it, expect } from "vitest";
import { detectGaps, computeHandoff, checkReasoningChain } from "./gaps";
import { emptyState, type HiringState } from "./schema";

function blankReq(over: Partial<HiringState["requirements"][number]> = {}) {
  return {
    id: "req-1",
    raw: "能力强",
    category: "behavioral" as const,
    issues: [] as HiringState["requirements"][number]["issues"],
    clarified: "高效产出",
    priority: "must_have" as const,
    business_scenario: "做召回模型迭代",
    candidate_evidence: "主导过线上模型优化",
    interview_check: "让其讲一个优化案例",
    derivation: "来自CTR提升目标",
    owner: "business" as const,
    needs_hr_calibration: false,
    confidence: "confirmed" as const,
    ...over,
  };
}

describe("detectGaps", () => {
  it("空状态报出 HR DoD 的硬缺口", () => {
    const g = detectGaps(emptyState());
    const fields = g.map((x) => x.field);
    expect(fields).toContain("kpi_ownership");
    expect(fields).toContain("assessable");
    expect(fields).toContain("budget");
    expect(fields).toContain("milestone_90");
    expect(fields).toContain("internal_check");
  });
});

describe("computeHandoff", () => {
  it("硬条件未齐 → 不可交接", () => {
    expect(computeHandoff(emptyState()).ready).toBe(false);
  });

  it("HR DoD 5 条齐全 → 可交接", () => {
    const s: HiringState = {
      ...emptyState(),
      kpi_ownership: "对推荐 CTR 负责",
      background: "支撑推荐业务",
      milestone_90: "上线召回模型，CTR+5%",
      core_tasks: ["特征工程"],
      internal_check: "已排查，团队内无人具备推荐召回经验",
      requirements: [blankReq()],
      constraints: { ...emptyState().constraints, budget: "45k" },
    };
    expect(computeHandoff(s).ready).toBe(true);
  });

  it("缺内部转岗排查 → 不可交接", () => {
    const s: HiringState = {
      ...emptyState(),
      kpi_ownership: "对推荐 CTR 负责",
      milestone_90: "上线召回模型",
      internal_check: "",
      requirements: [blankReq()],
      constraints: { ...emptyState().constraints, budget: "45k" },
    };
    expect(computeHandoff(s).ready).toBe(false);
  });
});

describe("checkReasoningChain", () => {
  it("断链被检出：缺推导来源 / 缺证据 / 必备缺面试验证", () => {
    const s: HiringState = {
      ...emptyState(),
      requirements: [
        blankReq({ derivation: "", candidate_evidence: "", interview_check: "" }),
      ],
    };
    const issues = checkReasoningChain(s);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it("完整链路无告警", () => {
    const s: HiringState = { ...emptyState(), requirements: [blankReq()] };
    expect(checkReasoningChain(s)).toHaveLength(0);
  });
});
