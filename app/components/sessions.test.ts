import { describe, it, expect, beforeEach } from "vitest";
import {
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  newSession,
  deriveTitle,
} from "./sessions";
import { emptyState } from "@/lib/schema";

// 轻量 localStorage polyfill（vitest 默认 node 环境无此对象）
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe("sessions 存储", () => {
  it("保存后可读回，并出现在列表里", () => {
    const s = newSession();
    s.messages = [{ role: "user", content: "招个算法工程师" }];
    saveSession(s);
    expect(getSession(s.id)?.messages[0].content).toBe("招个算法工程师");
    expect(listSessions().map((m) => m.id)).toContain(s.id);
  });

  it("列表按 updatedAt 倒序", () => {
    const a = newSession();
    a.updatedAt = 1000;
    const b = newSession();
    b.updatedAt = 2000;
    saveSession(a);
    saveSession(b);
    expect(listSessions()[0].id).toBe(b.id);
  });

  it("删除后列表不再包含", () => {
    const s = newSession();
    saveSession(s);
    deleteSession(s.id);
    expect(getSession(s.id)).toBeNull();
  });

  it("deriveTitle 优先用岗位名，否则取首条用户消息", () => {
    const s = newSession();
    s.messages = [{ role: "user", content: "招个能力强的算法工程师做推荐召回方向" }];
    expect(deriveTitle(s)).toBe("招个能力强的算法工程师做推荐召回");
    s.state = { ...emptyState(), role_title: "推荐算法工程师" };
    expect(deriveTitle(s)).toBe("推荐算法工程师");
  });
});
