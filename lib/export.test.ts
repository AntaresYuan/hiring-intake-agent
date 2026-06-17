import { describe, it, expect } from "vitest";
import {
  assembleFallback,
  buildExportMessages,
  pickExportFewShots,
  renderStructuredExport,
} from "./export";
import { emptyState, type HiringState } from "./schema";
import { BUILTIN_JD_STYLE_SAMPLES } from "./jdStyleSamples";

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

  it("候选人评估标准包含简历核验、面试评分和人工决策边界", () => {
    const { candidate_evaluation } = assembleFallback(state);
    expect(candidate_evaluation).toContain("候选人评估标准");
    expect(candidate_evaluation).toContain("简历证据核验");
    expect(candidate_evaluation).toContain("面试评分维度");
    expect(candidate_evaluation).toContain("统一评分锚点");
    expect(candidate_evaluation).toContain("不做自动淘汰规则");
    expect(candidate_evaluation).toContain("主导过推荐召回上线");
    expect(candidate_evaluation).toContain("预算低于职级区间");
  });
});

describe("JD few-shot export", () => {
  const state: HiringState = {
    ...emptyState(),
    recruit_type: "社招",
    role_title: "AI产品经理",
    background: "负责电商 AI 导购体验，从商品理解到交易转化闭环",
    kpi_ownership: "对 AI 导购转化率提升 10% 负责",
    milestone_30: "完成核心用户场景与指标拆解",
    milestone_90: "上线首版导购策略并完成 A/B 实验",
    milestone_180: "沉淀 AI 导购产品方法论并规模化复用",
    core_tasks: ["设计 AI 导购链路", "协同算法和运营推进策略落地"],
    requirements: [
      {
        id: "req-1",
        raw: "懂 AI 产品",
        category: "leveled",
        issues: [],
        clarified: "理解大模型能力边界，能把电商业务问题转成可落地的 AI 产品方案",
        priority: "must_have",
        business_scenario: "AI 导购体验设计",
        candidate_evidence: "主导过 AI 产品从需求到上线的完整项目",
        interview_check: "请讲一个你把 AI 能力落到业务场景的项目",
        derivation: "来自 AI 导购转化率目标",
        owner: "business",
        needs_hr_calibration: false,
        confidence: "confirmed",
      },
    ],
  };

  it("按岗位族、招聘类型和关键词选择真实 JD 风格参考", () => {
    const selected = pickExportFewShots(state, BUILTIN_JD_STYLE_SAMPLES);

    expect(selected[0].title).toBe("AI产品经理-抖音电商");
  });

  it("生成 prompt 时注入 schema 与 few-shot 风格参考", () => {
    const messages = buildExportMessages(state, BUILTIN_JD_STYLE_SAMPLES);
    const joined = messages.map((m) => m.content).join("\n");

    expect(joined).toContain("真实字节 JD 风格参考");
    expect(joined).toContain("AI产品经理-抖音电商");
    expect(joined).toContain("style_source_titles");
    expect(joined).toContain("结构化招聘需求");
  });

  it("把 structured output 渲染为字节风格 JD 和面试框架", () => {
    const rendered = renderStructuredExport(
      {
        style_source_titles: ["AI产品经理-抖音电商"],
        jd: {
          title: "AI产品经理-电商导购",
          team_and_business: "负责电商 AI 导购体验",
          role_reason: "围绕 AI 导购转化率提升 10% 推进产品闭环",
          responsibilities: ["设计 AI 导购核心链路", "协同算法团队推进策略上线"],
          requirements: {
            must_have: ["理解大模型能力边界，能推动 AI 产品落地"],
            preferred: ["有电商 AI 产品经验者优先"],
          },
          constraints: ["地点：上海"],
          hr_calibration_notes: ["确认职级与薪酬区间"],
          risk_notes: ["AI 能力深度需面试验证"],
        },
        interview: {
          sections: [
            {
              requirement: "理解大模型能力边界，能推动 AI 产品落地",
              evaluation_point: "AI 产品化判断",
              questions: ["请讲一个 AI 产品从需求到上线的项目"],
              pass_criteria: "能说明场景、模型能力边界、上线指标和复盘结论",
              evidence: "AI 产品上线经历",
            },
          ],
          tradeoff_checks: ["确认 AI 深度是产品判断而非只会写 prompt"],
        },
        candidate_evaluation: {
          resume_screen: {
            must_have_checks: [
              {
                requirement: "理解大模型能力边界，能推动 AI 产品落地",
                resume_evidence: "AI 产品上线经历，含指标与个人贡献",
                pass_signal: "简历能看到从需求到上线的闭环",
                risk_signal: "只有 prompt 使用经验，缺产品化闭环",
              },
            ],
            preferred_signals: ["电商 AI 产品经验"],
            hr_review_flags: ["确认职级与薪酬区间"],
          },
          interview_scorecard: {
            dimensions: [
              {
                dimension: "AI 产品化判断",
                weight: "40%",
                evaluates: "能否把模型能力边界转成业务方案",
                strong_signal: "能讲清场景、模型边界、指标和复盘",
                pass_signal: "有相关上线经历但复杂度需确认",
                risk_signal: "只会描述概念，缺落地证据",
              },
            ],
          },
          rating_scale: [
            {
              score: "5",
              label: "强匹配",
              description: "独立做过相近 AI 产品闭环",
            },
            {
              score: "3",
              label: "基本匹配",
              description: "有相关经历但需确认迁移性",
            },
          ],
          decision_guidance: ["输出人工面试意见，不替 HR 拍最终录用结论"],
        },
      },
      state
    );

    expect(rendered.jd).toContain("## 职位描述");
    expect(rendered.jd).toContain("1、负责电商 AI 导购体验");
    expect(rendered.jd).toContain("## 职位要求");
    expect(rendered.jd).toContain("有电商 AI 产品经验者优先");
    expect(rendered.interview).toContain("AI 产品化判断");
    expect(rendered.interview).toContain("请讲一个 AI 产品从需求到上线的项目");
    expect(rendered.candidate_evaluation).toContain("简历证据核验");
    expect(rendered.candidate_evaluation).toContain("AI 产品上线经历，含指标与个人贡献");
    expect(rendered.candidate_evaluation).toContain("AI 产品化判断");
    expect(rendered.candidate_evaluation).toContain("输出人工面试意见");
  });
});
