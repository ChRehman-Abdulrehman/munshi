import type { Shop, ShopSettings } from "./types";

export type PasswordCheckId = "len" | "upper" | "lower" | "digit" | "special";

export type PasswordCheck = {
  id: PasswordCheckId;
  label: { roman: string; ur: string; en: string };
  test: (pw: string) => boolean;
};

export const PASSWORD_CHECK_SPECS: Omit<PasswordCheck, "test">[] = [
  { id: "len", label: { roman: "Kam az kam 8 hindse", ur: "کم از کم 8 ہندسے", en: "At least 8 characters" } },
  { id: "upper", label: { roman: "Ek bara harf (A–Z)", ur: "ایک بڑا حرف (A–Z)", en: "One uppercase letter (A–Z)" } },
  { id: "lower", label: { roman: "Ek chhota harf (a–z)", ur: "ایک چھوٹا حرف (a–z)", en: "One lowercase letter (a–z)" } },
  { id: "digit", label: { roman: "Ek hindsa (0–9)", ur: "ایک ہندسہ (0–9)", en: "One digit (0–9)" } },
  { id: "special", label: { roman: "Ek special symbol (!@#$…)", ur: "ایک خاص نشان (!@#$…)", en: "One special symbol (!@#$…)" } },
];

export const PASSWORD_CHECKS: PasswordCheck[] = [
  { ...PASSWORD_CHECK_SPECS[0], test: (pw) => pw.length >= 8 },
  { ...PASSWORD_CHECK_SPECS[1], test: (pw) => /[A-Z]/.test(pw) },
  { ...PASSWORD_CHECK_SPECS[2], test: (pw) => /[a-z]/.test(pw) },
  { ...PASSWORD_CHECK_SPECS[3], test: (pw) => /[0-9]/.test(pw) },
  { ...PASSWORD_CHECK_SPECS[4], test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export type PasswordValidation = {
  ok: boolean;
  checks: Record<PasswordCheckId, boolean>;
  passed: number;
};

export function validatePassword(pw: string): PasswordValidation {
  const checks = {} as Record<PasswordCheckId, boolean>;
  for (const c of PASSWORD_CHECKS) checks[c.id] = c.test(pw);
  const passed = Object.values(checks).filter(Boolean).length;
  return { ok: checks.len, checks, passed };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const PBKDF2_ITERATIONS = 120000;

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  try {
    const derived = await hashPassword(password, salt);
    if (derived.hash.length !== hash.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ derived.hash.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export function hasPassword(settings: ShopSettings | Shop | null | undefined): boolean {
  const s = settings && "settings" in settings ? (settings as Shop).settings : (settings as ShopSettings | null | undefined);
  return !!s?.password_hash && !!s?.password_salt;
}

export async function setShopPassword(
  update: (patch: Partial<ShopSettings>) => Promise<unknown>,
  password: string
): Promise<void> {
  const v = validatePassword(password);
  if (!v.ok) throw new Error("password_weak");
  const { hash, salt } = await hashPassword(password);
  await update({ password_hash: hash, password_salt: salt });
}

export async function removeShopPassword(update: (patch: Partial<ShopSettings>) => Promise<unknown>): Promise<void> {
  await update({ password_hash: null, password_salt: null });
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyCurrentSecret(settings: ShopSettings, memberUserId: string, input: string): Promise<boolean> {
  if (hasPassword(settings)) return verifyPassword(input, settings.password_hash!, settings.password_salt!);
  if (input.length < 4) return false;
  return (await sha256Hex(input)) === memberUserId;
}
