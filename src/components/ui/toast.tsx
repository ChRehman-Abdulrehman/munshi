"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

type ToastKind = "success" | "error" | "warning" | "info";
type Toast = { id: number; kind: ToastKind; text: string; action?: { label: string; onClick: () => void } };

type ToastCtx = { push: (kind: ToastKind, text: string, action?: Toast["action"]) => void };

const Ctx = React.createContext<ToastCtx>({ push: () => void 0 });

export function useToast(): ToastCtx {
  return React.useContext(Ctx);
}

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 size={18} className="text-primary" />,
  error: <XCircle size={18} className="text-brick" />,
  warning: <AlertTriangle size={18} className="text-amberw" />,
  info: <Info size={18} className="text-muted" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const idRef = React.useRef(1);

  const push = React.useCallback((kind: ToastKind, text: string, action?: Toast["action"]) => {
    const id = idRef.current++;
    setToasts((prev) => [...prev.slice(-2), { id, kind, text, action }]);
    const ttl = action ? 10000 : 4200;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 no-print">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 10, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-lift dark:bg-night-card"
              role="status"
            >
              {ICONS[t.kind]}
              <span className="flex-1 text-sm">{t.text}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    setToasts((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-bold text-saffron"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
