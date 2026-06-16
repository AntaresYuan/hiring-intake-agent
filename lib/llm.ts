import OpenAI from "openai";

// Provider 无关的 LLM 客户端。
// 默认指向 DeepSeek 的 OpenAI 兼容端点；换成 Claude/OpenAI 只需改三个环境变量。
//   LLM_API_KEY   —— API key
//   LLM_BASE_URL  —— 兼容 OpenAI 的端点（DeepSeek: https://api.deepseek.com）
//   LLM_MODEL     —— 模型名（DeepSeek: deepseek-chat）

const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.deepseek.com";
const MODEL = process.env.LLM_MODEL ?? "deepseek-chat";
const API_KEY =
  process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";

export const MODEL_NAME = MODEL;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!API_KEY) {
    throw new Error(
      "缺少 LLM API key：请在 .env.local 设置 LLM_API_KEY（或 DEEPSEEK_API_KEY）。"
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  }
  return client;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  finishReason: string | null;
  truncated: boolean; // finish_reason === "length"，输出被 max_tokens 截断
}

/** 调用 LLM 并强制返回 JSON 对象。返回 finish_reason 以便上层在截断时重试。 */
export async function chatJSON(
  messages: ChatMessage[],
  maxTokens = 8192,
  temperature = 0.3
): Promise<ChatResult> {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  });
  const choice = res.choices[0];
  return {
    content: choice?.message?.content ?? "{}",
    finishReason: choice?.finish_reason ?? null,
    truncated: choice?.finish_reason === "length",
  };
}

export function hasApiKey(): boolean {
  return Boolean(API_KEY);
}
