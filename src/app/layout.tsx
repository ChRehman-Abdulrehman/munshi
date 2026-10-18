import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Munshi — Bolo, likho, poochho",
  description: "Bolo, likho, poochho. Aapka AI munshi sab yaad rakhta hai.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Munshi" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B6B4F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`:root{--font-inter:'Inter';--font-nastaliq:'Noto Nastaliq Urdu'}`}</style>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('munshi-theme');if(t==='dark')document.documentElement.classList.add('dark');var l=localStorage.getItem('munshi-lang');if(l==='ur')document.documentElement.setAttribute('dir','rtl');}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans">
        <ToastProvider>
          <RegisterSW />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
