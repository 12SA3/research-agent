import type { Citation, DocumentSummary, ResearchEvent, ResearchPlan } from "../../shared/research.js";

export type ChatMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "completed" | "generating" | "aborted" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type ChatSessionRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageRecord[];
};

export type ResearchRunStatus = "running" | "completed" | "failed" | "cancelled";

export type ResearchRunSummary = {
  id: string;
  question: string;
  status: ResearchRunStatus;
  citationCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type ResearchRunRecord = ResearchRunSummary & {
  plan: ResearchPlan;
  documentIds: string[];
  report: string;
  error?: string;
  searchCount: number;
  invalidCitationIds: string[];
  events: ResearchEvent[];
  citations: Citation[];
};

export type ResearchRunResult = {
  report: string;
  citations: Citation[];
  searchCount: number;
  invalidCitationIds: string[];
};

export interface BusinessStore {
  readonly provider: "mysql" | "memory";
  readonly persistent: boolean;
  init(): Promise<void>;
  disconnect(): Promise<void>;

  listChatSessions(): Promise<ChatSessionRecord[]>;
  upsertChatSession(input: { id: string; title: string; createdAt?: string }): Promise<void>;
  upsertChatMessage(sessionId: string, message: Omit<ChatMessageRecord, "createdAt" | "updatedAt">): Promise<void>;
  deleteChatSession(sessionId: string): Promise<boolean>;

  syncDocuments(documents: DocumentSummary[]): Promise<void>;
  upsertDocument(document: DocumentSummary): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;

  createResearchRun(input: { id: string; question: string; plan: ResearchPlan; documentIds: string[] }): Promise<void>;
  appendResearchEvent(event: ResearchEvent): Promise<void>;
  finishResearchRun(runId: string, status: ResearchRunStatus, result?: ResearchRunResult, error?: string): Promise<void>;
  listResearchRuns(limit?: number): Promise<ResearchRunSummary[]>;
  getResearchRun(runId: string): Promise<ResearchRunRecord | null>;
  deleteResearchRun(runId: string): Promise<boolean>;
}
