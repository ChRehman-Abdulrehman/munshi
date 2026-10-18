"use client";

import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { useApp } from "../providers";
import { cn } from "@/lib/cn";

export function MicFab() {
  const router = useRouter();
  const { t } = useApp();
  return (
    <button
      onClick={() => router.push("/munshi?listen=1")}
      aria-label={t("listen_now")}
      className={cn(
        "press fixed bottom-[76px] left-1/2 z-40 -translate-x-1/2 rounded-full",
        "flex h-[72px] w-[72px] items-center justify-center bg-primary text-white shadow-lift",
        "ring-4 ring-cream dark:ring-night-bg lg:bottom-8"
      )}
    >
      <Mic size={30} />
    </button>
  );
}
