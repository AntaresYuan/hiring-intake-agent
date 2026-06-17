import { evalChatJSON, JUDGE_MODEL } from "./llm";
import type { GoldCard, JudgeOutput } from "./types";
import type { HiringState } from "../lib/schema";

// Reference-anchored LLM Judge：永远对着 gold 答案打分，不做开放式“好不好”评价。
// 这是消 self-preference bias 的关键——有标准答案时，模型偏袒自己输出的空间很小。
// 一次 run 只调一次 judge，同时产出三类判定：
//   captured           —— 每条关键事实有没有落进最终 state（语义匹配，非字符串匹配）
//   conflicts_surfaced —— 哪些预埋冲突被 Agent 暴露了
//   forbidden_asserted —— Agent 有没有无依据地断言了 forbidden_inferences 里的事项
//
// judge 只判「语义一致性 / 是否出现」，不判「这个要求该不该是 must-have / 薪资合不合理」——
// 那些价值判断留给代码侧确定性指标和真人（见项目记忆红线）。

const JUDGE_SYSTEM = `你是一个严格的评测裁判。你只做一件事：把「被测系统产出的结构化招聘需求」对照「标准答案」，逐条判断是否命中。
铁律：
- 你不评价文笔，不判断某要求该不该是 must-have，不判断薪资是否合理。
- 你只判断：标准答案里的某条事实/冲突，在被测产出里是否在语义上出现了。
- 语义匹配：用词不同但意思一致就算命中；只沾边、缺关键内容算 partial；没有就是 no。
- 严格但公平，宁可保守。只输出 JSON。`;

export async function judgeRun(
  card: GoldCard,
  finalState: HiringState
): Promise<JudgeOutput> {
  const facts = card.critical_information
    .map((f) => `- [${f.id}] ${f.label}：标准答案=「${f.truth}」`)
    .join("\n");
  const conflicts = card.planted_conflicts
    .map((c) => `- [${c.id}] ${c.description}`)
    .join("\n");
  const forbidden = card.forbidden_inferences
    .map((x, i) => `- [${i}] ${x}`)
    .join("\n");

  const user = `# 标准答案：必须被还原的关键事实
${facts}

# 标准答案：必须被暴露的预埋冲突
${conflicts}

# 不允许的无依据断言（被测系统若“确信地”写出这些、而对话中并无依据，即算命中）
${forbidden}

# 被测系统产出的结构化需求（最终 state）
\`\`\`json
${JSON.stringify(finalState)}
\`\`\`

请判断并输出 JSON：
{
  "captured": { "f_xxx": "yes|partial|no", ...每条关键事实都要给 },
  "conflicts_surfaced": ["被真正暴露并给了取舍方向的预埋冲突 id"],
  "other_valid_conflicts": ["Agent 暴露的、不在预埋清单里但确实成立的实质冲突的简短描述（如有）"],
  "forbidden_asserted": ["被无依据断言的事项原文，没有则空数组"]
}`;

  const out = await evalChatJSON<JudgeOutput>(JUDGE_MODEL, [
    { role: "system", content: JUDGE_SYSTEM },
    { role: "user", content: user },
  ]);

  // 防御性归一：保证每条 fact 都有判定，过滤非法冲突 id
  const captured: JudgeOutput["captured"] = {};
  for (const f of card.critical_information) {
    const v = out.captured?.[f.id];
    captured[f.id] = v === "yes" || v === "partial" ? v : "no";
  }
  const validConf = new Set(card.planted_conflicts.map((c) => c.id));
  return {
    captured,
    conflicts_surfaced: Array.isArray(out.conflicts_surfaced)
      ? out.conflicts_surfaced.filter((id) => validConf.has(id))
      : [],
    other_valid_conflicts: Array.isArray(out.other_valid_conflicts)
      ? out.other_valid_conflicts.filter((x) => typeof x === "string")
      : [],
    forbidden_asserted: Array.isArray(out.forbidden_asserted)
      ? out.forbidden_asserted.filter((x) => typeof x === "string")
      : [],
  };
}
