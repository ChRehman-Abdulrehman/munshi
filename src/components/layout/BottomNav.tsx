"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, NotebookText, Package, Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import { useApp } from "../providers";

const TABS = [
  { href: "/", key: "home", icon: Home },
  { href: "/munshi", key: "munshi", icon: MessageCircle },
  { href: "/khata", key: "khata", icon: NotebookText },
  { href: "/stock", key: "stock", icon: Package },
  { href: "/alerts", key: "alerts", icon: Bell },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t, unread } = useApp();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/97 backdrop-blur dark:bg-night-card/97 dark:border-night-line lg:hidden no-print safe-bottom"
      aria-label={t("nav_main_aria")}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                active ? "text-primary" : "text-muted"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              {t(tab.key)}
              {tab.key === "alerts" && unread > 0 && (
                <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 text-[9px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
