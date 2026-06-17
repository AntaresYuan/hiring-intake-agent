import OpenAI from "openai";

// 测评专用 LLM 客户端。与产品 lib/llm.ts 分开，是为了让三个角色用不同模型：
//   - 被测 Agent（产品本体）: 走 lib/llm.ts，模型由 LLM_MODEL 指定（建议 deepseek-v4-pro）
//   - 模拟用人经理: EVAL_SIM_MODEL（默认 deepseek-v4-flash）—— 角色扮演，便宜，且与 Agent 不同模型，减少“心领神会”
//   - LLM Judge:    EVAL_JUDGE_MODEL（默认 deepseek-v4-pro）—— 判语义一致性
// ⚠️ 注意：judge 与被测同属 DeepSeek 家族，非完全独立。消偏主要靠「reference-anchored 判定」
//   （judge 永远对着 gold 答案打分，而非凭感觉），换 variant 只是辅助。
//   接口 provider 无关：把 LLM_BASE_URL/LLM_API_KEY 指向 Claude/OpenAI 即可换真正独立的 judge。

const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.deepseek.com";
const API_KEY = process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";

export const SIM_MODEL = process.env.EVAL_SIM_MODEL ?? "deepseek-v4-flash";
export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "deepseek-v4-pro";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!API_KEY) throw new Error("测评需要 LLM_API_KEY（或 DEEPSEEK_API_KEY）。");
  if (!client)
    client = new OpenAI({
      apiKey: API_KEY,
      baseURL: BASE_URL,
      timeout: 90_000, // 卡死的请求 90s 后失败，由上层重试/兜底接住，别吊死整轮
      maxRetries: 2,
    });
  return client;
}

export function hasApiKey(): boolean {
  return Boolean(API_KEY);
}

interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 调用指定模型并强制 JSON 输出。带一次纠正重试（DeepSeek JSON 模式偶发空白，见项目记忆）。 */
export async function evalChatJSON<T>(
  model: string,
  messages: Msg[],
  temperature = 0.4
): Promise<T> {
  const call = async (msgs: Msg[], temp: number) => {
    const res = await getClient().chat.completions.create({
      model,
      messages: msgs,
      temperature: temp,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
    return res.choices[0]?.message?.content ?? "";
  };

  let raw = await call(messages, temperature);
  let parsed = safeParseJSON<T>(raw);
  if (parsed === null) {
    // 追加纠正指令 + 调高温度，打破“确定性空白”失败模式
    const nudged: Msg[] = [
      ...messages,
      {
        role: "system",
        content: "你上次没有输出有效内容。现在只输出一个合法 JSON 对象，不要空白、解释或代码围栏。",
      },
    ];
    raw = await call(nudged, 0.8);
    parsed = safeParseJSON<T>(raw);
  }
  if (parsed === null) throw new Error(`模型 ${model} 连续返回无法解析的内容`);
  return parsed;
}

/** 鲁棒 JSON 解析：兼容 ```json 围栏、首尾杂字，截取最外层 {…} */
export function safeParseJSON<T>(raw: string): T | null {
  if (!raw) return null;
  const fenced = raw.replace(/```json\s*/gi, "").replace(/```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const candidates = [raw, fenced];
  if (start >= 0 && end > start) candidates.push(fenced.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === "object") return v as T;
    } catch {
      /* try next */
    }
  }
  return null;
}
