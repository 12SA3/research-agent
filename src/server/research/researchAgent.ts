import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { Citation, ResearchEvent, ResearchPlan } from "../../shared/research.js";
import type { DocumentStore } from "../documents/documentStore.js";
import type { ChatMessage, ChatProvider, ToolDefinition } from "../providers/types.js";
import { evaluationSchema, researchPlanSchema, searchToolArgumentsSchema } from "./schemas.js";

const SEARCH_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "search_knowledge_base",
    description: "在用户选择的知识库文档中检索与研究问题相关的原始证据。每次使用一个清晰、具体的自然语言查询。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "要检索的具体问题或关键词" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

type EventWriter = (type: ResearchEvent["type"], payload: Record<string, unknown>) => void;

export class ResearchAgent {
  constructor(private chat: ChatProvider, private documents: DocumentStore) {}

  async createPlan(question: string, documentIds: string[]): Promise<ResearchPlan> {
    const raw = await this.chat.createStructuredOutput<unknown>([
      {
        role: "system",
        content: [
          "你是知识研究任务规划器。将用户问题拆成 2 到 4 个互补、可检索的步骤。",
          "只输出 JSON：{\"steps\":[{\"id\":\"step-1\",\"title\":\"...\",\"query\":\"...\"}]}。",
          "步骤必须直接服务于最终答案，不要包含泛泛的‘总结’步骤。",
        ].join("\n"),
      },
      { role: "user", content: `研究问题：${question}\n已选择文档数量：${documentIds.length}` },
    ]);
    const parsed = researchPlanSchema.parse(raw);
    return { id: randomUUID(), question, documentIds, steps: parsed.steps };
  }

  async run(plan: ResearchPlan, response: Response, signal: AbortSignal): Promise<void> {
    const runId = response.locals.runId as string;
    let sequence = 0;
    const write: EventWriter = (type, payload) => {
      if (response.writableEnded) return;
      const event: ResearchEvent = { runId, sequence: ++sequence, timestamp: new Date().toISOString(), type, payload };
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const citations = new Map<string, Citation>();
    const agentTranscript: ChatMessage[] = [];
    let searchCount = 0;
    const search = async (query: string, stepId: string): Promise<Citation[]> => {
      if (searchCount >= 6) throw new Error("已达到单次研究最多 6 次检索的限制");
      searchCount += 1;
      write("tool.started", { stepId, tool: SEARCH_TOOL.function.name, query });
      const results = await this.documents.search(query, plan.documentIds, 5);
      for (const citation of results) {
        citations.set(citation.id, citation);
        write("citation.collected", { stepId, citation });
      }
      write("tool.completed", { stepId, query, resultCount: results.length, citationIds: results.map((item) => item.id) });
      return results;
    };

    write("run.started", { question: plan.question });
    write("plan.confirmed", { plan });

    for (const step of plan.steps) {
      if (signal.aborted) throw signal.reason || new Error("任务已取消");
      write("step.started", { step });

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: "你是研究执行器。当前必须调用 search_knowledge_base 获取证据，不得凭记忆回答。一次只调用一个工具。",
        },
        { role: "user", content: `总问题：${plan.question}\n当前步骤：${step.title}\n建议检索：${step.query}` },
      ];
      const completion = await this.chat.complete(messages, [SEARCH_TOOL], signal);
      const call = completion.toolCalls.find((item) => item.function.name === SEARCH_TOOL.function.name);
      let query = step.query;
      if (call) {
        try {
          query = searchToolArgumentsSchema.parse(JSON.parse(call.function.arguments)).query;
        } catch {
          const repair = await this.chat.createStructuredOutput<{ query: string }>([
            { role: "system", content: "将输入修复为 JSON：{\"query\":\"有效检索问题\"}，只输出 JSON。" },
            { role: "user", content: call.function.arguments },
          ]);
          query = searchToolArgumentsSchema.parse(repair).query;
        }
      }
      const results = await search(query, step.id);
      const effectiveCall = call || {
        id: `fallback-${step.id}`,
        type: "function" as const,
        function: { name: SEARCH_TOOL.function.name, arguments: JSON.stringify({ query }) },
      };
      agentTranscript.push(
        { role: "assistant", content: completion.content || null, tool_calls: [effectiveCall] },
        { role: "tool", tool_call_id: effectiveCall.id, content: JSON.stringify({ query, results }) },
      );
      write("step.completed", { stepId: step.id, citationCount: results.length });
    }

    if (!signal.aborted && searchCount < 6) {
      const rawEvaluation = await this.chat.createStructuredOutput<unknown>([
        {
          role: "system",
          content: "判断证据能否回答问题。只输出 JSON：{\"sufficient\":true|false,\"additionalQueries\":[\"...\"]}。补充查询最多 2 个。",
        },
        { role: "user", content: `研究问题：${plan.question}` },
        ...agentTranscript,
        { role: "user", content: "请根据以上工具结果判断证据是否充分，并按要求输出 JSON。" },
      ]);
      const evaluation = evaluationSchema.parse(rawEvaluation);
      if (!evaluation.sufficient) {
        for (const query of evaluation.additionalQueries.slice(0, Math.max(0, 6 - searchCount))) {
          await search(query, "evaluator");
        }
      }
    }

    if (signal.aborted) throw signal.reason || new Error("任务已取消");
    const sourceList = [...citations.values()]
      .map((item) => `[${item.id}] 《${item.title}》${item.page ? `第 ${item.page} 页` : ""}\n${item.excerpt}`)
      .join("\n\n");
    const synthesisMessages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "你是严谨的知识研究助手。根据给定证据生成结构化 Markdown 报告。",
          "每个事实后必须引用真实的证据 ID，格式为 [chunk-id]。不得创造不存在的引用。",
          "证据不足时明确写出限制，不要编造。先给结论，再给分析和来源。",
        ].join("\n"),
      },
      { role: "user", content: `问题：${plan.question}\n\n可用证据：\n${sourceList || "没有检索到证据"}` },
    ];
    let generatedReport = "";
    for await (const delta of this.chat.streamText(synthesisMessages, signal)) {
      generatedReport += delta;
      write("text.delta", { delta });
    }
    const mentionedIds = [...generatedReport.matchAll(/\[([^\]\n]+)\]/g)].map((match) => match[1]);
    const invalidCitationIds = [...new Set(mentionedIds.filter((id) => id.includes(":") && !citations.has(id)))];
    if (invalidCitationIds.length) {
      write("text.delta", {
        delta: `\n\n> 引用校验提示：模型生成了 ${invalidCitationIds.length} 个无法映射到原文的引用，已标记为无效：${invalidCitationIds.map((id) => `\`${id}\``).join("、")}。`,
      });
    }
    write("run.completed", { citationCount: citations.size, searchCount, invalidCitationIds });
  }
}
