export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
};

export type ChatCompletion = {
  content: string;
  toolCalls: ToolCall[];
  finishReason?: string;
};

export interface ChatProvider {
  createStructuredOutput<T>(messages: ChatMessage[]): Promise<T>;
  complete(messages: ChatMessage[], tools?: ToolDefinition[], signal?: AbortSignal): Promise<ChatCompletion>;
  streamText(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
}

export interface EmbeddingProvider {
  readonly model: string;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export type RerankResult = { index: number; score: number };

export interface RerankProvider {
  rerank(query: string, documents: string[]): Promise<RerankResult[]>;
}
