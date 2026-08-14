import { assertConfigured, config } from "../config.js";
import type { EmbeddingProvider, RerankProvider, RerankResult } from "./types.js";

export class XunfeiRagProvider implements EmbeddingProvider, RerankProvider {
  readonly model = config.xunfei.embeddingModel;

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    assertConfigured("XUNFEI_API_KEY", config.xunfei.apiKey);
    const response = await fetch(`${config.xunfei.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.xunfei.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`讯飞 ${path} 请求失败 (${response.status}): ${detail.slice(0, 300)}`);
    }
    return response.json();
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    assertConfigured("XUNFEI_EMBEDDING_MODEL", config.xunfei.embeddingModel);
    if (!texts.length) return [];
    const output: number[][] = [];
    const batchSize = 16;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const json = await this.post("/embeddings", {
        model: config.xunfei.embeddingModel,
        input: batch,
        encoding_format: "float",
      }) as { data?: Array<{ index: number; embedding: number[] }> };
      const ordered = [...(json.data || [])].sort((a, b) => a.index - b.index);
      if (ordered.length !== batch.length) throw new Error("讯飞 Embedding 返回数量不匹配");
      output.push(...ordered.map((item) => item.embedding));
    }
    return output;
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embedDocuments([text]).then((vectors) => vectors[0]);
  }

  async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
    assertConfigured("XUNFEI_RERANK_MODEL", config.xunfei.rerankModel);
    const json = await this.post("/rerank", {
      model: config.xunfei.rerankModel,
      query,
      documents,
      top_n: Math.min(5, documents.length),
      return_documents: false,
    }) as { results?: Array<{ index: number; relevance_score?: number; score?: number }> };
    return (json.results || []).map((item) => ({
      index: item.index,
      score: item.relevance_score ?? item.score ?? 0,
    }));
  }
}
