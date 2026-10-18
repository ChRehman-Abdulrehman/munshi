import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "green" | "red" | "amber" | "saffron" | "muted" | "primary";

const tones: Record<Tone, string> = {
  green: "bg-primary-soft text-primary",
  red: "bg-brick-soft text-brick",
  amber: "bg-amberw-soft text-amberw",
  saffron: "bg-saffron-soft text-ink",
  muted: "bg-black/5 text-muted dark:bg-white/10",
  primary: "bg-primary text-white",
};

export function Badge({ tone = "muted", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("paid") && !s.includes("partially") && !s.includes("unpaid")) return "green";
  if (s.includes("unpaid")) return "red";
  if (s.includes("partially")) return "amber";
  if (s.includes("reversed")) return "muted";
  if (s === "safe") return "green";
  if (s === "near limit") return "amber";
  if (s === "blocked") return "red";
  if (s.includes("overdue") || s.includes("over limit")) return "red";
  return "muted";
}
