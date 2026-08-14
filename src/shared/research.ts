export type PlanStep = {
  id: string;
  title: string;
  query: string;
};

export type ResearchPlan = {
  id: string;
  question: string;
  documentIds: string[];
  steps: PlanStep[];
};

export type Citation = {
  id: string;
  documentId: string;
  title: string;
  page?: number;
  chunkId: string;
  excerpt: string;
  vectorScore: number;
  rerankScore?: number;
};

export type ResearchEventType =
  | "run.started"
  | "plan.created"
  | "plan.confirmed"
  | "step.started"
  | "tool.started"
  | "tool.completed"
  | "citation.collected"
  | "text.delta"
  | "step.completed"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";

export type ResearchEvent = {
  runId: string;
  sequence: number;
  timestamp: string;
  type: ResearchEventType;
  payload: Record<string, unknown>;
};

export type DocumentSummary = {
  id: string;
  title: string;
  type: "pdf" | "markdown" | "text";
  pages: number;
  chunksCount: number;
  status: "ready" | "failed";
  createdAt: string;
  embeddingModel: string;
};
