"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition press disabled:opacity-50 disabled:pointer-events-none min-h-[48px] px-4 text-[15px]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-deep shadow-soft",
        secondary: "bg-primary-soft text-primary hover:bg-primary/10",
        outline: "border border-line bg-white text-ink hover:bg-cream dark:bg-night-card dark:text-night-ink dark:hover:bg-night-line",
        ghost: "text-ink hover:bg-black/5 dark:text-night-ink dark:hover:bg-white/5",
        danger: "bg-brick text-white hover:bg-brick/90",
        saffron: "bg-saffron text-ink hover:brightness-95",
        warning: "bg-amberw text-ink hover:brightness-95",
      },
      size: {
        default: "h-12",
        sm: "h-10 min-h-[40px] px-3 text-sm rounded-xl",
        lg: "h-14 text-base px-6",
        icon: "h-12 w-12 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
