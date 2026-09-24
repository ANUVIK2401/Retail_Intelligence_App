import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/Shell";
import { PRODUCT } from "@/config/product";
import "./globals.css";
import "./assistant.css";

// Apply a persisted explicit preference before paint; CSS handles system mode.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ecc-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;

export const metadata: Metadata = {
  title: PRODUCT.name,
  description: PRODUCT.description,
  // Declared explicitly so browsers use the SVG instead of probing for
  // /favicon.ico, which this app does not ship and which logged a 404 on
  // every page load.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0a171c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
