import type { PaymentInfo } from "./types";

export const PAYMENT_METHOD_LABEL: Record<PaymentInfo["method"], string> = {
  easypaisa: "Easypaisa",
  jazzcash: "JazzCash",
  bank: "Bank / IBAN",
};

export function paymentLine(info: PaymentInfo | null | undefined, shopName?: string): string | null {
  if (!info || !info.number.trim()) return null;
  return `${PAYMENT_METHOD_LABEL[info.method]}: ${info.number}${info.title ? ` (${info.title})` : shopName ? ` (${shopName})` : ""}`;
}

export function paymentQrText(info: PaymentInfo, shopName: string): string {
  return [
    `PAY ${info.title || shopName}`,
    `${PAYMENT_METHOD_LABEL[info.method]}: ${info.number}`,
    "Munshi",
  ].join("\n");
}

export function isValidPaymentNumber(method: PaymentInfo["method"], value: string): boolean {
  const v = value.replace(/[\s-]/g, "");
  if (method === "bank") return /^[A-Za-z]{0,2}\d{10,26}$/.test(v);
  return /^0\d{9,11}$/.test(v);
}
