import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaBusinessStore } from "../src/server/persistence/prismaBusinessStore.js";

const databaseUrl = process.env.DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;

describeMysql("MySQL Prisma persistence", () => {
  const store = new PrismaBusinessStore(databaseUrl || "mysql://unused:unused@localhost:3306/unused");
  const sessionId = randomUUID();
  const runId = randomUUID();

  beforeAll(() => store.init());
  afterAll(async () => {
    await store.deleteChatSession(sessionId);
    await store.deleteResearchRun(runId);
    await store.disconnect();
  });

  it("真实写入并读取 Chat 与 Research 数据", async () => {
    await store.upsertChatSession({ id: sessionId, title: "MySQL 集成测试" });
    await store.upsertChatMessage(sessionId, {
      id: randomUUID(), role: "user", content: "测试消息", status: "completed",
    });
    expect((await store.listChatSessions()).find((session) => session.id === sessionId)?.messages[0].content).toBe("测试消息");

    const plan = { id: randomUUID(), question: "测试问题", documentIds: [], steps: [{ id: "step-1", title: "测试", query: "测试查询" }] };
    await store.createResearchRun({ id: runId, question: plan.question, plan, documentIds: [] });
    await store.appendResearchEvent({
      runId, sequence: 1, timestamp: new Date().toISOString(), type: "run.started", payload: { question: plan.question },
    });
    await store.finishResearchRun(runId, "completed", { report: "测试报告", citations: [], searchCount: 0, invalidCitationIds: [] });
    expect(await store.getResearchRun(runId)).toMatchObject({ status: "completed", report: "测试报告" });
  });
});
