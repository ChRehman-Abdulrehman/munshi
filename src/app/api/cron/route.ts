import { NextResponse } from "next/server";
import { serviceSupabase } from "../_lib/server";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = serviceSupabase();
  if (!sb) {
    return NextResponse.json({ ok: true, skipped: true, message: "Supabase configure nahi — kuch karne ki zaroorat nahi (local mode)." });
  }

  const results: Record<string, string> = {};

  try {
    const { error } = await sb.rpc("reconcile_balances");
    results.reconcile = error ? `error: ${error.message}` : "ok";
  } catch (e) {
    results.reconcile = e instanceof Error ? e.message : "error";
  }

  try {
    const { data, error } = await sb.rpc("daily_maintenance");
    results.maintenance = error ? `error: ${error.message}` : `ok: ${JSON.stringify(data ?? {})}`;
  } catch (e) {
    results.maintenance = e instanceof Error ? e.message : "error";
  }

  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results });
}
