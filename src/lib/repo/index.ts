"use client";

import type { Repo } from "./types";
import { LocalRepo } from "./local";

let cached: Repo | null = null;
let loading: Promise<Repo> | null = null;

function hasSupabaseKeys(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && url.startsWith("http"));
}

export async function getRepo(): Promise<Repo> {
  if (cached) return cached;
  if (!loading) {
    loading = (async () => {
      if (hasSupabaseKeys()) {
        const { SupabaseRepo } = await import("./supabase");
        cached = new SupabaseRepo(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      } else {
        cached = new LocalRepo();
      }
      return cached;
    })();
  }
  return loading;
}

export function repoMode(): "local" | "supabase" {
  return hasSupabaseKeys() ? "supabase" : "local";
}
