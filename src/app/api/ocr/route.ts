import { NextResponse } from "next/server";
import { z } from "zod";
import { parseUtterance } from "@/lib/parser/rules";
import type { Customer, Product } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  lines: z.array(z.string().min(1).max(300)).min(1).max(50),
  shop_id: z.string().min(1),
  products: z.array(z.record(z.string(), z.unknown())).max(1000).default([]),
  customers: z.array(z.record(z.string(), z.unknown())).max(2000).default([]),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const { lines, shop_id, products, customers } = parsed.data;
  const drafts = [];
  for (const line of lines) {
    const d = parseUtterance(line, {
      shop_id,
      products: products as unknown as Product[],
      customers: customers as unknown as Customer[],
    }, "ocr");
    if (d.confidence >= 0.35 && (d.items.length > 0 || d.total)) drafts.push(d);
  }

  return NextResponse.json({ ok: true, count: drafts.length, drafts });
}
