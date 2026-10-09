"use client";

/**
 * A página OFFLINE do app instalado. O service worker guarda esta página e a
 * serve quando a rede falha — sem ela, o app instalado mostraria uma tela de
 * erro do navegador (o "vazio") justamente quando o dono abrisse na rua sem
 * sinal. Ela não depende de nada do servidor: é só HTML/CSS.
 */
export default function Offline() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "18px",
        padding: "24px",
        textAlign: "center",
        background: "radial-gradient(circle at 50% 40%, #0d1030 0%, #080812 60%, #05050c 100%)",
        color: "#e8ecff",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 92,
          height: 92,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 46%, #9ff7ff 0%, #00f0ff 34%, #0a63ff 70%, #160a3a 100%)",
          boxShadow: "0 0 60px rgba(0,240,255,0.45)",
          opacity: 0.9,
        }}
      />
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: 0.5 }}>Sem conexão</h1>
      <p style={{ margin: 0, maxWidth: 320, lineHeight: 1.5, opacity: 0.75, fontSize: 15 }}>
        O Mirai não alcançou o servidor agora. Assim que o sinal voltar, é só tentar de novo.
      </p>
      <a
        href="/"
        style={{
          marginTop: 6,
          padding: "11px 26px",
          borderRadius: 999,
          border: "1px solid rgba(0,240,255,0.5)",
          color: "#8ff4ff",
          textDecoration: "none",
          fontSize: 15,
          fontWeight: 500,
        }}
      >
        Tentar de novo
      </a>
    </main>
  );
}
