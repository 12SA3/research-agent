import { assertConfigured, config } from "../config.js";
import type { ChatCompletion, ChatMessage, ChatProvider, ToolCall, ToolDefinition } from "./types.js";

type DeepSeekChunk = {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
  error?: { message?: string };
};

export class DeepSeekProvider implements ChatProvider {
  private async request(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    assertConfigured("DEEPSEEK_API_KEY", config.deepseek.apiKey);
    const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.deepseek.apiKey}`,
      },
      body: JSON.stringify({ model: config.deepseek.model, ...body }),
      signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`DeepSeek 请求失败 (${response.status}): ${detail.slice(0, 300)}`);
    }
    return response;
  }

  async createStructuredOutput<T>(messages: ChatMessage[]): Promise<T> {
    const response = await this.request({ messages, response_format: { type: "json_object" }, stream: false });
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 未返回结构化内容");
    return JSON.parse(content) as T;
  }

  async complete(messages: ChatMessage[], tools: ToolDefinition[] = [], signal?: AbortSignal): Promise<ChatCompletion> {
    const response = await this.request({
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : undefined,
      stream: false,
      temperature: 0.2,
    }, signal);
    const json = await response.json() as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
    };
    const choice = json.choices?.[0];
    if (!choice?.message) throw new Error("DeepSeek 未返回消息");
    return {
      content: choice.message.content || "",
      toolCalls: choice.message.tool_calls || [],
      finishReason: choice.finish_reason,
    };
  }

  async *streamText(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string> {
    const response = await this.request({ messages, stream: true, temperature: 0.2 }, signal);
    if (!response.body) throw new Error("DeepSeek 流式响应为空");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const chunk = JSON.parse(data) as DeepSeekChunk;
        if (chunk.error) throw new Error(chunk.error.message || "DeepSeek 流式请求失败");
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      }
    }
  }
}
