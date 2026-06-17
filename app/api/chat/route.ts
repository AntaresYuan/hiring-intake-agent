import { NextRequest, NextResponse } from "next/server";
import { runTurn } from "@/lib/agent";
import { requireAccess } from "@/lib/access";
import type { HiringState } from "@/lib/schema";

export const runtime = "nodejs";

interface ChatRequestBody {
  history: { role: "user" | "assistant"; content: string }[];
  state: HiringState | null;
}

export async function POST(req: NextRequest) {
  const denied = requireAccess(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as ChatRequestBody;
    if (!Array.isArray(body.history)) {
      return NextResponse.json(
        { error: "history 必须是数组" },
        { status: 400 }
      );
    }
    const result = await runTurn({
      history: body.history,
      state: body.state ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
