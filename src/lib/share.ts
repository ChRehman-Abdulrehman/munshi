"use client";

import { useCallback, useEffect, useState } from "react";

export function buildPublicShareUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/s/${token}`;
}

export function whatsappLink(phone: string | null | undefined, message: string): string {
  const text = encodeURIComponent(message);
  if (phone) {
    const digits = phone.replace(/[^\d]/g, "");
    return `https://wa.me/${digits}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}

export function useCopyToClipboard(): [string | null, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      setCopied(null);
    }
  }, []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return [copied, copy];
}
