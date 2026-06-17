import { GOLD_CARDS } from "@/eval/cards";
import { PERSONAS } from "@/eval/personas";
import { loadHistory } from "@/eval/history";
import AccessGate from "../components/AccessGate";
import BenchmarkView from "./BenchmarkView";

// 看板:读历史榜(每次跑完——矩阵或页面单案——都会落一条),按分数排名展示。
export const dynamic = "force-dynamic";
export const metadata = { title: "Benchmark · Hiring Intake Agent" };

export default async function BenchmarkPage() {
  return (
    <AccessGate>
    <BenchmarkView
      history={loadHistory()}
      cards={GOLD_CARDS.map((c) => ({ id: c.id, title: c.title }))}
      personas={PERSONAS.map((p) => ({ id: p.id, label: p.label }))}
    />
    </AccessGate>
  );
}
