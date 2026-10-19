"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { useAsync, useDebounced } from "@/lib/hooks";
import { money } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import { Chip, EmptyState, Skeleton } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import { Plus, PackageSearch, Flame, PackagePlus, Check, BellRing } from "lucide-react";
import { computeHotItems, daysOfStockLeft } from "@/lib/intel/hot";
import { computeLowStock } from "@/lib/intel/lowstock";
import { groupWanted, rankRestockSuggestions, demandVsSalesExplanation } from "@/lib/intel/demand";
import type { Product, WantedRequest } from "@/lib/types";
import { showLocalNotification } from "@/lib/notify/channels";
import { fill, getStoredLang, t as tr } from "@/lib/i18n";

type Tab = "saaman" | "garam" | "mangwana";

const UNIT_KEYS: Record<string, string> = {
  pc: "unit_pc",
  meter: "unit_meter",
  kg: "unit_kg",
  packet: "unit_packet",
  dozen: "unit_dozen",
  litre: "unit_litre",
};

const unitLabel = (u: string, t: (k: string) => string) => (UNIT_KEYS[u] ? t(UNIT_KEYS[u]) : u);

export default function StockPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-sm text-muted">{tr("sk_load", getStoredLang())}</div>}>
      <StockInner />
    </React.Suspense>
  );
}

function StockInner() {
  const search = useSearchParams();
  const initial = (search.get("tab") as Tab) || "saaman";
  const [tab, setTab] = React.useState<Tab>(initial === "garam" || initial === "mangwana" ? initial : "saaman");
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q, 200);
  const { repo, shop, products, lang, refreshAll, t } = useApp();
  const [editProduct, setEditProduct] = React.useState<Product | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  const entriesQ = useAsync(() => (repo ? repo.listEntries({ from: new Date(Date.now() - 60 * 86400000).toISOString() }) : Promise.resolve([])), [repo]);
  const wantedQ = useAsync(() => (repo ? repo.listWanted() : Promise.resolve([])), [repo]);

  const entries = entriesQ.data ?? [];
  const hot = React.useMemo(() => (shop ? computeHotItems(entries, products, shop.settings) : []), [shop, entries, products]);
  const low = React.useMemo(() => computeLowStock(products, hot), [products, hot]);

  const filtered = React.useMemo(() => {
    let out = products.filter((p) => p.active);
    if (dq.trim()) {
      const n = dq.trim().toLowerCase();
      out = out.filter((p) => p.name.toLowerCase().includes(n) || p.aliases.some((a) => a.toLowerCase().includes(n)));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, dq]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">{t("stock")}</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={16} /> {t("sk_new_product")}
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <Chip active={tab === "saaman"} onClick={() => setTab("saaman")}>
          {t("sk_tab_goods")} ({products.filter((p) => p.active).length})
        </Chip>
        <Chip active={tab === "garam"} onClick={() => setTab("garam")}>
          {t("sk_tab_hot")} {hot.length > 0 && `(${hot.length})`}
        </Chip>
        <Chip active={tab === "mangwana"} onClick={() => setTab("mangwana")}>
          {t("sk_tab_wanted")} {wantedQ.data && wantedQ.data.filter((w) => !["converted", "closed"].includes(w.status)).length > 0 && `(${wantedQ.data.filter((w) => !["converted", "closed"].includes(w.status)).length})`}
        </Chip>
      </div>

      {tab === "saaman" && (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("sk_search_ph")} />
          {entriesQ.loading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<PackageSearch size={28} />} line={t("sk_empty")} />
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const hotItem = hot.find((h) => h.product_id === p.id);
                const isLow = p.stock_qty <= p.min_stock;
                const left = daysOfStockLeft(p, entries);
                return (
                  <button key={p.id} onClick={() => setEditProduct(p)} className="card press flex w-full items-center gap-3 p-3 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">
                        {p.name} {hotItem && <span aria-label={t("sk_hot_aria")}>🔥</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {money(p.selling_price, lang)} / {unitLabel(p.unit, t)}
                        {p.cost_price ? ` • ${t("sk_cost_word")} ${money(p.cost_price, lang)}` : ""}
                        {left !== null && ` • ${fill(t("sk_days_stock"), { n: String(left) })}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`tnum text-[15px] font-black ${isLow ? "text-brick" : ""}`}>{p.stock_qty}</p>
                      <div className="mt-0.5 flex justify-end gap-1">
                        {isLow && <Badge tone="red">{t("sk_badge_low")}</Badge>}
                        {hotItem && <Badge tone="saffron">{t("sk_badge_hot")}</Badge>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {low.length > 0 && (
            <div className="rounded-2xl bg-brick-soft p-3 text-[13px]">
              <b className="text-brick">{t("sk_running_out")}</b> {low.slice(0, 4).map((l) => `${l.product.name} (${l.product.stock_qty})`).join(", ")}
            </div>
          )}
        </>
      )}

      {tab === "garam" && <HotTab hot={hot} entries={entries} onRestock={(p) => setEditProduct(p)} />}
      {tab === "mangwana" && (
        <MangwanaTab
          wanted={wantedQ.data ?? []}
          loading={wantedQ.loading}
          onChanged={async () => {
            wantedQ.reload();
            await refreshAll();
          }}
        />
      )}

      <ProductSheet product={editProduct} onClose={() => setEditProduct(null)} onSaved={async () => { setEditProduct(null); await refreshAll(); entriesQ.reload(); }} />
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title={t("sk_new_product")}>
        <ProductForm
          onSaved={async () => {
            setAddOpen(false);
            await refreshAll();
          }}
        />
      </BottomSheet>
    </div>
  );
}

function HotTab({
  hot,
  entries,
  onRestock,
}: {
  hot: ReturnType<typeof computeHotItems>;
  entries: import("@/lib/types").Entry[];
  onRestock: (p: Product) => void;
}) {
  const { products, lang, t } = useApp();
  const router = useRouter();
  const { repo, shop, refreshAlerts } = useApp();
  const toast = useToast();

  if (hot.length === 0) {
    return <EmptyState icon={<Flame size={28} />} line={t("sk_hot_empty")} />;
  }

  const addToRestock = async (productId: string, name: string) => {
    if (!repo) return;
    await repo.addWanted({
      item_text: `${name} (garam ho gaya)`,
      product_id: productId,
      variant_note: null,
      qty: products.find((p) => p.id === productId)?.preferred_restock_qty ?? 10,
      customer_id: null,
      contact_permission: false,
      reason: "other",
      expected_price: null,
      status: "to_order",
      linked_entry_id: null,
      notes: "Auto: garam maal suggestion",
    });
    await refreshAlerts();
    toast.push("success", t("sk_added_toast"));
    router.push("/stock?tab=mangwana");
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">{fill(t("sk_suggest_note"), { days: String(shop?.settings.hot_window_days ?? 7) })}</p>
      {hot.map((h) => {
        const product = products.find((p) => p.id === h.product_id);
        const left = product ? daysOfStockLeft(product, entries) : null;
        return (
          <div key={h.product_id} className="card space-y-2 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-saffron-soft text-lg">🔥</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{h.name}</p>
                <p className="text-xs text-muted">
                  {fill(t("sk_sold_n"), { units: String(h.units) })} • {h.growth_pct > 0 ? `+${h.growth_pct}%` : t("sk_new_trend")} • {money(h.value, lang)}
                </p>
              </div>
              <Badge tone={h.low_stock ? "red" : "saffron"}>{h.low_stock ? t("sk_stock_low_badge") : t("sk_badge_hot")}</Badge>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted">
                {t("sk_stock_word")} <b className={h.low_stock ? "text-brick" : ""}>{h.stock_qty}</b>
                {left !== null && <> • {fill(t("sk_will_last"), { n: String(left) })}</>}
              </span>
              <Button size="sm" variant="saffron" onClick={() => addToRestock(h.product_id, h.name)}>
                <PackagePlus size={14} /> {t("sk_restock_btn")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MangwanaTab({
  wanted,
  loading,
  onChanged,
}: {
  wanted: WantedRequest[];
  loading: boolean;
  onChanged: () => Promise<void>;
}) {
  const { repo, products, lang, refreshAlerts, customers, t } = useApp();
  const toast = useToast();
  const [notifyGroup, setNotifyGroup] = React.useState<string | null>(null);

  const nameMap = React.useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const groups = React.useMemo(() => groupWanted(wanted, nameMap), [wanted, nameMap]);
  const ranked = React.useMemo(
    () => rankRestockSuggestions(groups, new Map(products.map((p) => [p.id, p.stock_qty]))),
    [groups, products]
  );

  if (loading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
  if (ranked.length === 0) {
    return (
      <EmptyState
        icon={<PackagePlus size={28} />}
        line={t("sk_wanted_empty")}
      />
    );
  }

  const setStatus = async (id: string, status: WantedRequest["status"]) => {
    if (!repo) return;
    try {
      await repo.resolveWanted(id, { status });
      toast.push("success", t("sk_update_ok"));
      await onChanged();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("sk_fail"));
    }
  };

  const arrived = async (g: (typeof ranked)[number]) => {
    if (!repo) return;
    try {
      await repo.resolveWanted(g.requests[0].id, { status: "arrived", add_stock: !!g.product_id, qty: g.total_qty });
      for (const r of g.requests) {
        if (r.contact_permission && r.customer_id) {
          await repo.updateWanted(r.id, { status: "customer_notified" });
        }
      }
      showLocalNotification("Munshi", fill(t("sk_arrived_notif"), { item: g.item_text }));
      toast.push("success", fill(t("sk_arrived_toast"), { item: g.item_text }));
      await onChanged();
      await refreshAlerts();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("sk_fail"));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">{t("sk_wanted_note")}</p>
      {ranked.map((g) => (
        <div key={g.item_text} className="card space-y-2 p-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{g.item_text}</p>
              <p className="text-xs text-muted">
                {fill(t("sk_asked_n"), { n: String(g.count) })} • {g.total_qty} {t("sk_units_word")}
                {g.customers.filter((c) => c.name).length > 0 && (
                  <>
                    {" "}• {g.customers.filter((c) => c.name).slice(0, 2).map((c) => c.name).join(", ")}
                    {g.customers.filter((c) => c.name).length > 2 ? ` +${g.customers.filter((c) => c.name).length - 2}` : ""}
                  </>
                )}
                {g.rank_score ? ` • ${t("sk_score_word")} ${Math.round(g.rank_score)}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {g.requests.some((r) => ["arrived", "customer_notified"].includes(r.status)) && <Badge tone="green">{t("sk_badge_arrived")}</Badge>}
              {g.requests.some((r) => ["ordered", "to_order"].includes(r.status)) && <Badge tone="amber">{t("sk_badge_ordered")}</Badge>}
              {g.requests.some((r) => r.status === "new") && <Badge tone="muted">{t("kh_new")}</Badge>}
            </div>
          </div>
          <p className="text-[12px] text-muted">{demandVsSalesExplanation(g)}</p>
          <div className="flex flex-wrap gap-2">
            {g.requests.some((r) => r.status === "new") && (
              <Button size="sm" variant="outline" onClick={() => void setStatus(g.requests.find((r) => r.status === "new")!.id, "ordered")}>
                {t("sk_order_done")}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => void arrived(g)}>
              <Check size={14} /> {t("sk_stock_arrived")}
            </Button>
            {g.requests.some((r) => r.contact_permission) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const notified = g.requests.filter((r) => r.contact_permission && r.customer_id);
                  setNotifyGroup(g.item_text);
                  void notified;
                }}
              >
                <BellRing size={14} /> {t("sk_notify_people")}
              </Button>
            )}
          </div>
        </div>
      ))}

      <BottomSheet open={notifyGroup !== null} onClose={() => setNotifyGroup(null)} title={t("sk_notify_title")}>
        {notifyGroup &&
          (() => {
            const g = ranked.find((x) => x.item_text === notifyGroup);
            const rows = (g?.requests ?? []).filter((r) => r.contact_permission && r.customer_id);
            if (rows.length === 0) {
              return <p className="text-sm text-muted">{t("sk_nobody_allowed")}</p>;
            }
            return (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-2xl border border-line px-3 py-2 text-sm dark:border-night-line">
                    <span className="font-semibold">{g?.customers.find((c) => c.request_id === r.id)?.name ?? t("sk_customer_word")}</span>
                    <Badge tone={r.status === "customer_notified" ? "green" : "amber"}>
                      {r.status === "customer_notified" ? t("sk_notified") : t("sk_to_notify")}
                    </Badge>
                  </div>
                ))}
                <p className="text-xs text-muted">{t("sk_phone_note")}</p>
              </div>
            );
          })()}
      </BottomSheet>
    </div>
  );
}

function ProductSheet({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { repo, t } = useApp();
  const toast = useToast();
  const [price, setPrice] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [minStock, setMinStock] = React.useState("");
  const [restock, setRestock] = React.useState("");
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [adjQty, setAdjQty] = React.useState("");
  const [adjNote, setAdjNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (product) {
      setPrice(String(product.selling_price));
      setCost(product.cost_price != null ? String(product.cost_price) : "");
      setMinStock(String(product.min_stock));
      setRestock(product.preferred_restock_qty != null ? String(product.preferred_restock_qty) : "");
    }
  }, [product]);

  if (!product) return null;

  const save = async () => {
    if (!repo) return;
    setBusy(true);
    try {
      await repo.upsertProduct({
        id: product.id,
        name: product.name,
        aliases: product.aliases,
        category: product.category,
        unit: product.unit,
        selling_price: parseFloat(price) || product.selling_price,
        cost_price: cost.trim() ? parseFloat(cost) : null,
        stock_qty: product.stock_qty,
        min_stock: parseFloat(minStock) || 0,
        preferred_restock_qty: restock.trim() ? parseFloat(restock) : null,
        active: true,
      });
      toast.push("success", t("sk_product_updated"));
      onSaved();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Save nahi hua.");
    } finally {
      setBusy(false);
    }
  };

  const doAdjust = async () => {
    if (!repo) return;
    const q = parseFloat(adjQty);
    if (!isFinite(q) || q === 0) {
      toast.push("warning", t("sk_qty_warn"));
      return;
    }
    setBusy(true);
    try {
      await repo.adjustStock(product.id, q, adjNote.trim() || "manual adjust");
      toast.push("success", fill(t("sk_stock_now"), { q: `${q > 0 ? "+" : ""}${q}` }));
      setAdjustOpen(false);
      setAdjQty("");
      setAdjNote("");
      onSaved();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("sk_fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={product !== null} onClose={onClose} title={product.name}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-price">{t("sk_price_label")}</Label>
            <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-cost">{t("sk_cost_label")}</Label>
            <Input id="p-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={t("sk_optional")} />
          </div>
          <div>
            <Label htmlFor="p-min">{t("sk_minstock_label")}</Label>
            <Input id="p-min" inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-restock">{t("sk_restock_qty_label")}</Label>
            <Input id="p-restock" inputMode="decimal" value={restock} onChange={(e) => setRestock(e.target.value)} placeholder={t("sk_example_10")} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3 dark:bg-night-card">
          <div>
            <p className="text-xs text-muted">{t("sk_current_stock")}</p>
            <p className="tnum text-xl font-black">{product.stock_qty} {unitLabel(product.unit, t)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
            {t("sk_adjust_btn")}
          </Button>
        </div>
        <Button className="w-full" onClick={save} disabled={busy}>
          {busy ? t("sk_saving") : t("st_save")}
        </Button>

        <BottomSheet open={adjustOpen} onClose={() => setAdjustOpen(false)} title={t("sk_adjust_btn")}>
          <p className="mb-2 text-sm text-muted">{t("sk_adjust_note")}</p>
          <div className="space-y-3">
            <div>
              <Label htmlFor="adj-qty">{t("sk_qty_label")}</Label>
              <Input id="adj-qty" inputMode="decimal" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} placeholder={t("sk_qty_ph")} />
            </div>
            <div>
              <Label htmlFor="adj-note">{t("sk_reason_label")}</Label>
              <Input id="adj-note" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder={t("sk_reason_ph")} />
            </div>
            <Button className="w-full" onClick={doAdjust} disabled={busy}>
              {t("th_ok")}
            </Button>
          </div>
        </BottomSheet>
      </div>
    </BottomSheet>
  );
}

function ProductForm({ onSaved }: { onSaved: () => void }) {
  const { repo, t } = useApp();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState("pc");
  const [busy, setBusy] = React.useState(false);

  const units = ["pc", "meter", "kg", "packet", "dozen", "litre"];

  const save = async () => {
    if (!repo || name.trim().length < 2) {
      toast.push("warning", t("kh_err_name"));
      return;
    }
    setBusy(true);
    try {
      await repo.upsertProduct({
        name: name.trim(),
        aliases: [],
        unit,
        selling_price: parseFloat(price) || 0,
        cost_price: null,
        stock_qty: parseFloat(qty) || 0,
        min_stock: 2,
        preferred_restock_qty: null,
        active: true,
      });
      toast.push("success", t("sk_added"));
      onSaved();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Save nahi hua.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="np-name">{t("nc_name")} *</Label>
        <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("sk_name_ph")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="np-price">{t("sk_price_label")}</Label>
          <Input id="np-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="np-qty">{t("sk_qty_stock_label")}</Label>
          <Input id="np-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>{t("sk_unit_label")}</Label>
        <div className="flex flex-wrap gap-2">
          {units.map((u) => (
            <Chip key={u} active={unit === u} onClick={() => setUnit(u)}>
              {unitLabel(u, t)}
            </Chip>
          ))}
        </div>
      </div>
      <Button className="w-full" onClick={save} disabled={busy}>
        {busy ? t("sk_saving") : t("sk_add_btn")}
      </Button>
    </div>
  );
}
