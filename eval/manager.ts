import { evalChatJSON, SIM_MODEL } from "./llm";
import type { GoldCard, Persona, ManagerReply } from "./types";

// 模拟用人经理：拿着卡上的「水下真相」，按 persona 扮演一个说不清需求的业务方。
// 三条硬约束（见 [[评估框架与基础测试案例]] 的设计意图）：
//  1. 挤牙膏：只回答 Agent 实际问到的内容，绝不主动倒出关键事实或冲突。
//  2. 不泄底：它知道全部真相，但目标不是帮 Agent 通关。
//  3. 一致性：回答必须锁在卡内，并如实报告本轮透露了哪些 fact id（披露账本）。

function buildManagerSystem(card: GoldCard, persona: Persona): string {
  const facts = card.critical_information
    .map(
      (f) =>
        `- [${f.id}] ${f.label}：真相=「${f.truth}」；披露条件=当${f.reveal_when}时才说。`
    )
    .join("\n");
  const conflicts = card.planted_conflicts
    .map((c) => `- ${c.description}`)
    .join("\n");

  const typeLine = card.recruit_type
    ? `\n这是一次「${card.recruit_type}」招聘（你心里清楚，但不一定主动说；被问到招聘类型时如实回答）。`
    : "";
  return `你在扮演一位**用人经理**，正在和一个“招聘需求澄清助手”对话。你心里其实清楚下面这些真相，但你**不是来帮它通关的**——你像真实业务方一样，说不太清、也懒得一次说全。${typeLine}

# 你的人格（务必体现）
${persona.label}：${persona.instruction}

# 你心里的真相（这些是你的私有信息，绝不要主动一次性倒出来）
${facts}

# 你内心隐约觉得别扭、但说不清的地方（对应预埋冲突，不要主动点破，被追问到才承认）
${conflicts}

# 回答规则（重要）
1. **只回答对方这一轮实际问到的内容**。没问到的真相，哪怕你知道，也不要说。
2. 披露要符合上面每条的「披露条件」。条件没满足就用人格化的方式搪塞/反问/给模糊回答。
3. 不要主动报薪资数字、职级、冲突；这些要被精准问到才透露。
4. 用口语，别像在背稿；长度 1-4 句，符合你的人格。
5. 如实记录：本轮你实际透露了哪些 fact id（哪怕只透露了一部分也算）。
6. **绝不编造与上面真相相矛盾的具体事实**。某条还没到披露时机时，用模糊话搪塞或反问，**不要张口给一个确定但错误的答案**（例如真实目标是 A，别为了对抗就说成 B）。说不清就含糊，而不是说错。
7. **被真正追问到点上时要松口**：当对方绕过你的技能/职责清单、直接追问"到底要解决什么业务问题 / 这阶段最该改善哪个指标"，或对你的说法提出有依据的质疑/对标时，按真相回答（包括承认真实目标、给出数字）。你是难搞，不是存心让对方做不出来——会追问的助手就该能问出来。

# 输出格式（严格 JSON）
{"reply": "你作为用人经理的口语回答", "revealed_fact_ids": ["本轮真正透露到的 fact id，没有就空数组"]}`;
}

export async function simulateManager(
  card: GoldCard,
  persona: Persona,
  alreadyRevealed: string[],
  agentMessage: string
): Promise<ManagerReply> {
  const system = buildManagerSystem(card, persona);
  const ctx = alreadyRevealed.length
    ? `（你之前已经透露过这些 fact：${alreadyRevealed.join("、")}，不必重复倒出。）`
    : "（这是对话刚开始。）";

  const out = await evalChatJSON<ManagerReply>(
    SIM_MODEL,
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `${ctx}\n\n招聘助手刚刚对你说：\n「${agentMessage}」\n\n请按你的人格回答。`,
      },
    ],
    0.7
  );

  // 防御：只接受卡上存在的 fact id
  const validIds = new Set(card.critical_information.map((f) => f.id));
  return {
    reply: typeof out.reply === "string" ? out.reply : "",
    revealed_fact_ids: Array.isArray(out.revealed_fact_ids)
      ? out.revealed_fact_ids.filter((id) => validIds.has(id))
      : [],
  };
}
