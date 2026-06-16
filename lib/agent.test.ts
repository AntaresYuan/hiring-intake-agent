import { describe, it, expect } from "vitest";
import { normalizeResult, dedupeConflicts, isParseable } from "./agent";
import type { Conflict } from "./schema";
import { emptyState, type HiringState } from "./schema";
import { mockTurn } from "./mock";

describe("normalizeResult", () => {
  it("坏 JSON 不崩溃，返回兜底回复并保留上一轮状态", () => {
    const prev = emptyState();
    prev.background = "已有业务目标";
    const r = normalizeResult("not json at all", prev);
    expect(r.reply).toContain("已记下你的选择");
    expect(r.state.background).toBe("已有业务目标");
    expect(r.handoff.ready).toBe(false);
  });

  it("兼容 ```json 围栏与首尾多余文字", () => {
    const raw = '这是结果：```json\n{"reply":"好的，继续"}\n``` 完毕';
    const r = normalizeResult(raw, emptyState());
    expect(r.reply).toBe("好的，继续");
    expect(isParseable(raw)).toBe(true);
  });

  it("缺字段的 requirement 被补全为合法结构", () => {
    const raw = JSON.stringify({
      reply: "好的",
      state: { requirements: [{ raw: "能力强" }] },
    });
    const r = normalizeResult(raw, emptyState());
    const req = r.state.requirements[0];
    expect(req.id).toBe("req-1");
    expect(req.category).toBe("behavioral");
    expect(req.owner).toBe("shared");
    expect(Array.isArray(req.issues)).toBe(true);
    expect(req.confidence).toBe("inferred");
  });

  it("模型未返回 state 时沿用上一轮状态", () => {
    const prev: HiringState = { ...emptyState(), milestone_90: "上线 A 功能" };
    const r = normalizeResult(JSON.stringify({ reply: "x" }), prev);
    expect(r.state.milestone_90).toBe("上线 A 功能");
  });

  it("保留模型给出的 id 稳定性", () => {
    const raw = JSON.stringify({
      reply: "ok",
      state: {
        requirements: [
          { id: "req-99", raw: "a", category: "quantifiable" },
        ],
      },
    });
    const r = normalizeResult(raw, emptyState());
    expect(r.state.requirements[0].id).toBe("req-99");
    expect(r.state.requirements[0].category).toBe("quantifiable");
  });
});

describe("normalizeChoices", () => {
  it("合法选择题被保留，allow_custom 默认 true", () => {
    const raw = JSON.stringify({
      reply: "x",
      choices: [
        { question: "能力方向？", multi: true, options: ["模型研发", "工程落地"] },
      ],
    });
    const r = normalizeResult(raw, emptyState());
    expect(r.choices).toHaveLength(1);
    expect(r.choices[0].options).toEqual(["模型研发", "工程落地"]);
    expect(r.choices[0].allow_custom).toBe(true);
  });

  it("无选项的组被丢弃，缺 choices 时返回空数组", () => {
    const r1 = normalizeResult(
      JSON.stringify({ reply: "x", choices: [{ question: "空", options: [] }] }),
      emptyState()
    );
    expect(r1.choices).toEqual([]);
    const r2 = normalizeResult(JSON.stringify({ reply: "x" }), emptyState());
    expect(r2.choices).toEqual([]);
  });
});

describe("dedupeConflicts", () => {
  const mk = (id: string, description: string, ids: string[] = []): Conflict => ({
    id,
    description,
    related_item_ids: ids,
    tradeoff: "",
    owner: "hr",
  });

  it("同主题预算/职级冲突只保留 KB 那条，并合并要求 id", () => {
    const conflicts = [
      mk("conf-2", "月薪20k与要求大厂经验+独立扛事不匹配，市场薪资更高", ["req-3"]),
      mk("kb-conf-budget-level", "要求偏资深，预算低于该岗位职级市场区间", ["req-1"]),
    ];
    const out = dedupeConflicts(conflicts);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("kb-conf-budget-level");
    expect(out[0].related_item_ids).toContain("req-1");
    expect(out[0].related_item_ids).toContain("req-3");
  });

  it("不同主题的冲突都保留（全才 vs 专才预算 不被并入预算职级）", () => {
    const conflicts = [
      mk("kb-conf-budget-level", "要求资深，预算低于职级市场区间"),
      mk("conf-1", "既要全才/复合能力，又只给专才预算"),
    ];
    expect(dedupeConflicts(conflicts)).toHaveLength(2);
  });

  it("完全相同的描述被去掉", () => {
    const out = dedupeConflicts([mk("a", "马上出活与长期培养矛盾"), mk("b", "马上出活与长期培养矛盾")]);
    expect(out).toHaveLength(1);
  });
});

describe("mockTurn", () => {
  it("首轮给出诊断和 1 个追问，且未就绪交接", () => {
    const r = mockTurn(
      [{ role: "user", content: "招个算法工程师" }],
      emptyState()
    );
    expect(r.diagnosis.questions_asked.length).toBeGreaterThan(0);
    expect(r.state.requirements.length).toBe(1);
    expect(r.handoff.ready).toBe(false);
  });
});
