"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { CommitEntryInput } from "../parser/schema";

export type QueueStatus = "queued" | "saving" | "needs_review" | "failed";

export type QueuedOp = {
  id: string;
  idempotency_key: string;
  kind: "commit" | "reverse" | "restore";
  payload: CommitEntryInput | { entry_id: string; reason?: string };
  created_at: string;
  status: QueueStatus;
  error?: string;
  attempts: number;
};

const DB_NAME = "munshi-queue";
const STORE = "ops";

function canUseIDB(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

async function db(): Promise<IDBPDatabase | null> {
  if (!canUseIDB()) return null;
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
    },
  });
}

export async function enqueue(op: Omit<QueuedOp, "status" | "attempts" | "created_at">): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.put(STORE, { ...op, status: "queued", attempts: 0, created_at: new Date().toISOString() });
}

export async function listQueue(): Promise<QueuedOp[]> {
  const d = await db();
  if (!d) return [];
  return d.getAll(STORE);
}

export async function updateQueueOp(id: string, patch: Partial<QueuedOp>): Promise<void> {
  const d = await db();
  if (!d) return;
  const op = await d.get(STORE, id);
  if (op) await d.put(STORE, { ...op, ...patch });
}

export async function removeQueueOp(id: string): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.delete(STORE, id);
}

export async function queueCount(): Promise<number> {
  const d = await db();
  if (!d) return 0;
  return d.count(STORE);
}
