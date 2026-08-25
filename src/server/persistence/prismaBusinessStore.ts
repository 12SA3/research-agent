import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { Citation, DocumentSummary, ResearchEvent, ResearchPlan } from "../../shared/research.js";
import type {
  BusinessStore,
  ChatMessageRecord,
  ChatSessionRecord,
  ResearchRunRecord,
  ResearchRunResult,
  ResearchRunStatus,
  ResearchRunSummary,
} from "./types.js";

const LOCAL_USER_ID = "local-user";

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function iso(value: Date): string {
  return value.toISOString();
}

function asRunStatus(value: string): ResearchRunStatus {
  return ["completed", "failed", "cancelled"].includes(value) ? value as ResearchRunStatus : "running";
}

function asMessageRole(value: string): "user" | "assistant" {
  return value === "user" ? "user" : "assistant";
}

function asMessageStatus(value: string): ChatMessageRecord["status"] {
  return ["completed", "generating", "aborted", "failed"].includes(value)
    ? value as ChatMessageRecord["status"]
    : "completed";
}

export class PrismaBusinessStore implements BusinessStore {
  readonly provider = "mysql" as const;
  readonly persistent = true;
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    const url = new URL(databaseUrl);
    if (url.protocol !== "mysql:") throw new Error("DATABASE_URL 必须使用 mysql:// 协议");
    const adapter = new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      connectionLimit: 8,
    });
    this.prisma = new PrismaClient({ adapter });
  }

  async init(): Promise<void> {
    await this.prisma.$connect();
    await this.prisma.user.upsert({
      where: { id: LOCAL_USER_ID },
      create: { id: LOCAL_USER_ID, displayName: "本地用户" },
      update: {},
    });
  }

  disconnect(): Promise<void> {
    return this.prisma.$disconnect();
  }

  async listChatSessions(): Promise<ChatSessionRecord[]> {
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId: LOCAL_USER_ID },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: iso(session.createdAt),
      updatedAt: iso(session.updatedAt),
      messages: session.messages.map((message) => ({
        id: message.id,
        role: asMessageRole(message.role),
        content: message.content,
        status: asMessageStatus(message.status),
        createdAt: iso(message.createdAt),
        updatedAt: iso(message.updatedAt),
      })),
    }));
  }

  async upsertChatSession(input: { id: string; title: string; createdAt?: string }): Promise<void> {
    await this.prisma.chatSession.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        userId: LOCAL_USER_ID,
        title: input.title,
        createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
      },
      update: { title: input.title },
    });
  }

  async upsertChatMessage(sessionId: string, message: Omit<ChatMessageRecord, "createdAt" | "updatedAt">): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.chatMessage.upsert({
        where: { id: message.id },
        create: { ...message, sessionId },
        update: { content: message.content, status: message.status },
      }),
      this.prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } }),
    ]);
  }

  async deleteChatSession(sessionId: string): Promise<boolean> {
    const result = await this.prisma.chatSession.deleteMany({ where: { id: sessionId, userId: LOCAL_USER_ID } });
    return result.count > 0;
  }

  async syncDocuments(documents: DocumentSummary[]): Promise<void> {
    for (const document of documents) await this.upsertDocument(document);
  }

  async upsertDocument(document: DocumentSummary): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.document.upsert({
        where: { id: document.id },
        create: {
          id: document.id,
          userId: LOCAL_USER_ID,
          title: document.title,
          type: document.type,
          pages: document.pages,
          chunksCount: document.chunksCount,
          status: document.status,
          embeddingModel: document.embeddingModel,
          createdAt: new Date(document.createdAt),
        },
        update: {
          title: document.title,
          type: document.type,
          pages: document.pages,
          chunksCount: document.chunksCount,
          status: document.status,
          embeddingModel: document.embeddingModel,
        },
      }),
      this.prisma.researchCitation.updateMany({
        where: { documentId: document.id },
        data: { title: document.title },
      }),
    ]);
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.prisma.document.deleteMany({ where: { id: documentId, userId: LOCAL_USER_ID } });
  }

  async createResearchRun(input: { id: string; question: string; plan: ResearchPlan; documentIds: string[] }): Promise<void> {
    await this.prisma.researchRun.create({
      data: {
        id: input.id,
        userId: LOCAL_USER_ID,
        question: input.question,
        plan: json(input.plan),
        documentIds: json(input.documentIds),
        status: "running",
        documents: input.documentIds.length
          ? { create: input.documentIds.map((documentId) => ({ document: { connect: { id: documentId } } })) }
          : undefined,
      },
    });
  }

  async appendResearchEvent(event: ResearchEvent): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.researchEvent.upsert({
        where: { runId_sequence: { runId: event.runId, sequence: event.sequence } },
        create: {
          runId: event.runId,
          sequence: event.sequence,
          type: event.type,
          payload: json(event.payload),
          timestamp: new Date(event.timestamp),
        },
        update: {},
      }),
    ];
    if (event.type === "citation.collected") {
      const citation = event.payload.citation as Citation | undefined;
      if (citation) {
        operations.push(this.prisma.researchCitation.upsert({
          where: { runId_citationId: { runId: event.runId, citationId: citation.id } },
          create: {
            id: randomUUID(),
            runId: event.runId,
            citationId: citation.id,
            documentId: citation.documentId,
            title: citation.title,
            page: citation.page,
            chunkId: citation.chunkId,
            excerpt: citation.excerpt,
            vectorScore: citation.vectorScore,
            rerankScore: citation.rerankScore,
          },
          update: {
            excerpt: citation.excerpt,
            vectorScore: citation.vectorScore,
            rerankScore: citation.rerankScore,
          },
        }));
      }
    }
    await this.prisma.$transaction(operations);
  }

  async finishResearchRun(runId: string, status: ResearchRunStatus, result?: ResearchRunResult, error?: string): Promise<void> {
    await this.prisma.researchRun.update({
      where: { id: runId },
      data: {
        status,
        report: result?.report,
        searchCount: result?.searchCount,
        invalidCitationIds: result ? json(result.invalidCitationIds) : undefined,
        error,
        completedAt: new Date(),
      },
    });
  }

  async listResearchRuns(limit = 20): Promise<ResearchRunSummary[]> {
    const runs = await this.prisma.researchRun.findMany({
      where: { userId: LOCAL_USER_ID },
      orderBy: { createdAt: "desc" },
      take: Math.min(50, Math.max(1, limit)),
      include: { _count: { select: { citations: true } } },
    });
    return runs.map((run) => ({
      id: run.id,
      question: run.question,
      status: asRunStatus(run.status),
      citationCount: run._count.citations,
      createdAt: iso(run.createdAt),
      updatedAt: iso(run.updatedAt),
      completedAt: run.completedAt ? iso(run.completedAt) : undefined,
    }));
  }

  async getResearchRun(runId: string): Promise<ResearchRunRecord | null> {
    const run = await this.prisma.researchRun.findFirst({
      where: { id: runId, userId: LOCAL_USER_ID },
      include: {
        documents: true,
        events: { orderBy: { sequence: "asc" } },
        citations: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!run) return null;
    const citations: Citation[] = run.citations.map((citation) => ({
      id: citation.citationId,
      documentId: citation.documentId,
      title: citation.title,
      page: citation.page ?? undefined,
      chunkId: citation.chunkId,
      excerpt: citation.excerpt,
      vectorScore: citation.vectorScore,
      rerankScore: citation.rerankScore ?? undefined,
    }));
    return {
      id: run.id,
      question: run.question,
      plan: run.plan as unknown as ResearchPlan,
      documentIds: Array.isArray(run.documentIds) ? run.documentIds.map(String) : run.documents.map((item) => item.documentId),
      status: asRunStatus(run.status),
      report: run.report || "",
      error: run.error || undefined,
      searchCount: run.searchCount,
      invalidCitationIds: Array.isArray(run.invalidCitationIds) ? run.invalidCitationIds.map(String) : [],
      events: run.events.map((event) => ({
        runId: event.runId,
        sequence: event.sequence,
        timestamp: iso(event.timestamp),
        type: event.type as ResearchEvent["type"],
        payload: event.payload as Record<string, unknown>,
      })),
      citations,
      citationCount: citations.length,
      createdAt: iso(run.createdAt),
      updatedAt: iso(run.updatedAt),
      completedAt: run.completedAt ? iso(run.completedAt) : undefined,
    };
  }

  async deleteResearchRun(runId: string): Promise<boolean> {
    const result = await this.prisma.researchRun.deleteMany({ where: { id: runId, userId: LOCAL_USER_ID } });
    return result.count > 0;
  }
}
