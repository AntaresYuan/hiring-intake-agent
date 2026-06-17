import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  accessCookieOptions,
  accessEnabled,
  createAccessToken,
  hasRequestAccess,
  verifyAccessCode,
} from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;

export async function GET(req: NextRequest) {
  return NextResponse.json({
    enabled: accessEnabled(),
    authorized: hasRequestAccess(req),
  });
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  const now = Date.now();
  const record = failedAttempts.get(key);
  if (record && record.lockedUntil > now) {
    return NextResponse.json(
      { error: "尝试次数过多，请稍后再试" },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  if (!verifyAccessCode(body.code ?? "")) {
    const nextCount = (record?.count ?? 0) + 1;
    failedAttempts.set(key, {
      count: nextCount,
      lockedUntil: nextCount >= MAX_ATTEMPTS ? now + LOCK_MS : 0,
    });
    return NextResponse.json({ error: "通行令不正确" }, { status: 401 });
  }

  failedAttempts.delete(key);
  const res = NextResponse.json({ ok: true });
  if (accessEnabled()) {
    res.cookies.set(ACCESS_COOKIE, createAccessToken(), accessCookieOptions());
  }
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, "", { ...accessCookieOptions(), maxAge: 0 });
  return res;
}

function clientKey(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
