import { afterEach, describe, expect, it } from "vitest";
import {
  accessEnabled,
  createAccessToken,
  verifyAccessCode,
  verifyAccessToken,
} from "./access";

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("access gate", () => {
  it("未配置 ACCESS_CODE 时默认开放，方便本地开发", () => {
    delete process.env.ACCESS_CODE;

    expect(accessEnabled()).toBe(false);
    expect(verifyAccessCode("anything")).toBe(true);
    expect(verifyAccessToken(undefined)).toBe(true);
  });

  it("配置 ACCESS_CODE 后校验通行令和签名 token", () => {
    process.env.ACCESS_CODE = "123456";
    process.env.ACCESS_SECRET = "test-secret";

    expect(accessEnabled()).toBe(true);
    expect(verifyAccessCode("000000")).toBe(false);
    expect(verifyAccessCode("123456")).toBe(true);

    const now = Date.UTC(2026, 5, 17, 12);
    const token = createAccessToken(now);
    expect(verifyAccessToken(token, now + 1000)).toBe(true);
    expect(verifyAccessToken(`${token}x`, now + 1000)).toBe(false);
  });

  it("过期 token 失效", () => {
    process.env.ACCESS_CODE = "123456";
    process.env.ACCESS_SECRET = "test-secret";

    const now = Date.UTC(2026, 5, 17, 12);
    const token = createAccessToken(now);
    expect(verifyAccessToken(token, now + 24 * 60 * 60 * 1000 + 1)).toBe(false);
  });
});
