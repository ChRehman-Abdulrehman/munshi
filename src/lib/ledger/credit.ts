import type { CreditAssessment } from "../types";
import { round2 } from "./balance";

export const NEAR_LIMIT_PCT = 80;

export function effectiveLimit(limit: number | null | undefined, shopDefault: number): number {
  const l = limit === null || limit === undefined ? shopDefault : limit;
  return Math.max(0, round2(l));
}

export function assessCredit(opts: {
  balance: number;
  limit: number | null | undefined;
  shopDefaultLimit: number;
  creditAmount: number;
}): CreditAssessment {
  const limit = effectiveLimit(opts.limit, opts.shopDefaultLimit);
  const balance = round2(opts.balance);
  const projected = round2(balance + opts.creditAmount);
  const pct = limit <= 0 ? (projected > 0 ? 100 : 0) : (projected / limit) * 100;

  if (limit <= 0 && opts.creditAmount > 0) {
    return {
      status: "block",
      balance,
      limit,
      projected,
      pct: 100,
      message: "Udhaar ki limit set nahi hai. Pehle limit set karein ya cash lein.",
    };
  }
  if (projected >= limit) {
    return {
      status: "block",
      balance,
      limit,
      projected,
      pct,
      message: "Udhaar limit se zyada ho raha hai.",
    };
  }
  if (pct >= NEAR_LIMIT_PCT) {
    return {
      status: "warn",
      balance,
      limit,
      projected,
      pct,
      message: "Udhaar limit ke qareeb pahunch raha hai.",
    };
  }
  return { status: "ok", balance, limit, projected, pct, message: "Theek hai." };
}

export function customerStatusBadge(balance: number, limit: number | null | undefined, shopDefault: number): "Safe" | "Near limit" | "Blocked" {
  const l = effectiveLimit(limit, shopDefault);
  if (l <= 0) return balance > 0 ? "Blocked" : "Safe";
  if (balance >= l) return "Blocked";
  if (balance >= (l * NEAR_LIMIT_PCT) / 100) return "Near limit";
  return "Safe";
}

export function isOverdue(opts: {
  oldestUnpaidAt: string | null | undefined;
  paymentTermsDays?: number | null;
  shopOverdueDays: number;
  now?: Date;
}): boolean {
  if (!opts.oldestUnpaidAt) return false;
  const days = opts.paymentTermsDays ?? opts.shopOverdueDays;
  const cutoff = (opts.now ?? new Date()).getTime() - days * 86400000;
  return new Date(opts.oldestUnpaidAt).getTime() < cutoff;
}
