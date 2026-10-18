"use client";

import * as React from "react";

export function QrCode({ text, size = 190, className }: { text: string; size?: number; className?: string }) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let on = true;
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(text, {
          width: size * 2,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#1E2A26", light: "#FFFFFF" },
        })
      )
      .then((u) => {
        if (on) setUrl(u);
      })
      .catch(() => {
        if (on) setUrl(null);
      });
    return () => {
      on = false;
    };
  }, [text, size]);

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-line bg-white text-xs text-muted dark:border-night-line ${className ?? ""}`}
        style={{ width: size, height: size }}
      >
        QR ban raha hai…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Payment QR code"
      width={size}
      height={size}
      className={`rounded-2xl border border-line bg-white p-1 dark:border-night-line ${className ?? ""}`}
    />
  );
}
