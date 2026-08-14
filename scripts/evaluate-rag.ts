import fs from "node:fs/promises";

type EvalCase = { id: string; query: string; relevantDocumentTitles: string[] };

const apiBase = process.env.EVAL_API_BASE || "http://localhost:3001";
const cases = JSON.parse(await fs.readFile("evals/rag-cases.json", "utf8")) as EvalCase[];
const latencies: number[] = [];
let hits = 0;
let reciprocalRankTotal = 0;

for (const item of cases) {
  const started = performance.now();
  const response = await fetch(`${apiBase}/api/knowledge/search?q=${encodeURIComponent(item.query)}`);
  if (!response.ok) throw new Error(`评测请求失败 (${response.status})，请先启动服务并导入对应评测资料`);
  const data = await response.json() as { results?: Array<{ title: string }> };
  latencies.push(performance.now() - started);
  const rank = (data.results || []).findIndex((result) => item.relevantDocumentTitles.includes(result.title));
  if (rank >= 0 && rank < 5) hits += 1;
  if (rank >= 0) reciprocalRankTotal += 1 / (rank + 1);
}

latencies.sort((a, b) => a - b);
const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] || 0;
console.log(JSON.stringify({
  cases: cases.length,
  recallAt5: hits / cases.length,
  mrr: reciprocalRankTotal / cases.length,
  p95LatencyMs: Number(p95.toFixed(1)),
}, null, 2));
