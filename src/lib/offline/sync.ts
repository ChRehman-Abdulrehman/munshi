"use client";

import type { Repo } from "../repo/types";
import { listQueue, removeQueueOp, updateQueueOp, type QueuedOp } from "./queue";

export type SyncOutcome = {
  processed: number;
  saved: number;
  needs_review: number;
  failed: number;
  errors: string[];
};

export async function syncQueue(repo: Repo): Promise<SyncOutcome> {
  const ops = await listQueue();
  const outcome: SyncOutcome = { processed: 0, saved: 0, needs_review: 0, failed: 0, errors: [] };
  const pending = ops.filter((o) => o.status === "queued" || o.status === "failed" || o.status === "saving");
  for (const op of pending) {
    outcome.processed++;
    await updateQueueOp(op.id, { status: "saving" });
    try {
      if (op.kind === "commit") {
        const res = await repo.commit(op.payload as Parameters<Repo["commit"]>[0]);
        if (res.ok) {
          await removeQueueOp(op.id);
          outcome.saved++;
        } else if (res.reason === "credit_block") {
          await updateQueueOp(op.id, { status: "needs_review", error: res.message });
          outcome.needs_review++;
        } else if (res.reason === "duplicate") {
          await removeQueueOp(op.id);
          outcome.saved++;
        } else if (res.reason === "needs_review") {
          await updateQueueOp(op.id, { status: "needs_review", error: res.message });
          outcome.needs_review++;
        } else {
          await updateQueueOp(op.id, { status: "failed", error: res.message, attempts: op.attempts + 1 });
          outcome.failed++;
        }
      } else if (op.kind === "reverse") {
        const p = op.payload as { entry_id: string; reason?: string };
        const res = await repo.reverse(p.entry_id, p.reason ?? "offline reverse");
        if (res.ok) {
          await removeQueueOp(op.id);
          outcome.saved++;
        } else {
          await updateQueueOp(op.id, { status: "failed", error: res.message, attempts: op.attempts + 1 });
          outcome.failed++;
        }
      } else {
        const p = op.payload as { entry_id: string };
        const res = await repo.restore(p.entry_id);
        if (res.ok) {
          await removeQueueOp(op.id);
          outcome.saved++;
        } else {
          await updateQueueOp(op.id, { status: "failed", error: res.message, attempts: op.attempts + 1 });
          outcome.failed++;
        }
      }
    } catch (e) {
      outcome.failed++;
      outcome.errors.push(e instanceof Error ? e.message : "unknown error");
      await updateQueueOp(op.id, { status: "failed", attempts: op.attempts + 1, error: "network" });
      break;
    }
  }
  return outcome;
}

export function explainQueueState(ops: QueuedOp[]): string {
  if (!ops.some((o) => o.status === "queued" || o.status === "saving")) return "";
  return "Abhi internet nahi. Ye entries aap ke phone mein mehfooz hain, internet aane par khud save ho jayengi.";
}
