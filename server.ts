import express, { type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { config } from "./src/server/config.js";
import { DocumentStore } from "./src/server/documents/documentStore.js";
import { DeepSeekProvider } from "./src/server/providers/deepseek.js";
import type { ChatMessage } from "./src/server/providers/types.js";
import { XunfeiRagProvider } from "./src/server/providers/xunfei.js";
import { ResearchAgent } from "./src/server/research/researchAgent.js";
import { createPlanRequestSchema, runResearchRequestSchema } from "./src/server/research/schemas.js";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 10 * 1024 * 1024 },
});
const deepseek = new DeepSeekProvider();
const xunfei = new XunfeiRagProvider();
const documents = new DocumentStore(xunfei, xunfei);
const researchAgent = new ResearchAgent(deepseek, documents);
const activeRuns = new Map<string, AbortController>();

app.use(express.json({ limit: "2mb" }));
app.use((_, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("*path", (_, response) => response.sendStatus(204));

app.get("/health", (_, response) => {
  response.json({
    status: "ok",
    service: "knowledge-research-agent",
    providers: {
      chat: Boolean(config.deepseek.apiKey),
      embedding: Boolean(config.xunfei.apiKey && config.xunfei.embeddingModel),
      rerank: Boolean(config.xunfei.apiKey && config.xunfei.rerankModel),
    },
  });
});

app.get("/api/documents", (_, response) => response.json({ documents: documents.list() }));

app.post("/api/documents", upload.array("files", 10), async (request, response, next) => {
  try {
    const files = request.files as Express.Multer.File[] | undefined;
    if (!files?.length) return response.status(400).json({ error: "请选择至少一个文件" });
    const created = [];
    for (const file of files) created.push(await documents.add(file));
    response.status(201).json({ documents: created });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/documents/:id", async (request, response, next) => {
  try {
    const removed = await documents.remove(request.params.id);
    if (!removed) return response.status(404).json({ error: "文档不存在" });
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/knowledge/search", async (request, response, next) => {
  try {
    const query = String(request.query.q || "").trim();
    if (!query) return response.status(400).json({ error: "查询不能为空" });
    const results = await documents.search(query, [], 5);
    response.json({ query, results });
  } catch (error) {
    next(error);
  }
});

app.post("/api/research/plans", async (request, response, next) => {
  try {
    const input = createPlanRequestSchema.parse(request.body);
    const plan = await researchAgent.createPlan(input.question, input.documentIds);
    response.json({ plan });
  } catch (error) {
    next(error);
  }
});

app.post("/api/research/runs", async (request, response) => {
  const runId = typeof request.body?.runId === "string" ? request.body.runId : randomUUID();
  response.locals.runId = runId;
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("研究任务超过 90 秒")), 90_000);
  activeRuns.set(runId, controller);
  request.on("aborted", () => controller.abort(new Error("客户端已断开")));
  response.on("close", () => {
    if (!response.writableEnded) controller.abort(new Error("客户端已断开"));
  });

  try {
    const input = runResearchRequestSchema.parse({ ...request.body, runId });
    await researchAgent.run(input.plan, response, controller.signal);
  } catch (error) {
    const cancelled = controller.signal.aborted;
    const event = {
      runId,
      sequence: Number.MAX_SAFE_INTEGER,
      timestamp: new Date().toISOString(),
      type: cancelled ? "run.cancelled" : "run.failed",
      payload: { message: error instanceof Error ? error.message : "研究任务失败" },
    };
    if (!response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`);
  } finally {
    clearTimeout(timeout);
    activeRuns.delete(runId);
    if (!response.writableEnded) response.end();
  }
});

app.post("/api/research/runs/:runId/cancel", (request, response) => {
  const controller = activeRuns.get(request.params.runId);
  if (!controller) return response.status(404).json({ error: "任务不存在或已结束" });
  controller.abort(new Error("用户已中止任务"));
  response.json({ success: true });
});

app.post("/api/chat", async (request: Request, response: Response, next) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("对话生成超过 90 秒")), 90_000);
  request.on("aborted", () => controller.abort(new Error("客户端已断开")));
  response.on("close", () => {
    if (!response.writableEnded) controller.abort(new Error("客户端已断开"));
  });

  try {
    const allowedRoles = new Set<ChatMessage["role"]>(["system", "user", "assistant"]);
    const rawMessages: unknown[] = Array.isArray(request.body?.messages) ? request.body.messages : [];
    const messages: ChatMessage[] = rawMessages
      .filter((message: unknown): message is { role: ChatMessage["role"]; content: string } => {
        if (!message || typeof message !== "object") return false;
        const candidate = message as { role?: unknown; content?: unknown };
        return typeof candidate.role === "string"
          && allowedRoles.has(candidate.role as ChatMessage["role"])
          && typeof candidate.content === "string"
          && candidate.content.trim().length > 0;
      })
      .slice(-31)
      .map(({ role, content }) => ({ role, content: content.slice(0, 20_000) }));
    if (!messages.some((message) => message.role === "user")) {
      return response.status(400).json({ error: "至少需要一条用户消息" });
    }

    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("X-Accel-Buffering", "no");
    for await (const delta of deepseek.streamText(messages, controller.signal)) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
    }
    response.write("data: [DONE]\n\n");
    response.end();
  } catch (error) {
    if (controller.signal.aborted) {
      if (!response.writableEnded) response.end();
    } else if (response.headersSent) {
      const message = error instanceof Error ? error.message : "对话生成失败";
      response.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      response.end();
    } else {
      next(error);
    }
  } finally {
    clearTimeout(timeout);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
  void _next;
  console.error(error);
  if (response.headersSent) {
    if (!response.writableEnded) response.end();
    return;
  }
  const message = error instanceof Error ? error.message : "服务器内部错误";
  response.status(400).json({ error: message });
});

await documents.init();
app.listen(config.port, () => {
  console.log(`Knowledge Research Agent running on http://localhost:${config.port}`);
  console.log(`[Config] DeepSeek=${config.deepseek.model}, Embedding=${config.xunfei.embeddingModel || "未配置"}, Rerank=${config.xunfei.rerankModel || "未配置"}`);
});
