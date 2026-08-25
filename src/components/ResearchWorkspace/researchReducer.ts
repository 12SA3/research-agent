import type { Citation, ResearchEvent, ResearchPlan } from "../../shared/research.js";

export type TimelineItem = {
  id: string;
  type: ResearchEvent["type"];
  title: string;
  detail?: string;
  status: "running" | "completed" | "failed";
};

export type ResearchState = {
  runId: string | null;
  status: "idle" | "planning" | "ready" | "running" | "completed" | "failed" | "cancelled";
  plan: ResearchPlan | null;
  report: string;
  citations: Citation[];
  timeline: TimelineItem[];
  error: string | null;
  lastSequence: number;
};

export const initialResearchState: ResearchState = {
  runId: null,
  status: "idle",
  plan: null,
  report: "",
  citations: [],
  timeline: [],
  error: null,
  lastSequence: 0,
};

type LocalAction =
  | { type: "planning" }
  | { type: "plan.ready"; plan: ResearchPlan }
  | { type: "plan.update"; plan: ResearchPlan }
  | { type: "run.prepare"; runId: string }
  | { type: "run.hydrate"; run: PersistedResearchRun }
  | { type: "local.error"; message: string }
  | { type: "reset" };

type PersistedResearchRun = {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  plan: ResearchPlan;
  report: string;
  citations: Citation[];
  error?: string;
  events: ResearchEvent[];
};

function upsertTimeline(items: TimelineItem[], next: TimelineItem): TimelineItem[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, next];
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item);
}

export function researchReducer(state: ResearchState, action: LocalAction | { type: "event"; event: ResearchEvent }): ResearchState {
  if (action.type === "reset") return initialResearchState;
  if (action.type === "planning") return { ...initialResearchState, status: "planning" };
  if (action.type === "plan.ready") return { ...state, status: "ready", plan: action.plan, error: null };
  if (action.type === "plan.update") return { ...state, plan: action.plan };
  if (action.type === "run.prepare") {
    return { ...state, runId: action.runId, status: "running", report: "", citations: [], timeline: [], error: null, lastSequence: 0 };
  }
  if (action.type === "run.hydrate") {
    let restored: ResearchState = {
      ...initialResearchState,
      runId: action.run.id,
      plan: action.run.plan,
      status: "running",
    };
    for (const event of action.run.events) restored = researchReducer(restored, { type: "event", event });
    return {
      ...restored,
      status: action.run.status,
      report: action.run.report || restored.report,
      citations: action.run.citations.length ? action.run.citations : restored.citations,
      error: action.run.error || restored.error,
    };
  }
  if (action.type === "local.error") return { ...state, status: "failed", error: action.message };

  const event = action.event;
  if (event.runId !== state.runId || event.sequence <= state.lastSequence) return state;
  const base = { ...state, lastSequence: event.sequence };
  const step = event.payload.step as { id?: string; title?: string; query?: string } | undefined;
  const stepId = String(event.payload.stepId || step?.id || "research");

  switch (event.type) {
    case "run.started":
      return { ...base, status: "running" };
    case "step.started":
      return {
        ...base,
        timeline: upsertTimeline(base.timeline, { id: `step:${stepId}`, type: event.type, title: step?.title || "研究步骤", detail: step?.query, status: "running" }),
      };
    case "tool.started":
      return {
        ...base,
        timeline: upsertTimeline(base.timeline, { id: `tool:${stepId}:${String(event.payload.query)}`, type: event.type, title: "检索知识库", detail: String(event.payload.query || ""), status: "running" }),
      };
    case "tool.completed":
      return {
        ...base,
        timeline: upsertTimeline(base.timeline, { id: `tool:${stepId}:${String(event.payload.query)}`, type: event.type, title: "检索完成", detail: `找到 ${String(event.payload.resultCount || 0)} 条证据`, status: "completed" }),
      };
    case "citation.collected": {
      const citation = event.payload.citation as Citation;
      if (!citation || base.citations.some((item) => item.id === citation.id)) return base;
      return { ...base, citations: [...base.citations, citation] };
    }
    case "text.delta":
      return { ...base, report: base.report + String(event.payload.delta || "") };
    case "step.completed":
      return {
        ...base,
        timeline: upsertTimeline(base.timeline, { id: `step:${stepId}`, type: event.type, title: base.timeline.find((item) => item.id === `step:${stepId}`)?.title || "研究步骤", detail: `收集 ${String(event.payload.citationCount || 0)} 条证据`, status: "completed" }),
      };
    case "run.completed":
      return { ...base, status: "completed" };
    case "run.cancelled":
      return { ...base, status: "cancelled", error: String(event.payload.message || "任务已中止") };
    case "run.failed":
      return { ...base, status: "failed", error: String(event.payload.message || "研究任务失败") };
    default:
      return base;
  }
}
