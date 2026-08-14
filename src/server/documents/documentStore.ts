import { connect, makeArrowTable, type Connection, type Table } from "@lancedb/lancedb";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Citation, DocumentSummary } from "../../shared/research.js";
import type { EmbeddingProvider, RerankProvider } from "../providers/types.js";
import { chunkPages } from "./chunking.js";
import { parseDocument } from "./parser.js";

type Manifest = { version: 1; documents: DocumentSummary[] };
type ChunkRow = {
  document_id: string;
  title: string;
  document_type: string;
  page: number;
  chunk_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  embedding_model: string;
  embedding_dimension: number;
  index_version: number;
  vector: number[];
};

const DATA_DIR = path.resolve("data/research-v1");
const MANIFEST_PATH = path.join(DATA_DIR, "documents.json");
const TABLE_NAME = "research_chunks_v1";

export class DocumentStore {
  private db: Connection | null = null;
  private table: Table | null = null;
  private manifest: Manifest = { version: 1, documents: [] };

  constructor(private embedding: EmbeddingProvider, private reranker: RerankProvider) {}

  async init(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    this.db = await connect(DATA_DIR);
    try {
      this.table = await this.db.openTable(TABLE_NAME);
    } catch {
      this.table = null;
    }
    try {
      this.manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8")) as Manifest;
    } catch {
      await this.persistManifest();
    }
  }

  list(): DocumentSummary[] {
    return [...this.manifest.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async add(file: Express.Multer.File): Promise<DocumentSummary> {
    if (!this.db) throw new Error("文档库尚未初始化");
    const parsed = await parseDocument(file.originalname, file.mimetype, file.buffer);
    const chunks = chunkPages(parsed.pages);
    if (!chunks.length) throw new Error(`${file.originalname} 未提取到可索引文本`);

    const documentId = randomUUID();
    const vectors = await this.embedding.embedDocuments(chunks.map((chunk) => chunk.content));
    if (!vectors[0]?.length) throw new Error("Embedding 返回空向量");
    const dimension = vectors[0].length;
    if (vectors.some((vector) => vector.length !== dimension)) throw new Error("Embedding 向量维度不一致");

    const rows: ChunkRow[] = chunks.map((chunk, index) => ({
      document_id: documentId,
      title: file.originalname,
      document_type: parsed.type,
      page: chunk.page,
      chunk_id: `${documentId}:${chunk.index}`,
      chunk_index: chunk.index,
      content: chunk.content,
      content_hash: createHash("sha256").update(chunk.content).digest("hex"),
      embedding_model: this.embedding.model,
      embedding_dimension: dimension,
      index_version: 1,
      vector: vectors[index],
    }));

    if (!this.table) this.table = await this.db.createTable(TABLE_NAME, makeArrowTable(rows));
    else await this.table.add(makeArrowTable(rows));

    const summary: DocumentSummary = {
      id: documentId,
      title: file.originalname,
      type: parsed.type,
      pages: parsed.pages.length,
      chunksCount: rows.length,
      status: "ready",
      createdAt: new Date().toISOString(),
      embeddingModel: this.embedding.model,
    };
    this.manifest.documents.push(summary);
    await this.persistManifest();
    return summary;
  }

  async remove(documentId: string): Promise<boolean> {
    const exists = this.manifest.documents.some((document) => document.id === documentId);
    if (!exists) return false;
    if (this.table) await this.table.delete(`document_id = '${documentId.replace(/'/g, "''")}'`);
    this.manifest.documents = this.manifest.documents.filter((document) => document.id !== documentId);
    await this.persistManifest();
    return true;
  }

  async search(query: string, documentIds: string[], topK = 5): Promise<Citation[]> {
    if (!this.table) return [];
    const vector = await this.embedding.embedQuery(query);
    let queryBuilder = this.table.search(vector);
    if (documentIds.length) {
      const predicate = documentIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
      queryBuilder = queryBuilder.where(`document_id IN (${predicate})`);
    }
    const raw = await queryBuilder.limit(20).toArray() as unknown as Array<ChunkRow & { _distance?: number }>;
    const candidates = raw
      .slice(0, 20)
      .map((row) => ({ ...row, vectorScore: Math.max(0, 1 - (row._distance || 0) / 2) }));
    if (!candidates.length) return [];

    let ranked = candidates.map((candidate, index) => ({ candidate, index, rerankScore: undefined as number | undefined }));
    try {
      const reranked = await this.reranker.rerank(query, candidates.map((candidate) => candidate.content));
      if (reranked.length) {
        ranked = reranked
          .filter((item) => candidates[item.index])
          .map((item) => ({ candidate: candidates[item.index], index: item.index, rerankScore: item.score }));
      }
    } catch (error) {
      console.warn("[RAG] Rerank 失败，降级为向量召回:", error instanceof Error ? error.message : error);
    }

    return ranked.slice(0, topK).map(({ candidate, rerankScore }) => ({
      id: candidate.chunk_id,
      documentId: candidate.document_id,
      title: candidate.title,
      page: candidate.page,
      chunkId: candidate.chunk_id,
      excerpt: candidate.content,
      vectorScore: candidate.vectorScore,
      rerankScore,
    }));
  }

  private persistManifest(): Promise<void> {
    return fs.writeFile(MANIFEST_PATH, JSON.stringify(this.manifest, null, 2), "utf8");
  }
}
