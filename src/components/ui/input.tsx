import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-2xl border border-line bg-white px-4 text-[15px] text-ink placeholder:text-muted/70",
        "dark:bg-night-card dark:text-night-ink dark:border-night-line dark:placeholder:text-night-muted/70",
        "focus:border-primary focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-12 w-full appearance-none rounded-2xl border border-line bg-white px-4 text-[15px] text-ink",
        "dark:bg-night-card dark:text-night-ink dark:border-night-line",
        "focus:border-primary focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-[13px] font-semibold text-muted", className)} {...props} />;
}
