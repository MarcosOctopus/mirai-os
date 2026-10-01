import type { Metadata, Viewport } from "next";
import fs from "node:fs";
import path from "node:path";
import AtualizadorAutomatico from "@/components/mirai/AtualizadorAutomatico";
import "./globals.css";

// Build no ar, gravado no HTML servido. O AtualizadorAutomatico compara este
// valor com /version: se a aba estiver rodando código velho, ela se recarrega
// sozinha (o JS já carregado não troca quando eu publico algo novo).
function buildNoAr() {
  try {
    return fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return "dev";
  }
}

export const metadata: Metadata = {
  title: "MIRAI OS",
  description: "Assistente inteligente com memória, voz e visão | Construindo o futuro",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mirai",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/icons/icon-192.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="x-build" content={buildNoAr()} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </head>
      <body>
        {children}
        <AtualizadorAutomatico />
      </body>
    </html>
  );
}
