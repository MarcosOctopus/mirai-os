/**
 * PÁGINA "NÃO ENCONTRADO" — porta de saída, não beco sem saída.
 *
 * POR QUE EXISTE (10/11/2026): o app não tinha `not-found.tsx`, então qualquer rota
 * inválida caía no **404 cru do Next** ("404 This page could not be found.") — branco,
 * sem marca, sem saída. O dono recebeu exatamente essa tela no celular (por estado
 * guardado no navegador) e não havia nada a clicar para sair dela.
 *
 * Regra desta casa: tela de erro também é produto. Aqui ela explica, mantém a marca e
 * oferece a saída (entrar / voltar ao início). Sem JS, sem dependência externa — se o
 * bundle falhar, esta página ainda funciona.
 */
export default function NaoEncontrado() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.25rem",
        padding: "2rem 1.25rem",
        background:
          "radial-gradient(1200px 600px at 50% -10%, rgba(56,189,248,0.16), transparent 60%), #05070d",
        color: "#e6edf7",
        textAlign: "center",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "0.8rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "#38bdf8",
        }}
      >
        Mirai OS
      </p>

      <h1 style={{ margin: 0, fontSize: "1.75rem", lineHeight: 1.25, fontWeight: 600 }}>
        Não encontrei esta página
      </h1>

      <p style={{ margin: 0, maxWidth: "34rem", color: "#9fb0c8", lineHeight: 1.6 }}>
        O endereço que você abriu não existe neste sistema — ou o seu navegador guardou
        uma versão antiga dele. Entrar pela página de acesso resolve os dois casos.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          justifyContent: "center",
          marginTop: "0.5rem",
        }}
      >
        <a
          href="/login"
          style={{
            padding: "0.7rem 1.4rem",
            borderRadius: "0.6rem",
            background: "#38bdf8",
            color: "#05070d",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Entrar
        </a>
        <a
          href="/"
          style={{
            padding: "0.7rem 1.4rem",
            borderRadius: "0.6rem",
            border: "1px solid rgba(159,176,200,0.35)",
            color: "#e6edf7",
            textDecoration: "none",
          }}
        >
          Ir para o início
        </a>
      </div>

      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
        Se o problema continuar, limpe os dados do site no navegador (as vezes é um
        cache antigo do app instalado).
      </p>
    </main>
  );
}
