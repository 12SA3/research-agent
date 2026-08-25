import { describe, expect, it } from "vitest";
import { MemoryBusinessStore } from "../src/server/persistence/memoryBusinessStore.js";
import type { ResearchEvent } from "../src/shared/research.js";

describe("business persistence contract", () => {
  it("持久化会话、消息并支持级联式删除语义", async () => {
    const store = new MemoryBusinessStore();
    await store.upsertChatSession({ id: "session-1", title: "测试会话" });
    await store.upsertChatMessage("session-1", {
      id: "message-1",
      role: "user",
      content: "你好",
      status: "completed",
    });
    expect((await store.listChatSessions())[0]).toMatchObject({
      id: "session-1",
      messages: [{ id: "message-1", content: "你好" }],
    });
    expect(await store.deleteChatSession("session-1")).toBe(true);
    expect(await store.listChatSessions()).toEqual([]);
  });

  it("保存研究事件、引用和最终报告", async () => {
    const store = new MemoryBusinessStore();
    const plan = { id: "plan-1", question: "问题", documentIds: [], steps: [{ id: "s1", title: "步骤", query: "检索" }] };
    await store.createResearchRun({ id: "run-1", question: "问题", plan, documentIds: [] });
    const citation = { id: "chunk-1", documentId: "doc-1", title: "资料", chunkId: "chunk-1", excerpt: "原文", vectorScore: 0.9 };
    const event: ResearchEvent = {
      runId: "run-1",
      sequence: 1,
      timestamp: new Date(0).toISOString(),
      type: "citation.collected",
      payload: { citation },
    };
    await store.appendResearchEvent(event);
    await store.appendResearchEvent(event);
    await store.finishResearchRun("run-1", "completed", {
      report: "报告",
      citations: [citation],
      searchCount: 1,
      invalidCitationIds: [],
    });
    const run = await store.getResearchRun("run-1");
    expect(run).toMatchObject({ status: "completed", report: "报告", citationCount: 1, searchCount: 1 });
    expect(run?.events).toHaveLength(1);
  });
});
