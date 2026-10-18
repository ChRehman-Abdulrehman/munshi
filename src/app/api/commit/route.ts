import { NextResponse } from "next/server";
import { CommitEntryInputSchema } from "@/lib/parser/schema";
import { notConfigured, userFromRequest } from "../_lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await userFromRequest(req);
  if (!ctx) return notConfigured();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = CommitEntryInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await ctx.client.rpc("commit_entry", { payload: parsed.data });
  if (error) {
    const known = ["CREDIT_BLOCK", "DUPLICATE", "VALIDATION"];
    const reason = known.find((k) => error.message.includes(k));
    return NextResponse.json(
      { ok: false, error: reason?.toLowerCase() ?? "server", message: error.message },
      { status: reason === "CREDIT_BLOCK" ? 409 : 400 }
    );
  }
  return NextResponse.json({ ok: true, result: data });
}
