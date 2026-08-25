import type { Citation, DocumentSummary, ResearchEvent } from "../../shared/research.js";
import type {
  BusinessStore,
  ChatMessageRecord,
  ChatSessionRecord,
  ResearchRunRecord,
  ResearchRunResult,
  ResearchRunStatus,
  ResearchRunSummary,
} from "./types.js";

export class MemoryBusinessStore implements BusinessStore {
  readonly provider = "memory" as const;
  readonly persistent = false;
  private sessions = new Map<string, ChatSessionRecord>();
  private documents = new Map<string, DocumentSummary>();
  private runs = new Map<string, ResearchRunRecord>();

  async init(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async listChatSessions(): Promise<ChatSessionRecord[]> {
    return [...this.sessions.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((session) => structuredClone(session));
  }

  async upsertChatSession(input: { id: string; title: string; createdAt?: string }): Promise<void> {
    const now = new Date().toISOString();
    const current = this.sessions.get(input.id);
    this.sessions.set(input.id, {
      id: input.id,
      title: input.title,
      createdAt: current?.createdAt || input.createdAt || now,
      updatedAt: now,
      messages: current?.messages || [],
    });
  }

  async upsertChatMessage(sessionId: string, message: Omit<ChatMessageRecord, "createdAt" | "updatedAt">): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("会话不存在");
    const now = new Date().toISOString();
    const index = session.messages.findIndex((item) => item.id === message.id);
    const next = { ...message, createdAt: index >= 0 ? session.messages[index].createdAt : now, updatedAt: now };
    if (index >= 0) session.messages[index] = next;
    else session.messages.push(next);
    session.updatedAt = now;
  }

  async deleteChatSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async syncDocuments(documents: DocumentSummary[]): Promise<void> {
    for (const document of documents) this.documents.set(document.id, structuredClone(document));
  }

  async upsertDocument(document: DocumentSummary): Promise<void> {
    this.documents.set(document.id, structuredClone(document));
    for (const run of this.runs.values()) {
      run.citations = run.citations.map((citation) => citation.documentId === document.id
        ? { ...citation, title: document.title }
        : citation);
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    this.documents.delete(documentId);
  }

  async createResearchRun(input: { id: string; question: string; plan: ResearchRunRecord["plan"]; documentIds: string[] }): Promise<void> {
    const now = new Date().toISOString();
    this.runs.set(input.id, {
      id: input.id,
      question: input.question,
      plan: structuredClone(input.plan),
      documentIds: [...input.documentIds],
      status: "running",
      report: "",
      searchCount: 0,
      invalidCitationIds: [],
      events: [],
      citations: [],
      citationCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  async appendResearchEvent(event: ResearchEvent): Promise<void> {
    const run = this.runs.get(event.runId);
    if (!run || run.events.some((item) => item.sequence === event.sequence)) return;
    run.events.push(structuredClone(event));
    run.events.sort((a, b) => a.sequence - b.sequence);
    if (event.type === "citation.collected") {
      const citation = event.payload.citation as Citation | undefined;
      if (citation && !run.citations.some((item) => item.id === citation.id)) run.citations.push(structuredClone(citation));
    }
    run.citationCount = run.citations.length;
    run.updatedAt = new Date().toISOString();
  }

  async finishResearchRun(runId: string, status: ResearchRunStatus, result?: ResearchRunResult, error?: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = status;
    run.error = error;
    if (result) {
      run.report = result.report;
      run.citations = structuredClone(result.citations);
      run.citationCount = result.citations.length;
      run.searchCount = result.searchCount;
      run.invalidCitationIds = [...result.invalidCitationIds];
    }
    run.updatedAt = new Date().toISOString();
    run.completedAt = run.updatedAt;
  }

  async listResearchRuns(limit = 20): Promise<ResearchRunSummary[]> {
    return [...this.runs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(({ id, question, status, citationCount, createdAt, updatedAt, completedAt }) => ({
        id, question, status, citationCount, createdAt, updatedAt, completedAt,
      }));
  }

  async getResearchRun(runId: string): Promise<ResearchRunRecord | null> {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : null;
  }

  async deleteResearchRun(runId: string): Promise<boolean> {
    return this.runs.delete(runId);
  }
}
