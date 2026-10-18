"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getRepo } from "@/lib/repo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BrandBlock } from "@/components/BrandBlock";
import { useToast } from "@/components/ui/toast";
import { getStoredLang, t as tr } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { Mic, ShieldCheck, TrendingUp, Wifi, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [lang, setLang] = React.useState<Lang>("roman");
  const [name, setName] = React.useState("");
  const [shopName, setShopName] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [pin2, setPin2] = React.useState("");
  const [busy, setBusy] = React.useState<"login" | "demo" | null>(null);
  const isNewShop = shopName.trim().length > 0;
  const t = (key: string) => tr(key, lang);

  React.useEffect(() => {
    setLang(getStoredLang());
  }, []);

  const doDemo = async () => {
    setBusy("demo");
    try {
      const repo = await getRepo();
      await repo.signIn({ name: "Demo Owner", pin: "1234", shopName: "Ali Cloth House" });
      await repo.setDemoMode(true);
      await repo.seedDemo();
      router.replace("/");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("login_err_generic"));
      setBusy(null);
    }
  };

  const doLogin = async () => {
    if (name.trim().length < 2 || pin.length < 4) {
      toast.push("warning", t("login_err_name_pin"));
      return;
    }
    if (isNewShop && pin !== pin2) {
      toast.push("warning", t("login_err_pin_match"));
      return;
    }
    setBusy("login");
    try {
      const repo = await getRepo();
      await repo.signIn({ name: name.trim(), pin, shopName: shopName.trim() || undefined });
      router.replace("/");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("login_err_generic"));
      setBusy(null);
    }
  };

  const feats = [
    { icon: <Mic size={16} />, text: t("login_feat_voice") },
    { icon: <Wifi size={16} />, text: t("login_feat_offline") },
    { icon: <TrendingUp size={16} />, text: t("login_feat_hot") },
    { icon: <ShieldCheck size={16} />, text: t("login_feat_credit") },
  ];

  return (
    <div className="min-h-dvh bg-cream dark:bg-night-bg">
      <div className="mx-auto flex max-w-md flex-col px-5 pb-10 pt-10">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="pulse-ring flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-3xl font-black text-white shadow-lift">
            م
          </div>
          <h1 className="text-2xl font-black">Munshi</h1>
          <p className="text-[15px] text-muted">{t("login_tagline")}</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2">
          {feats.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-[13px] font-semibold shadow-soft dark:bg-night-card">
              <span className="text-primary">{f.icon}</span>
              {f.text}
            </div>
          ))}
        </div>

        <div className="card space-y-4 p-5">
          <BrandBlock />
          <div>
            <Label htmlFor="login-name">{t("login_name")}</Label>
            <Input id="login-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "en" ? "e.g. Muhammad Ahmed" : "Misal: Muhammad Ahmed"} autoComplete="name" />
          </div>
          <div>
            <Label htmlFor="login-shop">{t("login_shop")}</Label>
            <Input id="login-shop" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder={lang === "en" ? "e.g. Ali Cloth House, Lahore" : "Misal: Ali Cloth House, Lahore"} />
          </div>
          <div>
            <Label htmlFor="login-pin">{t("login_pin")}</Label>
            <Input
              id="login-pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 64))}
              placeholder={t("login_pin_ph")}
              type="password"
              autoComplete="current-password"
            />
          </div>
          {isNewShop && (
            <div>
              <Label htmlFor="login-pin2">{t("login_pin2")}</Label>
              <Input id="login-pin2" value={pin2} onChange={(e) => setPin2(e.target.value.slice(0, 64))} type="password" autoComplete="new-password" />
            </div>
          )}
          <Button className="w-full" onClick={doLogin} disabled={busy !== null}>
            {busy === "login" ? t("login_busy") : t("login_btn")}
          </Button>
          <button
            onClick={doDemo}
            disabled={busy !== null}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-saffron bg-saffron-soft px-4 py-3 text-[15px] font-bold text-ink disabled:opacity-50"
          >
            <Sparkles size={18} className="text-saffron" />
            {busy === "demo" ? t("login_demo_busy") : t("login_demo")}
          </button>
          <p className="text-center text-xs text-muted">{t("login_privacy")}</p>
        </div>
      </div>
    </div>
  );
}
