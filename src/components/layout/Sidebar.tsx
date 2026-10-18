"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bell, Home, MessageCircle, NotebookText, Package, ScanLine, Settings, SunMoon, BookOpenCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useApp } from "../providers";
import { Badge } from "../ui/badge";

const LINKS = [
  { href: "/", key: "home", icon: Home },
  { href: "/munshi", key: "munshi", icon: MessageCircle },
  { href: "/khata", key: "khata", icon: NotebookText },
  { href: "/stock", key: "stock", icon: Package },
  { href: "/bahi", key: "bahi", icon: BookOpenCheck },
  { href: "/scan", key: "scan", icon: ScanLine },
  { href: "/reports", key: "reports", icon: BarChart3 },
  { href: "/alerts", key: "alerts", icon: Bell },
  { href: "/settings", key: "settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t, unread, theme, toggleTheme, shop } = useApp();

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-line bg-white/60 px-3 py-4 dark:bg-night-card/40 dark:border-night-line lg:flex lg:flex-col xl:w-60">
      <nav className="flex flex-1 flex-col gap-1" aria-label="Sidebar">
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "press flex min-h-[48px] items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold",
                active ? "bg-primary text-white shadow-soft" : "text-ink hover:bg-black/5 dark:text-night-ink dark:hover:bg-white/5"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} />
              <span className="flex-1">{t(l.key)}</span>
              {l.key === "alerts" && unread > 0 && <Badge tone={active ? "saffron" : "red"}>{unread}</Badge>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-2 space-y-2 border-t border-line pt-3 dark:border-night-line">
        <button onClick={toggleTheme} className="press flex min-h-[44px] w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-muted hover:bg-black/5 dark:hover:bg-white/5">
          <SunMoon size={18} />
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        {shop?.is_demo && (
          <div className="rounded-2xl bg-saffron-soft p-3 text-xs font-semibold text-ink">
            DEMO DATA — asli hisaab nahi. Settings se hata sakte hain.
          </div>
        )}
      </div>
    </aside>
  );
}
