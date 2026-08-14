import { describe, expect, it } from "vitest";
import { parseChatSseBuffer } from "../src/components/ChatWorkspace/chatStream.js";

describe("chat SSE parser", () => {
  it("保留不完整事件并按顺序解析增量文本", () => {
    const first = parseChatSseBuffer('data: {"choices":[{"delta":{"content":"你');
    expect(first.deltas).toEqual([]);
    expect(first.rest).toContain("你");

    const second = parseChatSseBuffer(`${first.rest}好"}}]}\n\ndata: {"choices":[{"delta":{"content":"！"}}]}\n\n`);
    expect(second.deltas).toEqual(["你好", "！"]);
    expect(second.rest).toBe("");
  });

  it("识别完成和错误事件", () => {
    const completed = parseChatSseBuffer("data: [DONE]\n\n");
    expect(completed.done).toBe(true);

    const failed = parseChatSseBuffer('data: {"error":"模型不可用"}\n\n');
    expect(failed.error).toBe("模型不可用");
  });
});
