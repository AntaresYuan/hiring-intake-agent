import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const ACCESS_COOKIE = "hia_access";
const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h demo pass

export function accessEnabled(): boolean {
  return Boolean(accessCode());
}

export function accessCode(): string {
  return (process.env.ACCESS_CODE ?? "").trim();
}

function accessSecret(): string {
  return (
    process.env.ACCESS_SECRET ??
    process.env.LLM_API_KEY ??
    process.env.DEEPSEEK_API_KEY ??
    accessCode()
  ).trim();
}

export function createAccessToken(now = Date.now()): string {
  const expiresAt = now + DEFAULT_TTL_SECONDS * 1000;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAccessToken(token: string | undefined, now = Date.now()): boolean {
  if (!accessEnabled()) return true;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  return safeEqual(parts[2], sign(payload));
}

export function verifyAccessCode(input: string): boolean {
  const expected = accessCode();
  if (!expected) return true;
  return safeEqual(input.trim(), expected);
}

export function hasRequestAccess(req: NextRequest): boolean {
  return verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);
}

export function requireAccess(req: NextRequest): NextResponse | null {
  if (hasRequestAccess(req)) return null;
  return NextResponse.json({ error: "需要输入通行令" }, { status: 401 });
}

export function accessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEFAULT_TTL_SECONDS,
  };
}

function sign(payload: string): string {
  const secret = accessSecret();
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
