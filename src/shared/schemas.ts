import { z } from "zod";

export const verdictSchema = z.enum(["SUCCESS", "FAILURE", "UNKNOWN"]);

export const criterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  question: z.string().min(1),
  success: z.string().min(1),
  failure: z.string().min(1),
  unknown: z.string().min(1),
});

export const rubricSchema = z.object({
  version: z.string().min(1),
  name: z.string().min(1),
  scoring: z.array(verdictSchema).length(3),
  criteria: z.array(criterionSchema).min(3).max(8),
});

export const scenarioFileSchema = z.object({
  version: z.string().min(1),
  scenarios: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      userMessage: z.string().min(1),
      expectedSignals: z.array(z.string().min(1)).min(1),
    }),
  ),
});

export const feedbackInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  conversationId: z.string().min(1).max(200),
  responseId: z.string().min(1).max(200).nullable().optional(),
  responseTimestamp: z.string().datetime({ offset: true }).nullable().optional(),
  userFeedback: z.string().min(3).max(4000),
  expectedBehavior: z.string().max(4000).nullable().optional(),
  includeExcerpt: z.boolean().default(false),
  evidenceMessages: z
    .array(
      z.object({
        id: z.string().max(200).nullable(),
        role: z.enum(["user", "agent"]),
        message: z.string().min(1).max(8000),
        timestamp: z.string().max(100).nullable(),
      }),
    )
    .max(6)
    .optional(),
});

export const proposalDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  confirmation: z.string().optional(),
  note: z.string().max(2000).optional(),
});

export type Rubric = z.infer<typeof rubricSchema>;
export type Criterion = z.infer<typeof criterionSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
