import type { Conflict, HiringState } from "./schema";

// 结构化岗位知识库（KB）。
// MVP 用知识版岗位原型起步，后续可用真实字节 JD 逆向覆盖「responsibilities / capabilities」。
// 职级↔薪酬区间为估算值，仅用于触发「预算 vs 职级」提示，最终以 HR 校准为准。

export interface RoleLevel {
  level: string;
  experience: string;
  monthly: [number, number]; // 月薪区间（人民币，估算）
}
export interface RoleCapability {
  name: string;
  levels: string[]; // 由浅到深的分级描述
}
export interface RoleArchetype {
  key: string;
  aliases: string[]; // 用于模糊匹配岗位名
  responsibilities: string[];
  capabilities: RoleCapability[];
  levels: RoleLevel[];
  conflict_signals: string[]; // 该岗位常见的冲突信号（提示 LLM 重点检查）
}

export const ROLE_LIBRARY: RoleArchetype[] = [
  {
    key: "算法工程师",
    aliases: ["算法", "机器学习", "深度学习", "ml", "推荐算法", "搜索算法", "nlp", "cv"],
    responsibilities: ["特征工程", "模型设计与迭代", "线上效果优化", "AB 实验与归因"],
    capabilities: [
      { name: "机器学习建模", levels: ["调包应用", "独立建模调优", "系统级方案设计"] },
      { name: "工程落地", levels: ["跑通离线实验", "独立上线模型", "高并发线上系统优化"] },
      { name: "业务理解", levels: ["理解指标", "能拆解业务到建模问题", "主导技术方向"] },
    ],
    levels: [
      { level: "初级(P5)", experience: "1-3年", monthly: [25000, 40000] },
      { level: "高级(P6)", experience: "3-5年", monthly: [40000, 60000] },
      { level: "资深(P7)", experience: "5-8年", monthly: [60000, 90000] },
    ],
    conflict_signals: ["要独立扛事却给初级预算", "要大厂经验又要求年轻", "要立即产出却无相关方向经验"],
  },
  {
    key: "产品经理",
    aliases: ["产品", "pm", "product"],
    responsibilities: ["需求洞察与定义", "方案设计与排期", "跨团队推进", "数据复盘"],
    capabilities: [
      { name: "需求拆解", levels: ["接收需求", "独立定义需求", "定义产品方向"] },
      { name: "跨团队协作", levels: ["配合推进", "独立推动落地", "跨多团队对齐目标"] },
      { name: "数据驱动", levels: ["看数据", "用数据验证决策", "建立指标体系"] },
    ],
    levels: [
      { level: "初级", experience: "1-3年", monthly: [20000, 35000] },
      { level: "高级", experience: "3-6年", monthly: [35000, 55000] },
      { level: "资深/负责人", experience: "6年以上", monthly: [55000, 90000] },
    ],
    conflict_signals: ["要负责人级决策权却给低职级", "要从0到1经验却给执行岗预算"],
  },
  {
    key: "运营",
    aliases: ["运营", "operation", "增长", "内容运营", "用户运营", "活动运营", "市场"],
    responsibilities: ["用户/内容/活动运营", "增长策略与执行", "数据分析与优化"],
    capabilities: [
      { name: "运营执行", levels: ["执行既定方案", "独立策划并落地", "搭建运营体系"] },
      { name: "数据分析", levels: ["看报表", "用数据找抓手", "建模型驱动增长"] },
      { name: "用户洞察", levels: ["了解用户", "提炼用户需求", "定义运营策略"] },
    ],
    levels: [
      { level: "初级", experience: "1-3年", monthly: [12000, 22000] },
      { level: "高级", experience: "3-6年", monthly: [22000, 40000] },
      { level: "资深/负责人", experience: "6年以上", monthly: [40000, 70000] },
    ],
    conflict_signals: ["要独立搭体系却给执行岗预算", "要爆款经验却压预算"],
  },
];

/** 按岗位名模糊匹配原型；匹配不到返回 null */
export function lookupRole(title: string): RoleArchetype | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const r of ROLE_LIBRARY) {
    if (r.aliases.some((a) => t.includes(a.toLowerCase()))) return r;
    if (t.includes(r.key)) return r;
  }
  return null;
}

/** 从自由文本里解析月薪区间（人民币/月），解析不出返回 null */
export function parseMonthlySalary(text: string): [number, number] | null {
  if (!text) return null;
  const s = text.replace(/\s/g, "");
  const nums: number[] = [];
  // 年薪 X万 → 月
  const yearW = s.match(/年薪(\d+(?:\.\d+)?)万/);
  if (yearW) return [(+yearW[1] * 10000) / 12, (+yearW[1] * 10000) / 12];
  // X-Y万 / X万
  const wanRange = s.match(/(\d+(?:\.\d+)?)[-~到至](\d+(?:\.\d+)?)万/);
  if (wanRange) return [+wanRange[1] * 10000, +wanRange[2] * 10000];
  const wan = s.match(/(\d+(?:\.\d+)?)万/);
  if (wan) return [+wan[1] * 10000, +wan[1] * 10000];
  // Xk-Yk / Xk
  const kRange = s.match(/(\d+(?:\.\d+)?)k[-~到至](\d+(?:\.\d+)?)k/i);
  if (kRange) return [+kRange[1] * 1000, +kRange[2] * 1000];
  const k = s.match(/(\d+(?:\.\d+)?)k/i);
  if (k) return [+k[1] * 1000, +k[1] * 1000];
  // 纯数字（>=5000 视为月薪）
  const plain = s.match(/(\d{4,6})/);
  if (plain && +plain[1] >= 5000) nums.push(+plain[1]);
  return nums.length ? [nums[0], nums[0]] : null;
}

/** 解析实习日薪（元/天）。社招/校招按月薪，实习按日薪——别让月薪解析器误判实习"没预算"。 */
export function parseDailyWage(text: string): number | null {
  if (!text) return null;
  const s = text.replace(/\s/g, "");
  const perDay = s.match(/(\d+(?:\.\d+)?)(?:元|块)?\/?(?:天|日)/); // 200元/天 · 200/天 · 200块每天
  if (perDay) return +perDay[1];
  const daily = s.match(/日薪(\d+(?:\.\d+)?)/); // 日薪200
  if (daily) return +daily[1];
  return null;
}

const SENIOR_SIGNALS = [
  "大厂",
  "独立",
  "资深",
  "专家",
  "负责人",
  "架构",
  "马上",
  "立刻",
  "立即",
  "即战力",
  "从0到1",
  "从零到一",
  "扛事",
  "扛起",
];

/** 数值型冲突检测：预算 vs 职级（代码侧，近乎 0 token）。命中返回 Conflict。 */
export function detectBudgetLevelConflict(
  state: HiringState,
  arch: RoleArchetype
): Conflict | null {
  const budget = parseMonthlySalary(state.constraints.budget);
  if (!budget) return null; // 预算还没给具体数 → 属于缺口，不是冲突

  const corpus = [
    state.background,
    ...state.requirements.map((r) => `${r.raw} ${r.clarified}`),
  ]
    .join(" ")
    .toLowerCase();
  const hasSenior = SENIOR_SIGNALS.some((sig) => corpus.includes(sig.toLowerCase()));
  if (!hasSenior) return null;

  // 资深信号对应的职级区间（取库里中高档）
  const target = arch.levels[Math.min(1, arch.levels.length - 1)];
  if (budget[1] < target.monthly[0]) {
    return {
      id: "kb-conf-budget-level",
      description: `要求偏资深（${arch.key}），但预算月薪上限约 ${Math.round(
        budget[1]
      )} 元，低于该岗位「${target.level}」市场区间 ${target.monthly[0]}-${
        target.monthly[1]
      } 元（估算）`,
      related_item_ids: [],
      tradeoff: "需在「降低资历要求 / 提高预算 / 接受更长培养周期」之间取舍",
      owner: "hr",
    };
  }
  return null;
}

/** 把原型压缩成注入 prompt 的精简上下文（控制 token） */
export function archetypeForPrompt(arch: RoleArchetype): string {
  return JSON.stringify({
    岗位: arch.key,
    典型职责: arch.responsibilities,
    典型能力: arch.capabilities.map((c) => `${c.name}: ${c.levels.join(" / ")}`),
    常见冲突信号: arch.conflict_signals,
  });
}
