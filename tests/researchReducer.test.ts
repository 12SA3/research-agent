import { describe, expect, it } from "vitest";
import { initialResearchState, researchReducer } from "../src/components/ResearchWorkspace/researchReducer.js";
import type { ResearchEvent } from "../src/shared/research.js";

function event(sequence: number, type: ResearchEvent["type"], payload: Record<string, unknown>): ResearchEvent {
  return { runId: "run-1", sequence, timestamp: new Date(0).toISOString(), type, payload };
}

describe("researchReducer", () => {
  it("按 runId 和 sequence 去重事件", () => {
    let state = researchReducer(initialResearchState, { type: "run.prepare", runId: "run-1" });
    state = researchReducer(state, { type: "event", event: event(1, "text.delta", { delta: "第一段" }) });
    state = researchReducer(state, { type: "event", event: event(1, "text.delta", { delta: "重复" }) });
    expect(state.report).toBe("第一段");
  });

  it("对同一个 Citation 只收集一次", () => {
    let state = researchReducer(initialResearchState, { type: "run.prepare", runId: "run-1" });
    const citation = { id: "c1", documentId: "d1", title: "文档", chunkId: "c1", excerpt: "证据", vectorScore: 0.8 };
    state = researchReducer(state, { type: "event", event: event(1, "citation.collected", { citation }) });
    state = researchReducer(state, { type: "event", event: event(2, "citation.collected", { citation }) });
    expect(state.citations).toHaveLength(1);
  });

  it("可以从持久化的运行记录恢复报告、引用和时间线", () => {
    const citation = { id: "c1", documentId: "d1", title: "文档", chunkId: "c1", excerpt: "证据", vectorScore: 0.8 };
    const state = researchReducer(initialResearchState, {
      type: "run.hydrate",
      run: {
        id: "run-1",
        status: "completed",
        plan: { id: "plan-1", question: "问题", documentIds: ["d1"], steps: [{ id: "s1", title: "步骤", query: "检索" }] },
        report: "持久化报告",
        citations: [citation],
        events: [
          event(1, "run.started", {}),
          event(2, "step.started", { step: { id: "s1", title: "步骤", query: "检索" } }),
          event(3, "step.completed", { stepId: "s1", citationCount: 1 }),
          event(4, "run.completed", {}),
        ],
      },
    });
    expect(state.status).toBe("completed");
    expect(state.report).toBe("持久化报告");
    expect(state.citations).toEqual([citation]);
    expect(state.timeline[0]).toMatchObject({ id: "step:s1", status: "completed" });
  });
});
