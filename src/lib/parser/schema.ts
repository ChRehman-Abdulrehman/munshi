import { z } from "zod";

export const IntentSchema = z.enum([
  "sale_cash",
  "sale_credit",
  "payment",
  "refund",
  "stock_in",
  "wanted_item",
  "resolve_wanted",
  "update_entry",
  "delete_entry",
  "undo",
  "set_credit_limit",
  "add_customer",
  "add_product",
  "set_reminder",
  "question",
  "clarify",
]);

export const PayMethodSchema = z.enum(["cash", "easypaisa", "jazzcash", "bank", "credit"]);

export const ParsedItemSchema = z.object({
  name: z.string().min(1).max(120),
  product_id: z.string().nullable().optional(),
  qty: z.number().positive().max(100000).nullable(),
  unit: z.string().max(20),
  unit_price: z.number().min(0).max(10000000).nullable(),
  discount: z.number().min(0).max(10000000),
  line_total: z.number().nullable(),
  matched: z.enum(["exact", "alias", "fuzzy", "none"]).optional(),
});

export const LlmDraftSchema = z.object({
  intent: IntentSchema,
  customer: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number().nullable(),
      unit: z.string().optional(),
      unit_price: z.number().nullable(),
    })
  ),
  total: z.number().nullable(),
  paid_now: z.number().nullable(),
  method: PayMethodSchema.nullable(),
  date: z.string().nullable(),
  note: z.string().nullable(),
  wanted: z
    .object({
      qty: z.number(),
      reason: z.enum(["out_of_stock", "price", "variant", "deferred", "other"]),
      contact_permission: z.boolean(),
      expected_price: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  missing: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export type LlmDraft = z.infer<typeof LlmDraftSchema>;

export const CommitEntryInputSchema = z.object({
  idempotency_key: z.string().min(8).max(120),
  type: z.enum(["sale", "payment", "refund", "stock_in", "adjustment"]),
  customer_id: z.string().nullable(),
  occurred_at: z.string(),
  total: z.number().min(0).max(100000000),
  paid_now: z.number().min(0).max(100000000),
  method: PayMethodSchema,
  source: z.enum(["voice", "text", "manual", "ocr", "import", "seed"]),
  note: z.string().max(500).nullable().optional(),
  override_reason: z.string().max(300).nullable().optional(),
  lines: z
    .array(
      z.object({
        product_id: z.string().nullable(),
        description: z.string().min(1).max(200),
        qty: z.number().positive().max(100000),
        unit: z.string().max(20),
        unit_price: z.number().min(0).max(10000000),
        discount: z.number().min(0).max(10000000),
      })
    )
    .default([]),
  wanted_id: z.string().nullable().optional(),
});

export type CommitEntryInput = z.infer<typeof CommitEntryInputSchema>;

export const AnswerInputSchema = z.object({
  draft: z.record(z.string(), z.unknown()),
  field: z.string().max(50),
  value: z.union([z.string().max(200), z.number(), z.boolean()]).optional(),
  value_id: z.string().max(120).optional(),
});
