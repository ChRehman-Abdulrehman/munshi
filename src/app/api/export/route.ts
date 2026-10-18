import { NextResponse } from "next/server";
import { csvFromRows } from "@/lib/export";
import { notConfigured, userFromRequest } from "../_lib/server";

export const runtime = "nodejs";

function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  const h = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  return csvFromRows(h, rows);
}

export async function GET(req: Request) {
  const ctx = await userFromRequest(req);
  if (!ctx) return notConfigured();

  const url = new URL(req.url);
  const table = url.searchParams.get("table") ?? "entries";
  const allowed = ["entries", "payments", "customers", "products", "wanted_requests", "audit_log", "allocations", "inventory_movements"];
  if (!allowed.includes(table)) {
    return NextResponse.json({ ok: false, error: "table_not_allowed", allowed }, { status: 400 });
  }

  const { data, error } = await ctx.client.from(table).select("*").limit(20000);
  if (error) return NextResponse.json({ ok: false, error: "server", message: error.message }, { status: 400 });

  const csv = toCsv((data ?? []) as Record<string, unknown>[]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="munshi-${table}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
