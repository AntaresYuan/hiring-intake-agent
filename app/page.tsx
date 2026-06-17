"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AgentTurnResult,
  HiringState,
  TurnDiagnosis,
  HandoffReadiness,
  ChoiceGroup,
} from "@/lib/schema";
import type { ChatTurn } from "./components/types";
import DiagnosisPanel from "./components/DiagnosisPanel";
import StatePanel from "./components/StatePanel";
import HandoffPanel from "./components/HandoffPanel";
import ChoiceBlock from "./components/ChoiceBlock";
import ExportPanel from "./components/ExportPanel";
import SessionRail from "./components/SessionRail";
import AccessGate from "./components/AccessGate";
import {
  type SessionMeta,
  type StoredSession,
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  newSession,
  deriveTitle,
} from "./components/sessions";

const TABS = [
  { key: "diagnosis", label: "诊断看板" },
  { key: "state", label: "需求初稿" },
  { key: "handoff", label: "HR 交接视图" },
  { key: "export", label: "JD / 面试 / 评估" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const EXAMPLE =
  "我们团队要招一个能力强、有大厂经验的算法工程师，最好年轻点、能马上独立扛事，预算别太高。";

// VS Code 风格的面板折叠图标：方框 + 一侧高亮的栏。active 时高亮该侧。
function PanelToggle({
  side,
  active,
  title,
  onClick,
}: {
  side: "left" | "right";
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded p-1.5 transition hover:bg-gray-100 ${
        active ? "text-gray-800" : "text-gray-300"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect
          x="1.5"
          y="2.5"
          width="13"
          height="11"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        {side === "left" ? (
          <>
            <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
            <rect x="2" y="3" width="4" height="10" fill="currentColor" opacity={active ? 0.9 : 0.25} />
          </>
        ) : (
          <>
            <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
            <rect x="10" y="3" width="4" height="10" fill="currentColor" opacity={active ? 0.9 : 0.25} />
          </>
        )}
      </svg>
    </button>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<HiringState | null>(null);
  const [diagnosis, setDiagnosis] = useState<TurnDiagnosis | null>(null);
  const [handoff, setHandoff] = useState<HandoffReadiness | null>(null);
  const [choices, setChoices] = useState<ChoiceGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("diagnosis");
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [railOpen, setRailOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  // 小屏默认收起两侧抽屉，让对话区可见
  useEffect(() => {
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
      setRailOpen(false);
      setWorkspaceOpen(false);
    }
  }, []);

  // 首次挂载：从 localStorage 载入会话；没有则新建一个
  useEffect(() => {
    const metas = listSessions();
    if (metas.length > 0) {
      const s = getSession(metas[0].id);
      if (s) {
        loadInto(s);
        setSessions(metas);
        return;
      }
    }
    const fresh = newSession();
    saveSession(fresh);
    setCurrentId(fresh.id);
    setSessions(listSessions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadInto(s: StoredSession) {
    setCurrentId(s.id);
    setMessages(s.messages);
    setState(s.state);
    setDiagnosis(s.diagnosis);
    setHandoff(s.handoff);
    setChoices(s.choices);
    setError(null);
    setInput("");
  }

  /** 把当前活动对话写回 localStorage（用刚拿到的最新值，避免 setState 异步问题） */
  function persist(next: Partial<StoredSession>) {
    if (!currentId) return;
    const existing = getSession(currentId);
    const merged: StoredSession = {
      id: currentId,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      title: existing?.title ?? "新会话",
      messages,
      state,
      diagnosis,
      handoff,
      choices,
      ...next,
    };
    merged.title = deriveTitle(merged);
    saveSession(merged);
    setSessions(listSessions());
  }

  function closeRailOnSmall() {
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(min-width: 1024px)").matches
    ) {
      setRailOpen(false);
    }
  }

  function handleNew() {
    const fresh = newSession();
    saveSession(fresh);
    loadInto(fresh);
    setSessions(listSessions());
    setTab("diagnosis");
    closeRailOnSmall();
  }

  function handleSelect(id: string) {
    if (id === currentId) return;
    const s = getSession(id);
    if (s) loadInto(s);
    closeRailOnSmall();
  }

  function handleDelete(id: string) {
    deleteSession(id);
    const metas = listSessions();
    setSessions(metas);
    if (id === currentId) {
      if (metas[0]) {
        const s = getSession(metas[0].id);
        if (s) loadInto(s);
      } else {
        handleNew();
      }
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    const nextMessages: ChatTurn[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setChoices([]); // 用户已回应，清掉上一轮选项
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: nextMessages, state }),
      });
      const data = (await res.json()) as AgentTurnResult & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "请求失败");
      const finalMessages: ChatTurn[] = [
        ...nextMessages,
        { role: "assistant", content: data.reply },
      ];
      setMessages(finalMessages);
      setState(data.state);
      setDiagnosis(data.diagnosis);
      setHandoff(data.handoff);
      setChoices(data.choices ?? []);
      persist({
        messages: finalMessages,
        state: data.state,
        diagnosis: data.diagnosis,
        handoff: data.handoff,
        choices: data.choices ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
      setMessages(nextMessages);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessGate>
    <div className="flex h-[100dvh] flex-col bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold sm:text-base">招聘需求澄清 Agent</h1>
          <p className="hidden text-xs text-gray-400 sm:block">
            把用人经理模糊的招聘想法，澄清为可交接 HR 的结构化需求初稿
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              handoff?.ready
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {handoff?.ready ? "✓ 可交接 HR" : "澄清中"}
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-gray-200 p-0.5">
            <PanelToggle
              side="left"
              active={railOpen}
              title={railOpen ? "隐藏会话栏" : "显示会话栏"}
              onClick={() => setRailOpen((v) => !v)}
            />
            <PanelToggle
              side="right"
              active={workspaceOpen}
              title={workspaceOpen ? "隐藏工作台" : "显示工作台"}
              onClick={() => setWorkspaceOpen((v) => !v)}
            />
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* 小屏抽屉打开时的遮罩，点击关闭 */}
        {(railOpen || workspaceOpen) && (
          <div
            onClick={() => {
              setRailOpen(false);
              setWorkspaceOpen(false);
            }}
            className="absolute inset-0 z-20 bg-black/20 lg:hidden"
          />
        )}

        {/* 最左：会话列表（大屏并排，小屏抽屉） */}
        {railOpen && (
          <div className="absolute inset-y-0 left-0 z-30 w-64 shadow-xl lg:static lg:z-auto lg:w-56 lg:shrink-0 lg:shadow-none">
            <SessionRail
              sessions={sessions}
              currentId={currentId}
              onNew={handleNew}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          </div>
        )}

        {/* 中：对话（小屏始终占满；大屏在工作台打开时为固定宽度） */}
        <div
          className={`flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white ${
            workspaceOpen ? "lg:w-[38%] lg:min-w-[340px] lg:flex-none" : ""
          }`}
        >
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                <p className="mb-2 font-medium text-gray-700">
                  以用人经理身份，描述你想招的人 👇
                </p>
                <p className="text-xs leading-relaxed text-gray-400">
                  Agent 不会直接给你写 JD，而是先诊断你描述里的模糊词、缺失信息和冲突，再一轮轮把它澄清成可交接 HR 的需求初稿。
                </p>
                <button
                  onClick={() => send(EXAMPLE)}
                  className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700"
                >
                  试试示例描述
                </button>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user" ? "flex justify-end" : "flex justify-start"
                }
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {!loading &&
              choices.length > 0 &&
              messages[messages.length - 1]?.role === "assistant" && (
                <ChoiceBlock
                  groups={choices}
                  disabled={loading}
                  onSubmit={(text) => send(text)}
                />
              )}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-400">
                  思考中…
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                {error}
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={2}
                placeholder="描述招聘需求，或回答 Agent 的追问…（Enter 发送，Shift+Enter 换行）"
                className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                发送
              </button>
            </div>
          </div>
        </div>

        {/* 右：工作台（大屏并排，小屏抽屉） */}
        {workspaceOpen && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col bg-white shadow-xl lg:static lg:z-auto lg:max-w-none lg:min-w-0 lg:flex-1 lg:shadow-none">
          <div className="flex gap-1 border-b border-gray-200 bg-white px-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`border-b-2 px-3 py-2.5 text-sm ${
                  tab === t.key
                    ? "border-gray-900 font-medium text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "diagnosis" && (
              <DiagnosisPanel diagnosis={diagnosis} handoff={handoff} />
            )}
            {tab === "state" && state && <StatePanel state={state} />}
            {tab === "state" && !state && (
              <div className="p-6 text-sm text-gray-400">
                还没有结构化需求，先在左侧描述招聘需求。
              </div>
            )}
            {tab === "handoff" && state && <HandoffPanel state={state} />}
            {tab === "handoff" && !state && (
              <div className="p-6 text-sm text-gray-400">
                对话推进后这里生成 HR 交接视图。
              </div>
            )}
            {tab === "export" && (
              <ExportPanel state={state} ready={Boolean(handoff?.ready)} />
            )}
          </div>
        </div>
        )}
      </div>
    </div>
    </AccessGate>
  );
}
