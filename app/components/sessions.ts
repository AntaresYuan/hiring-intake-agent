import type { ChatTurn } from "./types";
import type {
  HiringState,
  TurnDiagnosis,
  HandoffReadiness,
  ChoiceGroup,
} from "@/lib/schema";

// 多会话 + localStorage 持久化。后端无状态，会话完全存在浏览器本地。
// 所有读写都防御 SSR（localStorage 不存在时返回默认值）。

export interface StoredSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatTurn[];
  state: HiringState | null;
  diagnosis: TurnDiagnosis | null;
  handoff: HandoffReadiness | null;
  choices: ChoiceGroup[];
}

export interface SessionMeta {
  id: string;
  title: string;
  updatedAt: number;
}

const KEY = "hia.sessions.v1";

function readMap(): Record<string, StoredSession> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeMap(m: Record<string, StoredSession>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* 配额满等情况忽略 */
  }
}

export function listSessions(): SessionMeta[] {
  return Object.values(readMap())
    .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): StoredSession | null {
  return readMap()[id] ?? null;
}

export function saveSession(s: StoredSession) {
  const m = readMap();
  m[s.id] = s;
  writeMap(m);
}

export function deleteSession(id: string) {
  const m = readMap();
  delete m[id];
  writeMap(m);
}

export function newSession(): StoredSession {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);
  const now = Date.now();
  return {
    id,
    title: "新会话",
    createdAt: now,
    updatedAt: now,
    messages: [],
    state: null,
    diagnosis: null,
    handoff: null,
    choices: [],
  };
}

/** 标题优先用已识别岗位名，否则取首条用户消息前 16 字 */
export function deriveTitle(s: StoredSession): string {
  if (s.state?.role_title?.trim()) return s.state.role_title.trim();
  const firstUser = s.messages.find((m) => m.role === "user");
  if (firstUser) return firstUser.content.slice(0, 16);
  return "新会话";
}
