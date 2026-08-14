export type TextPage = { page: number; text: string };

export type TextChunk = {
  page: number;
  index: number;
  content: string;
};

export function chunkPages(pages: TextPage[], targetSize = 750, overlap = 100): TextChunk[] {
  const chunks: TextChunk[] = [];
  let index = 0;

  for (const page of pages) {
    const normalized = page.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
    if (!normalized) continue;

    let cursor = 0;
    while (cursor < normalized.length) {
      let end = Math.min(cursor + targetSize, normalized.length);
      if (end < normalized.length) {
        const boundary = Math.max(
          normalized.lastIndexOf("。", end),
          normalized.lastIndexOf("！", end),
          normalized.lastIndexOf("？", end),
          normalized.lastIndexOf("\n", end),
          normalized.lastIndexOf(". ", end),
        );
        if (boundary > cursor + Math.floor(targetSize * 0.6)) end = boundary + 1;
      }

      const content = normalized.slice(cursor, end).trim();
      if (content) chunks.push({ page: page.page, index: index++, content });
      if (end >= normalized.length) break;
      cursor = Math.max(end - overlap, cursor + 1);
    }
  }

  return chunks;
}
