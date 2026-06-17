import type { GoldCard } from "./types";

// 三张隐藏角色卡（gold specification）。⚠️ 草稿——待用户（产品方）审核纠错后定稿。
// 锚点：(a) 字节 AI 业务岗位类型；(b) 项目记忆里那位资深 HR 给的真实冲突
//        （5年经验+低预算 / 全才但给专才的钱 / 马上出活+长期培养）。
// 三型对应记忆里的「极度模糊 / 要求冲突 / 看似完整缺业务目标」。
// role_family 命中 KB（算法工程师 / 产品经理 / 运营），以便预算↔职级冲突检测能触发。

const cardAiAmbiguous: GoldCard = {
  id: "HI_AI_001",
  type: "ambiguous",
  recruit_type: "社招",
  title: "极度模糊型 · AI 算法/工程方向",
  role_family: "算法工程师",
  initial_request:
    "我想招一个懂 AI、执行力强的人，经验不用太多，但要能独立负责项目，预算也有限。",
  critical_information: [
    {
      id: "f_goal",
      label: "业务目标",
      truth: "三个月内上线面向客服场景的知识库问答（RAG）MVP，验证能否降低人工客服工单量。",
      weight: 3,
      lands_in: "background",
      reveal_when: "Agent 追问招这个人是为了达成什么业务目标 / 解决什么问题",
    },
    {
      id: "f_kpi",
      label: "KPI 归属",
      truth: "对“客服工单自助解决率”这个指标负责，目标从当前 ~15% 提到 30%。",
      weight: 3,
      lands_in: "kpi_ownership",
      reveal_when: "Agent 追问这个岗位对哪个 KPI/业务结果负责",
    },
    {
      id: "f_tasks",
      label: "核心任务",
      truth: "用户/工单调研、需求定义、与算法团队协同 RAG 方案、建评测集、推动研发上线。",
      weight: 2,
      lands_in: "core_tasks",
      reveal_when: "Agent 追问入职后具体做哪些事 / 90 天要交出什么",
    },
    {
      id: "f_ai_depth",
      label: "“懂 AI”的真实深度",
      truth: "不需要会训练模型，只需理解 LLM/RAG 能力边界、能定义评测、能和算法同学对话。",
      weight: 2,
      lands_in: "requirement",
      reveal_when: "Agent 追问“懂 AI”具体要懂到什么程度（分级）",
    },
    {
      id: "f_team",
      label: "团队支持",
      truth: "团队有 1 名后端工程师可配合，算法资源需要跨团队协调（不专属）。",
      weight: 1,
      lands_in: "internal_check",
      reveal_when: "Agent 追问现有团队配置 / 是否有内部人可转岗",
    },
    {
      id: "f_budget",
      label: "预算硬约束",
      truth: "月薪预算上限 30k，且这条是硬的、不能突破。",
      weight: 3,
      lands_in: "constraints",
      reveal_when: "Agent 追问预算范围 / 给出具体数字或档位",
    },
    {
      id: "f_exp_soft",
      label: "经验其实可妥协",
      truth: "经验年限其实可以放宽（不是硬约束），但“能独立负责”是硬的。",
      weight: 2,
      lands_in: "constraints",
      reveal_when: "Agent 区分哪些是硬约束哪些可妥协 / 用职责倒推资历",
    },
  ],
  planted_conflicts: [
    {
      id: "c_indep_vs_exp",
      description: "要求“能独立负责整个项目”，却又说“经验不用太多”——独立交付与低经验存在张力。",
      must_surface: true,
    },
    {
      id: "c_budget_vs_level",
      description: "要资深感的“独立负责 + 懂 AI”，但预算上限 30k，可能低于对应资历的市场区间。",
      must_surface: true,
    },
  ],
  must_detect: [
    "“懂 AI”模糊、缺深度分级",
    "“执行力强”主观、未行为化",
    "“独立负责”与“经验不用太多”冲突",
    "预算与能力要求可能不匹配",
    "完全没有给业务目标",
  ],
  acceptable_question_intents: [
    "澄清业务目标与要解决的问题",
    "追问对哪个 KPI 负责",
    "用 90 天交付倒推真正需要的能力与资历",
    "把“懂 AI”按所需深度分级",
    "区分硬约束与可妥协项",
    "排查内部/现有团队是否有人可转岗",
  ],
  forbidden_inferences: [
    "默认要求 3 年以上经验",
    "默认要求会训练/微调模型",
    "替业务方拍定具体薪资数字",
    "替业务方拍定具体职级（P5/P6…）",
  ],
  expected_hr_escalations: ["预算与职级对齐（对标市场区间）", "最终职级", "到岗周期"],
};

const cardPmConflict: GoldCard = {
  id: "HI_PM_002",
  type: "conflict",
  recruit_type: "社招",
  title: "要求冲突型 · 产品经理",
  role_family: "产品经理",
  initial_request:
    "我要一个能从 0 到 1 独立负责一条新业务线的产品负责人，最好既懂技术又懂商业化还能带人，但 head count 是按普通执行产品批的，薪资别太高。",
  critical_information: [
    {
      id: "f_goal",
      label: "业务目标",
      truth: "孵化一条面向中小商家的新增值服务业务线，半年内跑通付费闭环。",
      weight: 3,
      lands_in: "background",
      reveal_when: "Agent 追问这条新业务线要达成什么结果",
    },
    {
      id: "f_kpi",
      label: "KPI 归属",
      truth: "对“新业务线 180 天内的付费转化与首期营收”负责。",
      weight: 3,
      lands_in: "kpi_ownership",
      reveal_when: "Agent 追问对哪个 KPI 负责",
    },
    {
      id: "f_core",
      label: "真正最关键的能力",
      truth: "最关键是“从 0 到 1 跑通商业闭环”的能力；带人和技术深度其实是加分项不是必备。",
      weight: 3,
      lands_in: "requirement",
      reveal_when: "Agent 用职责倒推、逼业务方在“全才”里排出真正的 must-have",
    },
    {
      id: "f_level_real",
      label: "职责其实是负责人级",
      truth: "要独立定方向、决策、对营收负责——是负责人级职责，不是执行产品。",
      weight: 2,
      lands_in: "requirement",
      reveal_when: "Agent 追问决策权范围 / 是否要定产品方向",
    },
    {
      id: "f_budget",
      label: "预算/职级约束",
      truth: "head count 按普通执行产品批的，月薪卡在 35k 以内。",
      weight: 3,
      lands_in: "constraints",
      reveal_when: "Agent 追问预算/职级档位",
    },
    {
      id: "f_urgency",
      label: "紧急度",
      truth: "希望 1 个月内到岗，业务窗口紧。",
      weight: 1,
      lands_in: "constraints",
      reveal_when: "Agent 追问多久必须到岗",
    },
  ],
  planted_conflicts: [
    {
      id: "c_allrounder_vs_pay",
      description: "既要“懂技术+懂商业+能带人”的全才，又只给普通执行产品的预算——全才要求 vs 专才预算。",
      must_surface: true,
    },
    {
      id: "c_owner_vs_level",
      description: "要负责人级决策权与营收担责，却按低职级/执行岗 head count 批——职责与职级不匹配。",
      must_surface: true,
    },
  ],
  must_detect: [
    "“既懂技术又懂商业还能带人”是全才堆叠，缺 must-have 排序",
    "负责人级职责 vs 执行岗职级/预算 冲突",
    "“别太高”的薪资表述模糊且与要求不匹配",
    "缺明确业务目标与 KPI",
  ],
  acceptable_question_intents: [
    "追问新业务线的业务目标与成功结果",
    "用职责倒推在“全才”里排出真正 must-have",
    "澄清决策权/负责范围以判断真实职级",
    "指出全才要求与执行岗预算的冲突并要求取舍",
    "追问紧急度/到岗时间",
  ],
  forbidden_inferences: [
    "替业务方拍定具体薪资数字",
    "替业务方拍定具体职级",
    "默认带团队规模/人数",
    "把“带人”直接当成 must-have（实际是加分项）",
  ],
  expected_hr_escalations: [
    "职级与 head count 是否支持负责人级职责",
    "预算与市场区间对齐",
    "到岗时间现实性",
  ],
};

const cardOpsMissingGoal: GoldCard = {
  id: "HI_OPS_003",
  type: "missing_goal",
  recruit_type: "社招",
  title: "看似完整缺业务目标型 · 运营",
  role_family: "运营",
  initial_request:
    "招个运营，要会做爆款活动、能写文案、懂数据分析、会用户社群、最好做过百万级 DAU 的产品，执行力强、抗压、能加班。",
  critical_information: [
    {
      id: "f_goal",
      label: "业务目标（被技能清单掩盖）",
      truth: "其实是要把一个新上线的工具型产品的“次留”从 20% 提到 35%，重点是留存不是拉新。",
      weight: 3,
      lands_in: "background",
      reveal_when: "Agent 绕过技能清单、追问招这个人到底要解决什么业务问题",
    },
    {
      id: "f_kpi",
      label: "KPI 归属",
      truth: "对“新产品次日留存率”负责，不是对活动数量或曝光负责。",
      weight: 3,
      lands_in: "kpi_ownership",
      reveal_when: "Agent 追问对哪个 KPI 负责（识破“看着很全但没说对什么负责”）",
    },
    {
      id: "f_real_need",
      label: "真正需要的能力",
      truth: "因为目标是留存，真正关键是“数据分析找留存抓手 + 用户洞察”，爆款活动/文案是次要。",
      weight: 3,
      lands_in: "requirement",
      reveal_when: "Agent 用业务目标倒推、把一堆技能按对目标的贡献重排优先级",
    },
    {
      id: "f_dau_proxy",
      label: "“百万 DAU 经验”只是代理指标",
      truth: "“做过百万 DAU”不是真需求，业务方只是想要“能搞大产品的人”，可放宽。",
      weight: 2,
      lands_in: "requirement",
      reveal_when: "Agent 核验“百万 DAU”是不是只是能力代理指标",
    },
    {
      id: "f_budget",
      label: "预算",
      truth: "月薪 18k 左右，对应高级运营档。",
      weight: 1,
      lands_in: "constraints",
      reveal_when: "Agent 追问预算",
    },
  ],
  planted_conflicts: [
    {
      id: "c_skills_vs_goal",
      description: "技能清单偏“拉新/爆款”，但真实目标是“留存”——能力堆叠方向与业务目标错位。",
      must_surface: true,
    },
  ],
  must_detect: [
    "看似完整，实则完全没说业务目标/对什么 KPI 负责",
    "“爆款/文案/社群/数据/百万DAU”一堆技能未按目标排优先级",
    "“能加班”属岗位相关性存疑/偏见风险表述",
    "“百万 DAU”是代理指标",
  ],
  acceptable_question_intents: [
    "追问招这个人要解决的真实业务问题/目标",
    "追问对哪个 KPI 负责",
    "用业务目标把技能清单重排优先级",
    "核验“百万 DAU 经验”是否只是代理指标",
    "对“能加班”要求业务解释或行为化",
  ],
  forbidden_inferences: [
    "默认目标是拉新/增长（实际是留存）",
    "把“能加班”直接固化为招聘要求",
    "替业务方拍定具体薪资",
    "把全部技能都当 must-have",
  ],
  expected_hr_escalations: ["薪资与高级运营档对齐", "“能加班”表述的合规性"],
};

// ——— 招聘类型 × 要求 错配卡（校招/实习/转正实习）———
// 核心考点:Agent 先确认招聘类型,并把"类型与要求不匹配"当场点破。

const cardCampusMismatch: GoldCard = {
  id: "HI_CAMPUS_004",
  type: "type_mismatch",
  recruit_type: "校招",
  role_family: "算法工程师",
  title: "类型错配型 · 校招应届算法",
  initial_request:
    "招个应届算法,但最好来了就能独立扛起推荐模型迭代,有 3 年以上推荐经验的优先,即战力。",
  critical_information: [
    {
      id: "f_grow",
      label: "其实是培养导向",
      truth: "想把应届培养成能独立做推荐迭代的算法,第一年以带教成长为主,不是即战力。",
      weight: 3,
      lands_in: "background",
      reveal_when: "Agent 确认这是校招/应届、把'即战力'拉回潜力培养时",
    },
    {
      id: "f_mentor",
      label: "带教资源",
      truth: "有一名资深算法带教,前 6 个月以学习+辅助为主。",
      weight: 2,
      lands_in: "internal_check",
      reveal_when: "Agent 追问培养/带教安排",
    },
    {
      id: "f_pkg",
      label: "校招 package",
      truth: "走校招标准 offer,月薪约 25-30k,基本不议价。",
      weight: 2,
      lands_in: "constraints",
      reveal_when: "Agent 追问薪资档位",
    },
    {
      id: "f_onboard",
      label: "入职批次",
      truth: "明年 7 月毕业后入职。",
      weight: 1,
      lands_in: "constraints",
      reveal_when: "Agent 追问到岗时间/入职批次",
    },
  ],
  planted_conflicts: [
    {
      id: "c_campus_mismatch",
      description: "招应届却要'3 年经验 / 即战力 / 来了独立扛'——类型与要求错配,应届应按潜力培养。",
      must_surface: true,
    },
  ],
  must_detect: [
    "应届 vs 3 年经验/即战力 的类型错配",
    "未确认招聘类型就堆经验要求",
  ],
  acceptable_question_intents: [
    "先确认这是校招/应届",
    "把'即战力/几年经验'拉回潜力与培养目标",
    "追问带教/培养安排",
    "追问入职批次/到岗时间",
  ],
  forbidden_inferences: [
    "默认要求 3 年以上经验",
    "默认应届能即战力独立扛线",
    "替业务方拍定具体薪资数字",
  ],
  expected_hr_escalations: ["校招 package 档位", "入职批次"],
};

const cardInternMismatch: GoldCard = {
  id: "HI_INTERN_005",
  type: "type_mismatch",
  recruit_type: "日常实习",
  role_family: "产品经理",
  title: "类型错配型 · 日常实习产品",
  initial_request:
    "招个产品实习生,要能独立负责一个新方向从 0 到 1,对最终上线和数据负责,最好马上出活。",
  critical_information: [
    {
      id: "f_realtask",
      label: "其实是协助性任务",
      truth: "真实需求是协助现有产品做用户调研/竞品/原型,不是独立负责 0-1。",
      weight: 3,
      lands_in: "core_tasks",
      reveal_when: "Agent 确认这是实习、把'独立负责 0-1'降为协助任务时",
    },
    {
      id: "f_duration",
      label: "时长/到岗",
      truth: "希望来至少 3 个月、每周到岗 4 天,下周能到岗最好。",
      weight: 2,
      lands_in: "constraints",
      reveal_when: "Agent 追问实习时长/每周天数/到岗",
    },
    {
      id: "f_wage",
      label: "日薪",
      truth: "日薪 200 元/天。",
      weight: 2,
      lands_in: "constraints",
      reveal_when: "Agent 追问日薪",
    },
  ],
  planted_conflicts: [
    {
      id: "c_intern_mismatch",
      description: "实习生却要'独立负责 0-1 + 对上线数据负责 + 马上出活'——超出实习生定位,应降为协助性任务。",
      must_surface: true,
    },
  ],
  must_detect: [
    "实习生 vs 独立背 0-1/上线数据 的类型错配",
    "'马上出活'对实习生不现实",
  ],
  acceptable_question_intents: [
    "先确认这是日常实习",
    "把'独立负责 0-1'降为协助性任务",
    "追问实习时长/每周天数/到岗",
    "追问日薪",
  ],
  forbidden_inferences: [
    "默认实习生独立背 KPI / 上线数据",
    "默认实习生能马上出活",
    "给实习生定职级",
  ],
  expected_hr_escalations: ["实习日薪合规"],
};

const cardReturnOfferMismatch: GoldCard = {
  id: "HI_RETURN_006",
  type: "type_mismatch",
  recruit_type: "转正实习",
  role_family: "算法工程师",
  title: "转正画饼型 · 转正实习算法",
  initial_request:
    "招个转正实习的算法,表现好就转正留下来,先按实习来,干得好我们就给名额。",
  critical_information: [
    {
      id: "f_quota",
      label: "转正名额其实没落实",
      truth: "转正名额还没批、HC 未定,'干得好就转正'目前没有保障。",
      weight: 3,
      lands_in: "conflict",
      reveal_when: "Agent 追问转正名额是否真实存在/已审批",
    },
    {
      id: "f_criteria",
      label: "转正标准模糊",
      truth: "没定转正考核标准,凭印象。",
      weight: 3,
      lands_in: "requirement",
      reveal_when: "Agent 追问转正考核标准是什么",
    },
    {
      id: "f_task",
      label: "实习任务",
      truth: "实习期协助大模型评测集建设。",
      weight: 1,
      lands_in: "core_tasks",
      reveal_when: "Agent 追问实习期做什么",
    },
    {
      id: "f_wage",
      label: "日薪/时长",
      truth: "日薪 300 元/天,希望实习 6 个月每周 5 天。",
      weight: 1,
      lands_in: "constraints",
      reveal_when: "Agent 追问日薪/时长",
    },
  ],
  planted_conflicts: [
    {
      id: "c_return_mismatch",
      description: "承诺'干得好就转正',但转正名额未落实、标准未定——别画空饼,需先确认名额与考核。",
      must_surface: true,
    },
  ],
  must_detect: ["转正名额是否真实存在未确认", "转正标准模糊", "画转正饼"],
  acceptable_question_intents: [
    "先确认这是转正实习",
    "追问转正名额是否真实存在/已审批",
    "追问转正考核标准",
    "追问日薪/实习时长",
  ],
  forbidden_inferences: [
    "默认转正名额已存在",
    "默认实习生一定能转正",
    "替业务方承诺转正",
  ],
  expected_hr_escalations: ["转正名额审批", "转正考核标准制定"],
};

export const GOLD_CARDS: GoldCard[] = [
  cardAiAmbiguous,
  cardPmConflict,
  cardOpsMissingGoal,
  cardCampusMismatch,
  cardInternMismatch,
  cardReturnOfferMismatch,
];

export function getCard(id: string): GoldCard {
  const c = GOLD_CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`未知 card: ${id}`);
  return c;
}
