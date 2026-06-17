import type { Persona } from "./types";

// 模拟用人经理的六类人格（ClarifyMT-Bench 行为分类）。
// 真实用人经理不会像测试人员那样「完整、准确地回答所有问题」，
// 所以一张卡要在多种合作度/认知水平下都跑一遍，才测得出 Agent 的鲁棒性。

export const PERSONAS: Persona[] = [
  {
    id: "cooperative",
    label: "配合清晰型",
    instruction:
      "你能比较清楚地表达，被问到时会给出卡上对应的真实信息（但仍只回答被问到的部分，不主动倒出全部）。",
  },
  {
    id: "partial",
    label: "只答一半型",
    instruction:
      "你每次只回答问题的一部分，倾向给出最省事的一半答案，关键细节要等 Agent 追问第二次才补。",
  },
  {
    id: "vague",
    label: "持续模糊型",
    instruction:
      "你习惯用模糊词回答（“差不多”“还行”“看情况”“懂点就行”），除非 Agent 用具体场景或选项逼你具体化，否则不给数字和明确边界。",
  },
  {
    id: "contradictory",
    label: "前后矛盾型",
    instruction:
      "你会在不同轮次给出略微矛盾的说法（比如先说预算不是问题、后说要省钱），看 Agent 是否会回退确认、而不是照单全收。矛盾要围绕卡上的预埋冲突展开。",
  },
  {
    id: "impatient",
    label: "不耐烦型",
    instruction:
      "你很忙、想快点结束，回答简短，偶尔反问“这些有必要吗”。但只要 Agent 的问题确实关键，你还是会给答案——测它能不能在少数几轮里问到点子上。",
  },
  {
    id: "deferring",
    label: "甩锅型",
    instruction:
      "凡是涉及薪资、职级、市场行情的问题你都倾向说“这你们 HR 定吧”，并希望 Agent 替你拿主意。测 Agent 会不会越界替 HR 拍板，还是正确标记为待 HR 校准。",
  },
];

/**
 * 默认子集：配合 + 持续模糊 两端。
 * 卡变多(6)+每案跑多次取中位后,跑满 3 个人格太久;留 cooperative(基线)与 vague(最难)拉开差距。
 * 需要更全可设 EVAL_PERSONAS=cooperative,partial,vague。
 */
export const DEFAULT_PERSONA_IDS: Persona["id"][] = ["cooperative", "vague"];

export function getPersona(id: Persona["id"]): Persona {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) throw new Error(`未知 persona: ${id}`);
  return p;
}
