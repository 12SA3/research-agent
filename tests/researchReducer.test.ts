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
});
