export type NotifyResult = { ok: boolean; channel: string; message: string };

export async function sendTelegram(botToken: string, chatId: string, text: string): Promise<NotifyResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) return { ok: false, channel: "telegram", message: `HTTP ${res.status}` };
    return { ok: true, channel: "telegram", message: "bhej diya" };
  } catch (e) {
    return { ok: false, channel: "telegram", message: e instanceof Error ? e.message : "network error" };
  }
}

export async function sendWebPush(subscription: unknown, payload: { title: string; body: string }): Promise<NotifyResult> {
  void subscription;
  void payload;
  return { ok: false, channel: "webpush", message: "Web Push adapter connect nahi hai. In-app alerts chal rahe hain." };
}

export async function getWebPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestWebPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

export function showLocalNotification(title: string, body: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  }
}
