export type ParsedChatStream = {
  rest: string;
  deltas: string[];
  done: boolean;
  error?: string;
};

export function parseChatSseBuffer(buffer: string): ParsedChatStream {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() || "";
  const deltas: string[] = [];
  let done = false;
  let error: string | undefined;

  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    if (data === "[DONE]") {
      done = true;
      continue;
    }

    const payload = JSON.parse(data) as {
      error?: string;
      choices?: Array<{ delta?: { content?: string } }>;
    };
    if (payload.error) {
      error = payload.error;
      continue;
    }
    const delta = payload.choices?.[0]?.delta?.content;
    if (delta) deltas.push(delta);
  }

  return { rest, deltas, done, error };
}
