"use client";

import * as React from "react";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/cn";
import { PASSWORD_CHECK_SPECS, validatePassword } from "@/lib/security";
import type { Lang } from "@/lib/types";

export function PasswordChecklist({ password, lang }: { password: string; lang: Lang }) {
  const v = React.useMemo(() => validatePassword(password), [password]);
  return (
    <div className="space-y-1.5" aria-live="polite">
      {PASSWORD_CHECK_SPECS.map((spec) => {
        const ok = v.checks[spec.id];
        return (
          <div
            key={spec.id}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-colors",
              ok
                ? "border-primary/40 bg-primary-soft text-primary"
                : "border-line bg-white/60 text-muted dark:border-night-line dark:bg-night-card/60"
            )}
          >
            {ok ? <Check size={14} className="shrink-0" /> : <Circle size={12} className="shrink-0 opacity-50" />}
            <span>{lang === "en" ? spec.label.en : lang === "ur" ? spec.label.ur : spec.label.roman}</span>
          </div>
        );
      })}
      {password.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-line dark:bg-night-line">
          <div
            className={cn("h-full rounded-full transition-all", v.ok ? "bg-primary" : password.length >= 6 ? "bg-saffron" : "bg-brick")}
            style={{ width: `${Math.min(100, (password.length / 8) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
