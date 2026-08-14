import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekProvider } from "../src/server/providers/deepseek.js";
import { XunfeiRagProvider } from "../src/server/providers/xunfei.js";
import { config } from "../src/server/config.js";

afterEach(() => vi.unstubAllGlobals());

describe("model providers", () => {
  it("DeepSeek 将原生 tool_calls 标准化返回", async () => {
    config.deepseek.apiKey = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: "tool_calls",
        message: {
          content: null,
          tool_calls: [{ id: "call-1", type: "function", function: { name: "search_knowledge_base", arguments: "{\"query\":\"测试\"}" } }],
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await new DeepSeekProvider().complete([{ role: "user", content: "研究" }], [{
      type: "function",
      function: { name: "search_knowledge_base", description: "搜索", parameters: { type: "object" } },
    }]);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls[0].function.name).toBe("search_knowledge_base");
  });

  it("讯飞 Embedding 按 index 恢复批量顺序", async () => {
    config.xunfei.apiKey = "test-key";
    config.xunfei.embeddingModel = "embedding-test";
    const provider = new XunfeiRagProvider();
    Object.defineProperty(provider, "model", { value: "embedding-test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(provider.embedDocuments(["a", "b"])).resolves.toEqual([[1, 0], [0, 1]]);
  });
});
