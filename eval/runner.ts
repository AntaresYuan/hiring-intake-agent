import { runTurn } from "../lib/agent";
import { emptyState, type HiringState } from "../lib/schema";
import { simulateManager } from "./manager";
import type { GoldCard, Persona, RunResult, TurnRecord } from "./types";

// Runner：把被测 Agent 和模拟用人经理撮合成一场真实多轮对话，直到 Agent 判定可交接、或用尽轮数。
// 被测 Agent 用 lib/agent.runTurn（产品本体，模型由 LLM_MODEL 决定）；
// 模拟经理用 eval/manager（另一模型）。两者只通过对话往来，互不看对方内部状态。

export interface RunOptions {
  maxRounds?: number;
  /** 每完成一轮就回调一次（live 页面用来流式推送对话） */
  onTurn?: (turn: TurnRecord) => void;
}

export async function runCase(
  card: GoldCard,
  persona: Persona,
  opts: RunOptions = {}
): Promise<RunResult> {
  const maxRounds = opts.maxRounds ?? 10; // 8 偏紧导致难人格扎堆"晚停"，放宽到 10
  let state: HiringState | null = null;
  const history: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: card.initial_request },
  ];
  const transcript: TurnRecord[] = [];
  const revealed = new Set<string>();
  let stoppedReason: "handoff" | "max_rounds" = "max_rounds";
  let round = 0;

  for (round = 1; round <= maxRounds; round++) {
    const result = await runTurn({ history, state });
    state = result.state;

    const rec: TurnRecord = {
      round,
      agent_reply: result.reply,
      questions_asked: result.diagnosis.questions_asked,
      manager_reply: "",
      revealed_fact_ids: [],
      handoff_ready: result.handoff.ready,
      gaps_remaining: result.handoff.missing_for_handoff,
    };

    // Agent 认为可交接 → 停（停止判定是代码侧 computeHandoff，不是模型自评）
    if (result.handoff.ready) {
      transcript.push(rec);
      opts.onTurn?.(rec);
      stoppedReason = "handoff";
      break;
    }

    // 用人经理回应 Agent 本轮的追问（挤牙膏式，只答被问到的）
    const mgr = await simulateManager(card, persona, [...revealed], result.reply);
    mgr.revealed_fact_ids.forEach((id) => revealed.add(id));
    rec.manager_reply = mgr.reply;
    rec.revealed_fact_ids = mgr.revealed_fact_ids;
    transcript.push(rec);
    opts.onTurn?.(rec);

    history.push({ role: "assistant", content: result.reply });
    history.push({ role: "user", content: mgr.reply });
  }

  return {
    card_id: card.id,
    persona_id: persona.id,
    transcript,
    final_state: state ?? emptyState(),
    stopped_round: Math.min(round, maxRounds),
    stopped_reason: stoppedReason,
    revealed_fact_ids: [...revealed],
  };
}
