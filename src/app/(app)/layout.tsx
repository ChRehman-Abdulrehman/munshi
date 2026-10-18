"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppProvider, useApp } from "@/components/providers";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { MicFab } from "@/components/layout/MicFab";
import { BrandBlock } from "@/components/BrandBlock";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";

function Gate({ children }: { children: React.ReactNode }) {
  const { ready, session } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream dark:bg-night-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="pulse-ring flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-black text-white">م</div>
          <p className="text-sm text-muted">Munshi jaag raha hai…</p>
        </div>
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="min-h-dvh bg-cream dark:bg-night-bg">
      <TopBar />
      <div className="mx-auto flex max-w-6xl">
        <Sidebar />
        <main className="min-w-0 flex-1 px-3 pb-36 pt-4 md:px-5 lg:pb-10">{children}</main>
      </div>
      {pathname !== "/munshi" && <MicFab />}
      <BottomNav />
      <AssistantPanel />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Gate>{children}</Gate>
    </AppProvider>
  );
}
