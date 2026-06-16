"use client";

import { useState } from "react";
import type { ChoiceGroup } from "@/lib/schema";

// 把 Agent 本轮可枚举的追问渲染成可点选卡片，减少用人经理打字。
// 选完组装成一条自然语言回答回传，后端历史仍是纯文本。

export default function ChoiceBlock({
  groups,
  disabled,
  onSubmit,
}: {
  groups: ChoiceGroup[];
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [picked, setPicked] = useState<Record<number, Set<string>>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});

  function toggle(gi: number, opt: string, multi: boolean) {
    setPicked((prev) => {
      const cur = new Set(prev[gi] ?? []);
      if (cur.has(opt)) cur.delete(opt);
      else {
        if (!multi) cur.clear();
        cur.add(opt);
      }
      return { ...prev, [gi]: cur };
    });
  }

  function compose(): string {
    const lines: string[] = [];
    groups.forEach((g, gi) => {
      const sels = [...(picked[gi] ?? [])];
      const c = (custom[gi] ?? "").trim();
      if (c) sels.push(c);
      if (sels.length) lines.push(`${g.question} 我的选择：${sels.join("、")}`);
    });
    return lines.join("\n");
  }

  const hasAny = groups.some(
    (_, gi) => (picked[gi]?.size ?? 0) > 0 || (custom[gi] ?? "").trim()
  );

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
      {groups.map((g, gi) => (
        <div key={gi} className="space-y-2">
          <div className="text-xs font-medium text-gray-700">
            {g.question}
            <span className="ml-1 text-gray-400">
              {g.multi ? "（可多选）" : "（单选）"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.options.map((opt) => {
              const on = picked[gi]?.has(opt);
              return (
                <button
                  key={opt}
                  disabled={disabled}
                  onClick={() => toggle(gi, opt, g.multi)}
                  className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                    on
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {opt}
                </button>
              );
            })}
          </div>
          {g.allow_custom && (
            <input
              value={custom[gi] ?? ""}
              disabled={disabled}
              onChange={(e) =>
                setCustom((p) => ({ ...p, [gi]: e.target.value }))
              }
              placeholder="其他（自由填写）…"
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-gray-400"
            />
          )}
        </div>
      ))}
      <button
        disabled={disabled || !hasAny}
        onClick={() => onSubmit(compose())}
        className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40"
      >
        提交选择
      </button>
    </div>
  );
}
