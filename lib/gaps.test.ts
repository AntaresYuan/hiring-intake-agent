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

  function readyState(): HiringState {
    return {
      ...emptyState(),
      kpi_ownership: "对推荐 CTR 负责，目标 +5%", // 带可量化目标
      background: "支撑推荐业务",
      milestone_90: "上线召回模型，CTR+5%",
      core_tasks: ["特征工程"],
      internal_check: "已排查，团队内无人具备推荐召回经验",
      requirements: [blankReq()],
      constraints: { ...emptyState().constraints, budget: "45k" },
    };
  }

  it("HR DoD 5 条齐全 → 可交接", () => {
    expect(computeHandoff(readyState()).ready).toBe(true);
  });

  it("KPI 只给方向、没有可量化目标 → 不可交接", () => {
    const s = { ...readyState(), kpi_ownership: "降低客服工单量" };
    expect(computeHandoff(s).ready).toBe(false);
  });

  it("预算只写“待 HR 校准”这类非数字 → 不可交接", () => {
    const s: HiringState = {
      ...readyState(),
      constraints: { ...readyState().constraints, budget: "待 HR 校准" },
    };
    expect(computeHandoff(s).ready).toBe(false);
  });

  it("预算已给具体数字但现实性冲突仍在 → 可交接给 HR 校准，不在业务侧卡死", () => {
    const s: HiringState = {
      ...readyState(),
      constraints: { ...readyState().constraints, budget: "20k" },
      conflicts: [
        {
          id: "kb-conf-budget-level",
          description: "要求偏资深，但预算低于该岗位市场区间",
          related_item_ids: ["req-1"],
          tradeoff: "",
          owner: "hr",
        },
      ],
    };

    expect(detectGaps(s).map((g) => g.field)).toContain("budget_align");
    expect(computeHandoff(s).ready).toBe(true);
    expect(computeHandoff(s).missing_for_handoff).toEqual([]);
  });

  it("实习日薪“200元/天”是有效预算，不再误报缺口（修社招假设回归）", () => {
    const s: HiringState = {
      ...readyState(),
      constraints: { ...readyState().constraints, budget: "200元/天" },
    };
    expect(detectGaps(s).map((g) => g.field)).not.toContain("budget");
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

describe("computeHandoff 按招聘类型裁剪", () => {
  it("校招：砍内部转岗、KPI 不强制数字 → 同一 state 校招可交接、社招不可", () => {
    const s: HiringState = {
      ...emptyState(),
      recruit_type: "校招",
      kpi_ownership: "对内容生态质量负责", // 无数字，校招 OK
      milestone_90: "完成新人培养第一阶段",
      requirements: [blankReq()],
      constraints: { ...emptyState().constraints, budget: "15k" },
      // internal_check 故意留空
    };
    expect(computeHandoff(s).ready).toBe(true);
    expect(computeHandoff({ ...s, recruit_type: "社招" }).ready).toBe(false);
  });

  it("日常实习：不背 KPI/职级/内部转岗，改要 明确任务+到岗时长+日薪", () => {
    const s: HiringState = {
      ...emptyState(),
      recruit_type: "日常实习",
      core_tasks: ["协助标注与评测集整理"],
      constraints: {
        ...emptyState().constraints,
        budget: "200元/天",
        timeline: "下周到岗，实习3个月，每周4天",
      },
    };
    expect(computeHandoff(s).ready).toBe(true);
    // 缺到岗/时长 → 不可交接
    expect(
      computeHandoff({ ...s, constraints: { ...s.constraints, timeline: "" } }).ready
    ).toBe(false);
    // 缺明确任务 → 不可交接
    expect(computeHandoff({ ...s, core_tasks: [] }).ready).toBe(false);
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
