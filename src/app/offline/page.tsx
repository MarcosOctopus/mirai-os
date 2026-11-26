"use client";

/**
 * A página OFFLINE do app instalado (redesenhada em 26/11/2026).
 *
 * O service worker guarda esta página e a serve quando a rede falha. Ela NÃO pode
 * depender de nada do servidor: é HTML/CSS/JS puro, sem import de componente, sem
 * fonte externa, sem imagem.
 *
 * Antes: esfera azul de brilho alto em fundo azulado, texto solto no meio da tela.
 * Agora: a mesma linguagem do resto do ecossistema, luz contida, tudo enquadrado
 * num painel de vidro escuro com aresta fina, marca em laranja. E ela TENTA DE NOVO
 * sozinha: de 12 em 12 segundos bate em /version e recarrega quando o servidor
 * responde, além de voltar na hora em que o aparelho recupera rede (`online`).
 */
import { useEffect, useState } from "react";

const LARANJA = "#ff751f";

export default function Offline() {
  const [tentando, setTentando] = useState(false);

  useEffect(() => {
    let vivo = true;

    async function sondar() {
      try {
        const r = await fetch(`/version?t=${Date.now()}`, { cache: "no-store" });
        if (r.ok && vivo) window.location.reload();
      } catch {
        /* ainda sem rede: silêncio, o próximo ciclo tenta outra vez */
      }
    }

    const relogio = window.setInterval(sondar, 12000);
    const aoVoltar = () => {
      setTentando(true);
      void sondar();
    };
    window.addEventListener("online", aoVoltar);
    void sondar();

    return () => {
      vivo = false;
      window.clearInterval(relogio);
      window.removeEventListener("online", aoVoltar);
    };
  }, []);

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "radial-gradient(120% 90% at 50% 0%, #101014 0%, #0a0a0d 45%, #06060a 100%)",
        color: "#f2f2f4",
        fontFamily:
          "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 392,
          padding: "40px 32px 34px",
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.07)",
          background:
            "linear-gradient(180deg, rgba(22,22,27,0.86) 0%, rgba(13,13,17,0.92) 100%)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          textAlign: "center",
        }}
      >
        {/* selo: anel contido com o núcleo laranja. Luz baixa, nada de esfera neon. */}
        <div
          aria-hidden
          style={{
            width: 76,
            height: 76,
            margin: "0 auto 22px",
            borderRadius: "50%",
            border: "1px solid rgba(255,117,31,0.34)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(circle at 50% 50%, rgba(255,117,31,0.10) 0%, rgba(255,117,31,0) 68%)",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: LARANJA,
              boxShadow: "0 0 18px rgba(255,117,31,0.45)",
              opacity: 0.92,
            }}
          />
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: 0.2,
            color: "#f4f4f6",
          }}
        >
          Sem sinal do servidor
        </h1>

        <p
          style={{
            margin: "10px auto 0",
            maxWidth: 290,
            fontSize: 14,
            lineHeight: 1.62,
            color: "#9a9aa4",
          }}
        >
          O Mirai não alcançou o servidor agora. Ele volta sozinho assim que a rede
          responder. Se preferir, toque no botão.
        </p>

        <a
          href="/"
          onClick={() => setTentando(true)}
          style={{
            display: "inline-block",
            marginTop: 24,
            padding: "11px 28px",
            borderRadius: 999,
            background: LARANJA,
            color: "#0a0a0d",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {tentando ? "Tentando" : "Tentar de novo"}
        </a>

        <p
          style={{
            margin: "18px 0 0",
            fontSize: 11.5,
            letterSpacing: 0.4,
            color: "#61616b",
          }}
        >
          Verificando a conexão de 12 em 12 segundos
        </p>
      </section>
    </main>
  );
}