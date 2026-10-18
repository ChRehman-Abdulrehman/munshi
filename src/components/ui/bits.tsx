import * as React from "react";
import { cn } from "@/lib/cn";

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 100 ? "bg-brick" : pct >= 80 ? "bg-amberw" : "bg-primary";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", color, barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  line,
  actionLabel,
  onAction,
  className,
}: {
  icon: React.ReactNode;
  line: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-10 text-center", className)}>
      <div className="rounded-3xl bg-white p-4 text-muted shadow-soft dark:bg-night-card">{icon}</div>
      <p className="max-w-[240px] text-sm text-muted">{line}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="press min-h-[48px] rounded-2xl bg-primary px-5 font-semibold text-white"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = parts.length === 0 ? "?" : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  const hue = (name.split("").reduce((s, c) => s + c.charCodeAt(0), 0) * 47) % 360;
  return (
    <div
      className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", className)}
      style={{ backgroundColor: `hsl(${hue}, 38%, 38%)` }}
      aria-hidden
    >
      {text}
    </div>
  );
}

export function Chip({ children, onClick, active, className }: { children: React.ReactNode; onClick?: () => void; active?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "press min-h-[40px] whitespace-nowrap rounded-full border px-4 text-sm font-semibold",
        active ? "border-primary bg-primary text-white" : "border-line bg-white text-ink dark:bg-night-card dark:text-night-ink dark:border-night-line",
        className
      )}
    >
      {children}
    </button>
  );
}
