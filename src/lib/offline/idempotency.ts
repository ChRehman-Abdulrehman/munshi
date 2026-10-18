export function dedupeByKey<T extends { idempotency_key: string }>(ops: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const op of ops) {
    if (seen.has(op.idempotency_key)) continue;
    seen.add(op.idempotency_key);
    out.push(op);
  }
  return out;
}

export function isDuplicate(existingKeys: string[], key: string): boolean {
  return existingKeys.includes(key);
}
