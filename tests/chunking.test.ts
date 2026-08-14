import { describe, expect, it } from "vitest";
import { chunkPages } from "../src/server/documents/chunking.js";

describe("chunkPages", () => {
  it("保留页码并生成稳定递增序号", () => {
    const chunks = chunkPages([
      { page: 1, text: "第一段。".repeat(180) },
      { page: 2, text: "第二页内容。".repeat(120) },
    ], 300, 40);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].page).toBe(1);
    expect(chunks.at(-1)?.page).toBe(2);
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, index) => index));
  });

  it("忽略空页", () => {
    expect(chunkPages([{ page: 1, text: "  \n " }])).toEqual([]);
  });
});
