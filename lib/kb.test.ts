import { describe, it, expect } from "vitest";
import {
  lookupRole,
  parseMonthlySalary,
  detectBudgetLevelConflict,
} from "./kb";
import { emptyState } from "./schema";

describe("lookupRole", () => {
  it("按别名模糊匹配岗位", () => {
    expect(lookupRole("推荐算法工程师")?.key).toBe("算法工程师");
    expect(lookupRole("高级产品经理")?.key).toBe("产品经理");
    expect(lookupRole("内容运营")?.key).toBe("运营");
  });
  it("匹配不到返回 null", () => {
    expect(lookupRole("")).toBeNull();
    expect(lookupRole("行星地质学家")).toBeNull();
  });
});

describe("parseMonthlySalary", () => {
  it("解析多种薪资写法为月薪", () => {
    expect(parseMonthlySalary("2-3万")).toEqual([20000, 30000]);
    expect(parseMonthlySalary("月薪30k")).toEqual([30000, 30000]);
    expect(parseMonthlySalary("20k-35k")).toEqual([20000, 35000]);
    expect(parseMonthlySalary("年薪60万")?.[0]).toBeCloseTo(50000, 0);
  });
  it("模糊表达解析不出", () => {
    expect(parseMonthlySalary("别太高")).toBeNull();
    expect(parseMonthlySalary("")).toBeNull();
  });
});

describe("detectBudgetLevelConflict", () => {
  const arch = lookupRole("算法工程师")!;

  it("资深信号 + 低预算 → 命中冲突", () => {
    const s = emptyState();
    s.role_title = "算法工程师";
    s.constraints.budget = "月薪20k";
    s.requirements = [
      {
        ...blankReq(),
        raw: "要有大厂经验、能独立扛事",
        clarified: "大厂背景，独立负责项目",
      },
    ];
    const c = detectBudgetLevelConflict(s, arch);
    expect(c).not.toBeNull();
    expect(c?.owner).toBe("hr");
  });

  it("预算未给具体数 → 不算冲突（属缺口）", () => {
    const s = emptyState();
    s.role_title = "算法工程师";
    s.constraints.budget = "别太高";
    s.requirements = [{ ...blankReq(), raw: "大厂经验" }];
    expect(detectBudgetLevelConflict(s, arch)).toBeNull();
  });

  it("预算充足 → 不命中", () => {
    const s = emptyState();
    s.role_title = "算法工程师";
    s.constraints.budget = "月薪60k";
    s.requirements = [{ ...blankReq(), raw: "资深、独立扛事" }];
    expect(detectBudgetLevelConflict(s, arch)).toBeNull();
  });
});

function blankReq() {
  return {
    id: "req-1",
    raw: "",
    category: "behavioral" as const,
    issues: [],
    clarified: "",
    priority: null,
    business_scenario: "",
    candidate_evidence: "",
    interview_check: "",
    derivation: "",
    owner: "shared" as const,
    needs_hr_calibration: false,
    confidence: "inferred" as const,
  };
}
