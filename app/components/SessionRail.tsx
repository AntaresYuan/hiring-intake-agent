"use client";

import type { SessionMeta } from "./sessions";

function fmt(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function SessionRail({
  sessions,
  currentId,
  onNew,
  onSelect,
  onDelete,
}: {
  sessions: SessionMeta[];
  currentId: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col border-r border-gray-200 bg-gray-50">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700"
        >
          ＋ 新建会话
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 && (
          <div className="px-2 py-3 text-xs text-gray-400">还没有会话</div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm ${
              s.id === currentId
                ? "bg-white font-medium text-gray-900 shadow-sm"
                : "text-gray-600 hover:bg-white/70"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{s.title || "新会话"}</span>
            <span className="ml-2 shrink-0 text-[10px] text-gray-400">
              {fmt(s.updatedAt)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              className="ml-1 hidden shrink-0 px-1 text-xs text-gray-300 hover:text-gray-700 group-hover:block"
              title="删除会话"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
