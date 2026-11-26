import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mirai · CRM",
};

/**
 * Casca do CRM (26/11/2026) — desenho do dono, feito no Claude, seguido à risca:
 * fundo #000, painéis #0A0A0A/#111, aresta #333, texto #F9F9F9, apoio #A7A7A7,
 * marca #E85002, rótulos em JetBrains Mono, títulos em Unbounded, corpo em Poppins.
 *
 * A fonte entra por <link> (não por next/font) de propósito: o CRM é servido pronto,
 * sem depender de download no build. Se o Google falhar, cai no Poppins do app.
 */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600&family=Poppins:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      />
      <div className="crm-tema">{children}</div>
    </>
  );
}