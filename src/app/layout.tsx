import type { Metadata, Viewport } from "next";
import { lerSelo } from "@/lib/build-no-ar";
import AtualizadorAutomatico from "@/components/mirai/AtualizadorAutomatico";
import "./globals.css";

// O selo da publicação vai no HTML servido: o AtualizadorAutomatico compara com
// /version e recarrega a aba que ficou com código velho. A leitura é a mesma dos
// dois lados (`lib/build-no-ar`) — antes eram duas leituras diferentes e a aba
// recarregava em ciclo.
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
  themeColor: "#080812",
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
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Public+Sans:wght@400;500;600&display=swap"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="x-build" content={lerSelo()} />
        {/* O TEMA, ANTES DA PRIMEIRA PINTURA. Este script roda antes de o
            navegador desenhar qualquer coisa: ele lê a escolha guardada e põe a
            classe `light` no <html>. Feito aqui (e não no React) porque o React
            só monta depois — e a tela abriria escura para depois virar clara na
            frente do dono. Sem escolha guardada, nada acontece: o padrão é o
            escuro. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('mirai-tema')==='claro'){document.documentElement.classList.add('light')}}catch(e){}`,
          }}
        />
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
