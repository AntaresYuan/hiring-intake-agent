"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseScore, EvalEvent, RunResult, TurnRecord } from "@/eval/types";
import type { HistoryEntry } from "@/eval/history";

interface Props {
  history: HistoryEntry[];
  cards: { id: string; title: string }[];
  personas: { id: string; label: string }[];
}

const TOP_N = 3;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const stopText = (s: CaseScore["stop_accuracy"]) =>
  s === "correct" ? "✓ 正确" : s === "early" ? "⚠ 早停" : "⚠ 晚停";
const stopClass = (s: CaseScore["stop_accuracy"]) =>
  s === "correct" ? "text-green-600" : "text-amber-600";

export default function BenchmarkView({ history, cards, personas }: Props) {
  const personaLabel = (id: string) =>
    personas.find((p) => p.id === id)?.label ?? id;
  return (
    <main className="mx-auto max-w-5xl px-5 py-8 text-gray-800">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Hiring Intake Agent · Benchmark</h1>
        <p className="mt-1 text-sm text-gray-500">
          历史榜:每次跑完(矩阵或单案)都留一条,按关键信息回收从高到低排名。
        </p>
      </header>

      <LiveRunner cards={cards} personas={personas} />
      <HistoryBoard history={history} personaLabel={personaLabel} />
    </main>
  );
}

// ——— 历史榜 ———
function HistoryBoard({
  history,
  personaLabel,
}: {
  history: HistoryEntry[];
  personaLabel: (id: string) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!history.length) {
    return (
      <section className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
        还没有历史记录。用上面的「单案 live 运行」跑一条,或跑一次完整矩阵,这里就会出现排名。
      </section>
    );
  }

  const shown = showAll ? history : history.slice(0, TOP_N);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        历史榜（共 {history.length} 次，按关键信息回收排名）
      </h2>
      <div className="space-y-2">
        {shown.map((e, i) => (
          <HistoryRow
            key={e.id}
            entry={e}
            rank={i + 1}
            open={openId === e.id}
            onToggle={() => setOpenId(openId === e.id ? null : e.id)}
            personaLabel={personaLabel}
          />
        ))}
      </div>
      {history.length > TOP_N && (
        <button
          className="mt-3 text-sm text-amber-700 hover:underline"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "收起" : `显示更多 (${history.length - TOP_N})`}
        </button>
      )}
    </section>
  );
}

function HistoryRow({
  entry,
  rank,
  open,
  onToggle,
  personaLabel,
}: {
  entry: HistoryEntry;
  rank: number;
  open: boolean;
  onToggle: () => void;
  personaLabel: (id: string) => string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <button
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-amber-50"
        onClick={onToggle}
      >
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
        <span className="w-7 font-semibold text-gray-400">#{rank}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            entry.kind === "matrix"
              ? "bg-gray-800 text-white"
              : "bg-gray-200 text-gray-700"
          }`}
        >
          {entry.kind === "matrix" ? "矩阵" : "单案"}
        </span>
        <span className="flex-1 font-medium">{entry.title}</span>
        <span className="font-semibold">{pct(entry.headline_score)}</span>
        {entry.kind === "matrix" && (
          <span className={entry.gate_pass ? "text-green-600" : "text-red-600"}>
            {entry.gate_pass ? "✅门" : "❌门"}
          </span>
        )}
        <span className="hidden text-xs text-gray-400 sm:inline">
          {new Date(entry.generated_at).toLocaleString()}
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-3">
          {entry.kind === "matrix" ? (
            <MatrixDetail entry={entry} personaLabel={personaLabel} />
          ) : (
            <SingleDetail entry={entry} personaLabel={personaLabel} />
          )}
        </div>
      )}
    </div>
  );
}

function MatrixDetail({
  entry,
  personaLabel,
}: {
  entry: HistoryEntry;
  personaLabel: (id: string) => string;
}) {
  const [openCase, setOpenCase] = useState<string | null>(null);
  const scores = entry.scores ?? [];
  const fairness = entry.fairness ?? [];
  const runOf = (s: CaseScore) =>
    entry.runs?.find(
      (r) => r.card_id === s.card_id && r.persona_id === s.persona_id
    );
  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500">
        {entry.models.agent} / sim {entry.models.sim} / judge {entry.models.judge}
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-2 py-1">Case</th>
              <th className="px-2 py-1">Persona</th>
              <th className="px-2 py-1">轮</th>
              <th className="px-2 py-1">回收</th>
              <th className="px-2 py-1">冲突</th>
              <th className="px-2 py-1">无依据</th>
              <th className="px-2 py-1">停止</th>
              <th className="px-2 py-1">断链</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => {
              const key = `${s.card_id}/${s.persona_id}`;
              const run = runOf(s);
              const isOpen = openCase === key;
              return (
                <ScoreRows
                  key={key}
                  s={s}
                  rowKey={key}
                  isOpen={isOpen}
                  onToggle={() => setOpenCase(isOpen ? null : key)}
                  run={run}
                  personaLabel={personaLabel}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {fairness.length > 0 && (
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {fairness.map((f) => (
                <tr key={f.case_id} className="border-t border-gray-100">
                  <td className="px-2 py-1 font-medium">
                    {f.case_id}
                    <span className="ml-2 text-gray-400">{f.label}</span>
                  </td>
                  <td className="px-2 py-1">
                    <span className={f.passed ? "text-green-600" : "text-red-600"}>
                      {f.passed ? "✅ PASS" : "❌ FAIL"}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-xs text-gray-500">
                    {f.violations.length ? f.violations.join("；") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScoreRows({
  s,
  rowKey,
  isOpen,
  onToggle,
  run,
  personaLabel,
}: {
  s: CaseScore;
  rowKey: string;
  isOpen: boolean;
  onToggle: () => void;
  run?: RunResult;
  personaLabel: (id: string) => string;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-t border-gray-100 hover:bg-amber-50"
        onClick={onToggle}
      >
        <td className="px-2 py-1 font-medium">
          <span className="mr-1 text-gray-400">{isOpen ? "▾" : "▸"}</span>
          {s.card_id}
        </td>
        <td className="px-2 py-1">{personaLabel(s.persona_id)}</td>
        <td className="px-2 py-1">{s.rounds}</td>
        <td className="px-2 py-1">{pct(s.critical_info_recovery)}</td>
        <td className="px-2 py-1">
          {pct(s.conflict_detection_rate)}
          {s.extra_conflicts ? (
            <span className="text-gray-400"> (+{s.extra_conflicts})</span>
          ) : null}
        </td>
        <td className="px-2 py-1">{pct(s.unsupported_assumption_rate)}</td>
        <td className={`px-2 py-1 ${stopClass(s.stop_accuracy)}`}>
          {stopText(s.stop_accuracy)}
        </td>
        <td className="px-2 py-1">{s.reasoning_chain_breaks}</td>
      </tr>
      {isOpen && run && (
        <tr className="bg-gray-50">
          <td colSpan={8} className="px-3 py-2">
            <Transcript turns={run.transcript} />
          </td>
        </tr>
      )}
    </>
  );
}

function SingleDetail({
  entry,
  personaLabel,
}: {
  entry: HistoryEntry;
  personaLabel: (id: string) => string;
}) {
  if (!entry.single) return null;
  const { score, transcript } = entry.single;
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        {personaLabel(score.persona_id)} · {entry.models.agent} / sim{" "}
        {entry.models.sim} / judge {entry.models.judge}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="关键信息回收" value={pct(score.critical_info_recovery)} />
        <Stat label="冲突发现" value={pct(score.conflict_detection_rate)} />
        <Stat label="无依据断言" value={pct(score.unsupported_assumption_rate)} hint="越低越好" />
        <Stat label="停止" value={stopText(score.stop_accuracy)} />
      </div>
      <Transcript turns={transcript} />
    </div>
  );
}

function Transcript({ turns }: { turns: TurnRecord[] }) {
  if (!turns.length)
    return <p className="text-xs text-gray-400">（无对话记录）</p>;
  return (
    <div className="space-y-2">
      {turns.map((t) => (
        <div key={t.round} className="rounded border border-gray-200 bg-white p-2">
          <div className="mb-1 text-xs font-semibold text-gray-400">
            第 {t.round} 轮{t.handoff_ready && " · 可交接"}
          </div>
          <p className="text-sm">
            <span className="font-medium text-amber-700">助手：</span>
            {t.agent_reply}
          </p>
          {t.manager_reply && (
            <p className="mt-1 text-sm">
              <span className="font-medium text-gray-600">用人经理：</span>
              {t.manager_reply}
            </p>
          )}
          {t.revealed_fact_ids.length > 0 && (
            <p className="mt-1 text-xs text-green-600">
              本轮透露：{t.revealed_fact_ids.join("、")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">
        {label}
        {hint && <span className="ml-1 text-gray-400">({hint})</span>}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

// ——— 单案 live 运行（跑完落历史榜并刷新列表）———
function LiveRunner({
  cards,
  personas,
}: {
  cards: { id: string; title: string }[];
  personas: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [card, setCard] = useState(cards[0]?.id ?? "");
  const [persona, setPersona] = useState(personas[0]?.id ?? "cooperative");
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [score, setScore] = useState<CaseScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const run = () => {
    esRef.current?.close();
    setRunning(true);
    setTurns([]);
    setScore(null);
    setError(null);
    const es = new EventSource(
      `/api/eval/run?card=${encodeURIComponent(card)}&persona=${encodeURIComponent(persona)}`
    );
    esRef.current = es;
    es.onmessage = (ev) => {
      const evt = JSON.parse(ev.data) as EvalEvent;
      if (evt.type === "turn") setTurns((prev) => [...prev, evt.turn]);
      else if (evt.type === "scored") {
        setScore(evt.score);
        es.close();
        setRunning(false);
        router.refresh(); // 新记录已落历史榜,刷新列表
      } else if (evt.type === "error") {
        setError(evt.message);
        es.close();
        setRunning(false);
      }
    };
    es.onerror = () => {
      es.close();
      setRunning(false);
    };
  };

  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        ▶ 单案 live 运行（看 Agent 实时跑一条，跑完进历史榜）
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={card}
          onChange={(e) => setCard(e.target.value)}
          disabled={running}
        >
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} · {c.title}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          disabled={running}
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-amber-600 px-4 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          onClick={run}
          disabled={running || !card}
        >
          {running ? "运行中…" : "Run"}
        </button>
        {running && (
          <span className="text-xs text-gray-500">正在调用 DeepSeek，逐轮回传…</span>
        )}
      </div>
      {error && (
        <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">出错：{error}</p>
      )}
      {turns.length > 0 && (
        <div className="mt-4">
          <Transcript turns={turns} />
        </div>
      )}
      {score && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="关键信息回收" value={pct(score.critical_info_recovery)} />
          <Stat label="冲突发现" value={pct(score.conflict_detection_rate)} />
          <Stat label="无依据断言" value={pct(score.unsupported_assumption_rate)} hint="越低越好" />
          <Stat label="停止" value={stopText(score.stop_accuracy)} />
        </div>
      )}
    </section>
  );
}
