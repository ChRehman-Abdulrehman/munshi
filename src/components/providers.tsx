"use client";

import * as React from "react";
import type { Alert, Customer, Product, Shop, SyncState } from "@/lib/types";
import type { Repo, Session } from "@/lib/repo/types";
import { getRepo } from "@/lib/repo";
import { t as translate } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { queueCount } from "@/lib/offline/queue";

type AppCtx = {
  ready: boolean;
  repo: Repo | null;
  session: Session | null;
  shop: Shop | null;
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  t: (key: string) => string;
  products: Product[];
  customers: Customer[];
  balances: Map<string, number>;
  alerts: Alert[];
  unread: number;
  refreshAll: () => Promise<void>;
  refreshAlerts: () => Promise<void>;
  sync: SyncState;
  setSync: (s: SyncState) => void;
};

const Ctx = React.createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children, requireSession = true }: { children: React.ReactNode; requireSession?: boolean }) {
  const [ready, setReady] = React.useState(false);
  const [repo, setRepo] = React.useState<Repo | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [shop, setShop] = React.useState<Shop | null>(null);
  const [lang, setLangState] = React.useState<Lang>("roman");
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [products, setProducts] = React.useState<Product[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [balances, setBalances] = React.useState<Map<string, number>>(new Map());
  const [alerts, setAlerts] = React.useState<Alert[]>([]);
  const [sync, setSync] = React.useState<SyncState>("saved");

  const refreshAlerts = React.useCallback(async () => {
    if (!repo) return;
    try {
      setAlerts(await repo.listAlerts());
    } catch {
      void 0;
    }
  }, [repo]);

  const refreshAll = React.useCallback(async () => {
    if (!repo) return;
    try {
      const s = await repo.getShop();
      setShop(s);
      const [prods, custs, bal] = await Promise.all([repo.listProducts(), repo.listCustomers(), repo.balanceMap()]);
      setProducts(prods);
      setCustomers(custs);
      setBalances(bal);
      await refreshAlerts();
    } catch {
      void 0;
    }
  }, [repo, refreshAlerts]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getRepo();
      if (cancelled) return;
      setRepo(r);
      const storedLang = (typeof window !== "undefined" ? window.localStorage.getItem("munshi-lang") : null) as Lang | null;
      if (storedLang) setLangState(storedLang);
      const storedTheme = (typeof window !== "undefined" ? window.localStorage.getItem("munshi-theme") : null) as "light" | "dark" | null;
      if (storedTheme) setTheme(storedTheme);
      const s = await r.getSession();
      if (cancelled) return;
      setSession(s);
      if (s) {
        setShop(s.shop);
        const [prods, custs, bal] = await Promise.all([r.listProducts(), r.listCustomers(), r.balanceMap()]);
        if (cancelled) return;
        setProducts(prods);
        setCustomers(custs);
        setBalances(bal);
        try {
          setAlerts(await r.listAlerts());
        } catch {
          void 0;
        }
      }
      setReady(true);
      void queueCount().then((n) => {
        if (n > 0) setSync("queued");
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("munshi-theme", theme);
  }, [theme]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("dir", lang === "ur" ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", lang === "ur" ? "ur" : "en");
    window.localStorage.setItem("munshi-lang", lang);
  }, [lang]);

  React.useEffect(() => {
    const on = () => setSync((s) => (s === "queued" || s === "saving" ? s : "saved"));
    const off = () => setSync("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if (!navigator.onLine) setSync("offline");
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    if (repo) void repo.updateShopSettings({ language: l });
  }, [repo]);

  const value: AppCtx = {
    ready,
    repo,
    session,
    shop,
    lang,
    setLang,
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    t: (key: string) => translate(key, lang),
    products,
    customers,
    balances,
    alerts,
    unread: alerts.filter((a) => !a.read_at && !a.resolved_at && (!a.snoozed_until || new Date(a.snoozed_until).getTime() < Date.now())).length,
    refreshAll,
    refreshAlerts,
    sync,
    setSync,
  };

  void requireSession;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
