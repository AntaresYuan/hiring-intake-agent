import type { NextRequest } from "next/server";
import { getCard } from "@/eval/cards";
import { requireAccess } from "@/lib/access";
import { getPersona } from "@/eval/personas";
import { runCase } from "@/eval/runner";
import { judgeRun } from "@/eval/judge";
import { scoreCase } from "@/eval/scorer";
import { saveHistory, makeId } from "@/eval/history";
import { SIM_MODEL, JUDGE_MODEL } from "@/eval/llm";
import type { EvalEvent, Persona } from "@/eval/types";

// 单案 live 运行：浏览器 EventSource 连这个 GET，服务端实时把每一轮对话 + 最终评分用 SSE 推回去。
// 跑在 Next 进程里 → 自动读 .env.local 的 LLM_API_KEY / LLM_MODEL / EVAL_*。

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAccess(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const cardId = url.searchParams.get("card") ?? "";
  const personaId = (url.searchParams.get("persona") ??
    "cooperative") as Persona["id"];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: EvalEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      try {
        const card = getCard(cardId);
        const persona = getPersona(personaId);
        const run = await runCase(card, persona, {
          onTurn: (turn) => send({ type: "turn", turn }),
        });
        const judged = await judgeRun(card, run.final_state);
        const score = scoreCase(card, run, judged);
        send({ type: "scored", score, final_state: run.final_state });
        // 手动单案也进历史榜
        saveHistory({
          id: makeId("single"),
          kind: "single",
          generated_at: new Date().toISOString(),
          models: {
            agent: process.env.LLM_MODEL ?? "deepseek-chat",
            sim: SIM_MODEL,
            judge: JUDGE_MODEL,
          },
          title: `${card.id} × ${persona.label}`,
          headline_score: score.critical_info_recovery,
          gate_pass: null,
          single: { score, transcript: run.transcript, final_state: run.final_state },
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "未知错误",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
