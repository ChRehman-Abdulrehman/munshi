"use client";

import * as React from "react";
import { useApp } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import { Chip } from "@/components/ui/bits";
import { Badge } from "@/components/ui/badge";
import { QrCode } from "@/components/QrCode";
import { PasswordChecklist } from "@/components/ui/PasswordChecklist";
import { useToast } from "@/components/ui/toast";
import { useAsync } from "@/lib/hooks";
import { isValidPaymentNumber, paymentLine, paymentQrText, PAYMENT_METHOD_LABEL } from "@/lib/pay";
import { hasPassword, removeShopPassword, setShopPassword, validatePassword, verifyCurrentSecret } from "@/lib/security";
import {
  AlertTriangle, Copy, Database, Download, FlaskConical, KeyRound, LogOut, Moon, QrCode as QrIcon, ShieldCheck, Sparkles, Trash2, UserPlus, Users, Volume2,
} from "lucide-react";
import type { Member, PaymentInfo } from "@/lib/types";
import { getWebPushPermission, requestWebPushPermission, showLocalNotification } from "@/lib/notify/channels";

function numOr(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default function SettingsPage() {
  const { repo, shop, lang, setLang, theme, toggleTheme, refreshAll, t, session } = useApp();
  const toast = useToast();
  const [addMemberOpen, setAddMemberOpen] = React.useState(false);
  const [demoBusy, setDemoBusy] = React.useState(false);

  const membersQ = useAsync(() => (repo ? repo.listMembers() : Promise.resolve([] as Member[])), [repo]);
  const healthQ = useAsync(
    () => (repo ? repo.healthSnapshot() : Promise.resolve({ last_backup_at: null, duplicates_blocked: 0, failed_syncs: 0 })),
    [repo]
  );

  const [defaultLimit, setDefaultLimit] = React.useState("");
  const [overdueDays, setOverdueDays] = React.useState("");
  const [hotDays, setHotDays] = React.useState("");
  const [hotMinUnits, setHotMinUnits] = React.useState("");
  const [munshiName, setMunshiName] = React.useState("");
  const [payMethod, setPayMethod] = React.useState<PaymentInfo["method"]>("easypaisa");
  const [payTitle, setPayTitle] = React.useState("");
  const [payNumber, setPayNumber] = React.useState("");
  const [payBusy, setPayBusy] = React.useState(false);
  const [nameBusy, setNameBusy] = React.useState(false);
  const [curSecret, setCurSecret] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [newPw2, setNewPw2] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);
  const passwordOn = hasPassword(shop?.settings ?? null);

  React.useEffect(() => {
    if (shop) {
      setDefaultLimit(String(shop.settings.default_credit_limit));
      setOverdueDays(String(shop.settings.overdue_days));
      setHotDays(String(shop.settings.hot_window_days));
      setHotMinUnits(String(shop.settings.hot_min_units));
      setMunshiName(shop.settings.munshi_name ?? "Munshi");
      const pi = shop.settings.payment_info;
      if (pi) {
        setPayMethod(pi.method);
        setPayTitle(pi.title);
        setPayNumber(pi.number);
      } else {
        setPayTitle(shop.name);
      }
    }
  }, [shop]);

  const paymentInfo = shop?.settings.payment_info ?? null;
  const qrText = paymentInfo ? paymentQrText(paymentInfo, shop?.name ?? "") : null;

  const saveMunshiName = async () => {
    if (!repo) return;
    const name = munshiName.trim();
    if (name.length < 2) {
      toast.push("warning", "Munshi ka naam kam az kam 2 harf ka ho.");
      return;
    }
    setNameBusy(true);
    try {
      await repo.updateShopSettings({ munshi_name: name });
      await refreshAll();
      toast.push("success", t("st_munshi_saved"));
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Save nahi hua.");
    } finally {
      setNameBusy(false);
    }
  };

  const savePayment = async () => {
    if (!repo) return;
    const number = payNumber.trim();
    if (!isValidPaymentNumber(payMethod, number)) {
      toast.push("warning", payMethod === "bank" ? t("st_err_iban") : t("st_err_mobile"));
      return;
    }
    setPayBusy(true);
    try {
      await repo.updateShopSettings({
        payment_info: { method: payMethod, title: payTitle.trim() || shop?.name || "", number },
      });
      await refreshAll();
      toast.push("success", "Payment number save — QR code tayyar hai. Number badalne par QR khud update ho jayega.");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Save nahi hua.");
    } finally {
      setPayBusy(false);
    }
  };

  const copyPayment = async () => {
    if (!paymentInfo) return;
    const line = paymentLine(paymentInfo, shop?.name);
    try {
      await navigator.clipboard.writeText(line ?? "");
      toast.push("success", t("st_copied"));
    } catch {
      toast.push("warning", line ?? "");
    }
  };

  const downloadQr = async () => {
    if (!qrText) return;
    try {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(qrText, { width: 768, margin: 2, color: { dark: "#1E2A26", light: "#FFFFFF" } });
      const a = document.createElement("a");
      a.href = url;
      a.download = "munshi-payment-qr.png";
      a.click();
    } catch {
      toast.push("error", "QR download nahi hua.");
    }
  };

  const savePassword = async () => {
    if (!repo || !shop || !session) return;
    if (!curSecret) {
      toast.push("warning", t("sec_err_current"));
      return;
    }
    setPwBusy(true);
    try {
      const okCurrent = await verifyCurrentSecret(shop.settings, session.member.user_id, curSecret);
      if (!okCurrent) {
        toast.push("warning", t("sec_err_current"));
        return;
      }
      if (newPw !== newPw2) {
        toast.push("warning", t("sec_err_match"));
        return;
      }
      if (!validatePassword(newPw).ok) {
        toast.push("warning", t("sec_weak"));
        return;
      }
      await setShopPassword((patch) => repo.updateShopSettings(patch), newPw);
      await refreshAll();
      setCurSecret("");
      setNewPw("");
      setNewPw2("");
      toast.push("success", t("sec_saved"));
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Save nahi hua.");
    } finally {
      setPwBusy(false);
    }
  };

  const removePassword = async () => {
    if (!repo || !shop || !session) return;
    setPwBusy(true);
    try {
      const okCurrent = await verifyCurrentSecret(shop.settings, session.member.user_id, curSecret);
      if (!okCurrent) {
        toast.push("warning", t("sec_err_current"));
        return;
      }
      await removeShopPassword((patch) => repo.updateShopSettings(patch));
      await refreshAll();
      setCurSecret("");
      toast.push("success", t("sec_removed"));
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("sk_fail"));
    } finally {
      setPwBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!repo) return;
    try {
      await repo.updateShopSettings({
        default_credit_limit: numOr(defaultLimit, shop?.settings.default_credit_limit ?? 0),
        overdue_days: numOr(overdueDays, shop?.settings.overdue_days ?? 30),
        hot_window_days: numOr(hotDays, shop?.settings.hot_window_days ?? 7),
        hot_min_units: numOr(hotMinUnits, shop?.settings.hot_min_units ?? 5),
      });
      await refreshAll();
      toast.push("success", "Settings save ho gayi.");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Save nahi hui.");
    }
  };

  const toggleDemo = async () => {
    if (!repo || !shop) return;
    setDemoBusy(true);
    try {
      if (shop.is_demo) {
        await repo.clearDemo();
        toast.push("success", "Demo data hata diya — ab khali dukaan hai.");
      } else {
        await repo.setDemoMode(true);
        await repo.seedDemo();
        toast.push("success", t("st_demo_loaded"));
      }
      await refreshAll();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("sk_fail"));
    } finally {
      setDemoBusy(false);
    }
  };

  const exportBackup = async () => {
    if (!repo) return;
    try {
      const files = await repo.exportAll();
      const { downloadAllCsv } = await import("@/lib/export");
      downloadAllCsv(files);
      toast.push("success", `${files.length} files download ho gayi.`);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Export nahi hua.");
    }
  };

  const [pushPerm, setPushPerm] = React.useState<string>("default");
  React.useEffect(() => {
    void getWebPushPermission().then(setPushPerm);
  }, []);

  const enablePush = async () => {
    const perm = await requestWebPushPermission();
    setPushPerm(perm);
    if (perm === "granted") {
      showLocalNotification("Munshi", t("st_notif_on_note"));
      toast.push("success", t("st_notif_on_toast"));
    } else if (perm === "unsupported") {
      toast.push("warning", t("st_notif_no_support"));
    } else {
      toast.push("warning", t("st_perm_warn"));
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">{t("settings")}</h1>

      <Card className="space-y-3">
        <CardTitle>{t("st_shop")}</CardTitle>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold">{shop?.name}</p>
            <p className="text-xs text-muted">
              {session?.member.name} ({session?.member.role === "owner" ? t("st_owner") : t("st_staff")}) • {repo?.mode === "local" ? t("st_local") : t("st_cloud")}
            </p>
          </div>
          {shop?.is_demo && <Badge tone="saffron">DEMO</Badge>}
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle>{t("st_lang")}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Chip active={lang === "roman"} onClick={() => setLang("roman")}>Roman Urdu</Chip>
          <Chip active={lang === "ur"} onClick={() => setLang("ur")}>اردو</Chip>
          <Chip active={lang === "en"} onClick={() => setLang("en")}>English</Chip>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold"><Moon size={16} /> {t("st_dark")}</span>
          <button
            onClick={toggleTheme}
            className={`press h-8 w-14 rounded-full p-1 transition ${theme === "dark" ? "bg-primary" : "bg-line"}`}
            aria-label="Dark mode toggle"
          >
            <span className={`block h-6 w-6 rounded-full bg-white transition ${theme === "dark" ? "translate-x-6" : ""}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold"><Volume2 size={16} /> {t("st_voice")}</span>
          <button
            onClick={async () => {
              if (!repo || !shop) return;
              await repo.updateShopSettings({ voice_reply: !shop.settings.voice_reply });
              await refreshAll();
            }}
            className={`press h-8 w-14 rounded-full p-1 transition ${shop?.settings.voice_reply ? "bg-primary" : "bg-line"}`}
            aria-label="Voice reply toggle"
          >
            <span className={`block h-6 w-6 rounded-full bg-white transition ${shop?.settings.voice_reply ? "translate-x-6" : ""}`} />
          </button>
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle className="flex items-center gap-1.5"><Sparkles size={14} className="text-saffron" /> {t("st_munshi")}</CardTitle>
        <p className="text-[13px] text-muted">
          {t("st_munshi_note")}
        </p>
        <div className="flex gap-2">
          <Input value={munshiName} onChange={(e) => setMunshiName(e.target.value)} placeholder="Misal: Chacha Munshi" aria-label="Munshi ka naam" />
          <Button size="sm" onClick={saveMunshiName} disabled={nameBusy}>
            {nameBusy ? "…" : "Save"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle className="flex items-center gap-1.5"><KeyRound size={14} /> {t("sec_title")}</CardTitle>
        <p className="text-[13px] text-muted">{t("sec_intro")}</p>
        <p className={`rounded-2xl px-3 py-2 text-[13px] font-semibold ${passwordOn ? "bg-primary-soft text-primary" : "bg-amberw-soft"}`}>
          {passwordOn ? `✅ ${t("sec_status_on")}` : `⚠️ ${t("sec_status_off")}`}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="pw-current">{t("sec_current")}</Label>
            <Input
              id="pw-current"
              type="password"
              value={curSecret}
              onChange={(e) => setCurSecret(e.target.value)}
              placeholder={passwordOn ? "Aa1!…" : "1234"}
              autoComplete="current-password"
            />
          </div>
          <div>
            <Label htmlFor="pw-new">{t("sec_new")}</Label>
            <Input id="pw-new" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="pw-new2">{t("sec_confirm")}</Label>
            <Input id="pw-new2" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <PasswordChecklist password={newPw} lang={lang} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={savePassword} disabled={pwBusy}>
            {pwBusy ? "…" : t("sec_save")}
          </Button>
          {passwordOn && (
            <Button size="sm" variant="outline" onClick={removePassword} disabled={pwBusy}>
              <Trash2 size={14} /> {t("sec_remove")}
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle className="flex items-center gap-1.5"><QrIcon size={14} /> {t("st_qr")}</CardTitle>
        <p className="text-[13px] text-muted">
          {t("st_qr_note")}
        </p>
        <div className="flex flex-wrap gap-2">
          {(["easypaisa", "jazzcash", "bank"] as const).map((m) => (
            <Chip key={m} active={payMethod === m} onClick={() => setPayMethod(m)}>
              {PAYMENT_METHOD_LABEL[m]}
            </Chip>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pay-title">{t("st_acct_name")}</Label>
            <Input id="pay-title" value={payTitle} onChange={(e) => setPayTitle(e.target.value)} placeholder={shop?.name} />
          </div>
          <div>
            <Label htmlFor="pay-number">{payMethod === "bank" ? "IBAN" : t("st_mobile")}</Label>
            <Input
              id="pay-number"
              value={payNumber}
              onChange={(e) => setPayNumber(e.target.value)}
              placeholder={payMethod === "bank" ? "PK36SCBL0000001123456702" : "0300 1234567"}
              inputMode={payMethod === "bank" ? "text" : "tel"}
            />
          </div>
        </div>
        <Button size="sm" onClick={savePayment} disabled={payBusy}>
          {payBusy ? "Save…" : paymentInfo ? t("st_update_number") : t("st_save")}
        </Button>

        {paymentInfo && qrText && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-cream p-4 dark:border-night-line dark:bg-night-card">
            <QrCode text={qrText} size={190} />
            <p className="text-center text-[13px] font-semibold">{paymentLine(paymentInfo, shop?.name)}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyPayment}>
                <Copy size={14} /> {t("st_copy_number")}
              </Button>
              <Button size="sm" variant="outline" onClick={downloadQr}>
                <Download size={14} /> {t("st_qr_download")}
              </Button>
            </div>
            <p className="text-center text-xs text-muted">{t("st_qr_perm")}</p>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <CardTitle>{t("st_rules")}</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-limit">{t("st_limit")}</Label>
            <Input id="s-limit" inputMode="decimal" value={defaultLimit} onChange={(e) => setDefaultLimit(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-overdue">{t("st_overdue")}</Label>
            <Input id="s-overdue" inputMode="numeric" value={overdueDays} onChange={(e) => setOverdueDays(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-hotdays">{t("st_hotdays")}</Label>
            <Input id="s-hotdays" inputMode="numeric" value={hotDays} onChange={(e) => setHotDays(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-hotmin">{t("st_hotmin")}</Label>
            <Input id="s-hotmin" inputMode="numeric" value={hotMinUnits} onChange={(e) => setHotMinUnits(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={saveSettings}>{t("st_save")}</Button>
      </Card>

      <Card className="space-y-3">
        <CardTitle className="flex items-center gap-1.5"><Users size={14} /> {t("st_team")}</CardTitle>
        {(membersQ.data ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-2xl border border-line px-3 py-2 text-sm dark:border-night-line">
            <span className="font-semibold">{m.name} {m.user_id === session?.member.user_id && <Badge tone="primary">{t("st_you")}</Badge>}</span>
            <div className="flex items-center gap-1.5">
              <Badge tone="muted">{m.role === "owner" ? t("st_owner") : t("st_staff")}</Badge>
              {m.permissions.can_override_credit && <Badge tone="amber">Override</Badge>}
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setAddMemberOpen(true)}>
          <UserPlus size={14} /> {t("st_add_member")}
        </Button>
      </Card>

      <Card className="space-y-3">
        <CardTitle className="flex items-center gap-1.5"><FlaskConical size={14} /> {t("st_demo")}</CardTitle>
        <p className="text-[13px] text-muted">
          {t("st_demo_note")}
        </p>
        <Button size="sm" variant={shop?.is_demo ? "danger" : "saffron"} onClick={toggleDemo} disabled={demoBusy}>
          {demoBusy ? "…" : shop?.is_demo ? <><Trash2 size={14} /> {t("st_demo_remove")}</> : <><FlaskConical size={14} /> {t("st_demo_load")}</>}
        </Button>
      </Card>

      <Card className="space-y-3">
        <CardTitle className="flex items-center gap-1.5"><ShieldCheck size={14} /> {t("st_data")}</CardTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-cream p-2 dark:bg-night-card">
            <p className="text-[11px] text-muted">{t("st_lastbackup")}</p>
            <p className="text-[13px] font-bold">{healthQ.data?.last_backup_at ? new Date(healthQ.data.last_backup_at).toLocaleDateString("en-PK") : "—"}</p>
          </div>
          <div className="rounded-2xl bg-cream p-2 dark:bg-night-card">
            <p className="text-[11px] text-muted">{t("st_dupblock")}</p>
            <p className="text-[13px] font-bold">{healthQ.data?.duplicates_blocked ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-cream p-2 dark:bg-night-card">
            <p className="text-[11px] text-muted">{t("st_failsync")}</p>
            <p className="text-[13px] font-bold">{healthQ.data?.failed_syncs ?? 0}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportBackup}>
            <Download size={14} /> {t("st_backup")}
          </Button>
          <Button size="sm" variant="outline" onClick={async () => {
            if (!repo) return;
            const res = await repo.reconcile();
            toast.push(res.ok ? "success" : "warning", res.ok ? t("reconcile_ok") : `${res.diffs.length} customer mein farq mila.`);
          }}>
            <Database size={14} /> {t("st_reconcile")}
          </Button>
          {pushPerm !== "unsupported" && (
            <Button size="sm" variant="outline" onClick={enablePush}>
              {t("st_notif")}
            </Button>
          )}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {t("privacy_note")} Awaaz ki recording sirf transcribe hoti hai — audio save nahi hoti.
        </p>
      </Card>

      <Button
        variant="ghost"
        className="w-full text-brick"
        onClick={async () => {
          await repo?.signOut();
          window.location.href = "/login";
        }}
      >
        <LogOut size={16} /> {t("st_signout")}
      </Button>

      <BottomSheet open={addMemberOpen} onClose={() => setAddMemberOpen(false)} title={t("st_new_member")}>
        <AddMemberForm
          onDone={async () => {
            setAddMemberOpen(false);
            membersQ.reload();
            showLocalNotification("Munshi", t("st_member_added"));
          }}
          onError={(m) => toast.push("error", m)}
        />
      </BottomSheet>
    </div>
  );
}

function AddMemberForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const { repo, t } = useApp();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [role, setRole] = React.useState<"staff" | "owner">("staff");
  const [override, setOverride] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    if (!repo || name.trim().length < 2 || pin.length < 4) {
      onError(t("st_member_form_warn"));
      return;
    }
    setBusy(true);
    try {
      await repo.addMember({
        name: name.trim(),
        phone: phone.trim() || undefined,
        role,
        permissions: {
          can_override_credit: role === "owner" || override,
          can_view_phones: true,
          can_edit_entries: role === "owner",
          can_share_statements: true,
        },
        pin,
      });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Add nahi hua.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="m-name">{t("nc_name")} *</Label>
        <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="m-phone">{t("st_mobile")}</Label>
          <Input id="m-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </div>
        <div>
          <Label htmlFor="m-pin">{t("st_pin_label")}</Label>
          <Input id="m-pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" />
        </div>
      </div>
      <div className="flex gap-2">
        <Chip active={role === "staff"} onClick={() => setRole("staff")}>Staff (helper)</Chip>
        <Chip active={role === "owner"} onClick={() => setRole("owner")}>Owner</Chip>
      </div>
      {role === "staff" && (
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="h-5 w-5 accent-[#0B6B4F]" />
          Limit ke bawajood udhaar de sakta hai (override)
        </label>
      )}
      <Button className="w-full" onClick={save} disabled={busy}>
        {busy ? "Save…" : "Member add karo"}
      </Button>
    </div>
  );
}
