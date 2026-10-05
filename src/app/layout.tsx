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
        {/* favicon e apple-icon sao gerados automaticamente dos arquivos
            src/app/{icon.png,favicon.ico,apple-icon.png} — a marca laranja da Mirai */}
        {/* Fontes do padrão Dash (Poppins na interface, Public Sans nos números) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Public+Sans:wght@400;500;600&display=swap"
        />
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
