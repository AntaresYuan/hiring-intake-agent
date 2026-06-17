import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/access";
import { runExport } from "@/lib/export";
import type { HiringState } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const denied = requireAccess(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as { state: HiringState };
    if (!body.state) {
      return NextResponse.json({ error: "缺少 state" }, { status: 400 });
    }
    const result = await runExport(body.state);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
