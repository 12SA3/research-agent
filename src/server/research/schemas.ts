import { z } from "zod";

export const planStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(80),
  query: z.string().min(2).max(300),
});

export const researchPlanSchema = z.object({
  steps: z.array(planStepSchema).min(2).max(4),
});

export const createPlanRequestSchema = z.object({
  question: z.string().min(2).max(2000),
  documentIds: z.array(z.string()).max(10).default([]),
});

export const runResearchRequestSchema = z.object({
  runId: z.string().min(1).optional(),
  question: z.string().min(2).max(2000),
  documentIds: z.array(z.string()).max(10).default([]),
  plan: z.object({
    id: z.string().min(1),
    question: z.string().min(2),
    documentIds: z.array(z.string()),
    steps: z.array(planStepSchema).min(1).max(4),
  }),
});

export const searchToolArgumentsSchema = z.object({
  query: z.string().min(2).max(300),
});

export const evaluationSchema = z.object({
  sufficient: z.boolean(),
  additionalQueries: z.array(z.string().min(2).max(300)).max(2).default([]),
});

export const chatPersistenceSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(191),
  createdAt: z.string().datetime().optional(),
  userMessageId: z.string().min(1).max(64),
  assistantMessageId: z.string().min(1).max(64),
});
