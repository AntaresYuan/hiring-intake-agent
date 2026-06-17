import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseScore, RunResult, TurnRecord } from "./types";
import type { HiringState } from "../lib/schema";

// 跑测评的历史榜:每次跑完(矩阵 or 页面单案)都落一条,看板按分数从高到低展示。

export interface HistoryEntry {
  id: string;
  kind: "matrix" | "single";
  generated_at: string;
  models: { agent: string; sim: string; judge: string };
  title: string;
  headline_score: number; // 0-1，用于排名(矩阵=关键信息回收均值;单案=该案回收)
  gate_pass: boolean | null; // 公平门(仅矩阵有);单案为 null
  // —— 矩阵 payload ——
  scores?: CaseScore[];
  fairness?: {
    case_id: string;
    label: string;
    passed: boolean;
    violations: string[];
    agent_replies: string[];
  }[];
  runs?: RunResult[];
  // —— 单案 payload ——
  single?: { score: CaseScore; transcript: TurnRecord[]; final_state: HiringState };
}

const DIR = join(process.cwd(), "eval", "history");

export function makeId(kind: HistoryEntry["kind"]): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${ts}-${kind}-${Math.random().toString(36).slice(2, 6)}`;
}

export function saveHistory(entry: HistoryEntry): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${entry.id}.json`), JSON.stringify(entry), "utf8");
}

/** 读全部历史,按 headline 分数从高到低排序("挑最高的几次显示") */
export function loadHistory(): HistoryEntry[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: HistoryEntry[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(readFileSync(join(DIR, f), "utf8")) as HistoryEntry);
    } catch {
      /* 跳过坏文件 */
    }
  }
  return out.sort((a, b) => b.headline_score - a.headline_score);
}
