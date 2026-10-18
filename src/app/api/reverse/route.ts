import { NextResponse } from "next/server";
import { z } from "zod";
import { notConfigured, userFromRequest } from "../_lib/server";

export const runtime = "nodejs";

const BodySchema = z.object({
  entry_id: z.string().min(1).max(120),
  reason: z.string().min(3).max(300),
  action: z.enum(["reverse", "restore"]).default("reverse"),
});

export async function POST(req: Request) {
  const ctx = await userFromRequest(req);
  if (!ctx) return notConfigured();

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

  const { entry_id, reason, action } = parsed.data;
  const rpc = action === "reverse" ? "reverse_entry" : "restore_entry";
  const args = action === "reverse" ? { entry_id, reason } : { entry_id };
  const { data, error } = await ctx.client.rpc(rpc, args);
  if (error) {
    return NextResponse.json({ ok: false, error: "server", message: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result: data });
}
