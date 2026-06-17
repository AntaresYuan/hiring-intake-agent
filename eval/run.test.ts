import { describe, it, afterAll, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GOLD_CARDS } from "./cards";
import { DEFAULT_PERSONA_IDS, getPersona } from "./personas";
import { runCase } from "./runner";
import { judgeRun } from "./judge";
import { scoreCase, medianScore } from "./scorer";
import { FAIRNESS_CASES, runFairnessCase, type FairnessResult } from "./fairness";
import { buildScorecard, printScorecard } from "./report";
import { SIM_MODEL, JUDGE_MODEL } from "./llm";
import { saveHistory, makeId } from "./history";
import type { CaseScore, EvalReport, RunResult } from "./types";

// 真实 LLM 测评入口。默认被 npm test 跳过（不打网络）；显式开启才跑：
//   RUN_EVAL=1 LLM_API_KEY=sk-... LLM_MODEL=deepseek-v4-pro \
//   EVAL_SIM_MODEL=deepseek-v4-flash EVAL_JUDGE_MODEL=deepseek-v4-pro \
//   npx vitest run eval/run.test.ts
// 见 eval/README.md。

const RUN = process.env.RUN_EVAL === "1" && !!process.env.LLM_API_KEY;
const REPEATS = Math.max(1, Number(process.env.EVAL_REPEATS ?? 3)); // 每案跑几次取中位
const PERSONAS = (process.env.EVAL_PERSONAS?.split(",").map((s) => s.trim()) ??
  DEFAULT_PERSONA_IDS) as ReturnType<typeof getPersona>["id"][];

describe.runIf(RUN)("Hiring Intake Agent · 真实测评", () => {
  const scores: CaseScore[] = [];
  const runs: RunResult[] = [];
  const fairness: FairnessResult[] = [];

  for (const card of GOLD_CARDS) {
    for (const pid of PERSONAS) {
      it(
        `交互澄清 ${card.id} × ${pid} (×${REPEATS}取中位)`,
        async () => {
          const trials: CaseScore[] = [];
          let repRun: RunResult | null = null;
          for (let k = 0; k < REPEATS; k++) {
            const run = await runCase(card, getPersona(pid));
            const judged = await judgeRun(card, run.final_state);
            trials.push(scoreCase(card, run, judged));
            if (k === 0) repRun = run; // 留第一次的 transcript 给看板钻取
          }
          const med = medianScore(trials);
          scores.push(med);
          if (repRun) runs.push(repRun);
          console.log(
            `  ${card.id}/${pid} (中位/${REPEATS}): 回收=${Math.round(
              med.critical_info_recovery * 100
            )}% 冲突=${Math.round(
              med.conflict_detection_rate * 100
            )}% 停止=${med.stop_accuracy} 轮=${med.rounds}`
          );
          expect(med.rounds).toBeGreaterThan(0);
        },
        320_000 * REPEATS
      );
    }
  }

  for (const fc of FAIRNESS_CASES) {
    it(
      `公平门 ${fc.id}`,
      async () => {
        const r = await runFairnessCase(fc);
        fairness.push(r);
        console.log(`  ${fc.id}: ${r.passed ? "PASS" : "FAIL " + r.violations.join("；")}`);
        expect(r).toBeDefined();
      },
      120_000
    );
  }

  afterAll(() => {
    if (!scores.length && !fairness.length) return;
    const md = buildScorecard(scores, fairness);
    printScorecard(scores, fairness);
    const mdOut = fileURLToPath(new URL("./report.out.md", import.meta.url));
    writeFileSync(mdOut, md, "utf8");

    // JSON 报告：给 /benchmark 看板页读（含 transcript 钻取）
    const report: EvalReport = {
      generated_at: new Date().toISOString(),
      models: {
        agent: process.env.LLM_MODEL ?? "deepseek-chat",
        sim: SIM_MODEL,
        judge: JUDGE_MODEL,
      },
      scores,
      fairness: fairness.map((f) => ({
        case_id: f.case_id,
        label: f.label,
        passed: f.passed,
        violations: f.violations,
        agent_replies: f.agent_replies,
      })),
      runs,
    };
    const jsonOut = fileURLToPath(new URL("./report.out.json", import.meta.url));
    writeFileSync(jsonOut, JSON.stringify(report, null, 2), "utf8");

    // 落一条历史榜记录（看板按分数排名展示）
    saveHistory({
      id: makeId("matrix"),
      kind: "matrix",
      generated_at: report.generated_at,
      models: report.models,
      title: `全量矩阵 · ${scores.length} 案 ×${REPEATS}`,
      headline_score: scores.length
        ? scores.reduce((a, s) => a + s.critical_info_recovery, 0) / scores.length
        : 0,
      gate_pass: report.fairness.every((f) => f.passed),
      scores,
      fairness: report.fairness,
      runs,
    });
    console.log(`\n评分卡已写入 ${mdOut}\nJSON 报告已写入 ${jsonOut}\n历史榜已更新`);
  });
});
