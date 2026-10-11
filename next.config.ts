import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O CONVERSOR de fonte (TTF/OTF → WOFF2, dono 09/10/2026) carrega um `.wasm`
  // próprio: tem de ficar FORA do bundle do servidor (require em runtime), senão
  // o build quebra ao embalar o binário.
  serverExternalPackages: ["wawoff2"],
  experimental: {
    // TETO TÉCNICO (transporte) = 40 MB, acima do teto de NEGÓCIO de 30 MB/arquivo
    // (conferido no código da rota /api/upload). O middleware cobre /api/* e o dev
    // server bufferiza o corpo: o padrão de 10 MB truncava arquivos > 10 MB e o
    // req.formData() falhava antes da validação. Ambos precisam ser > 30 MB.
    serverActions: {
      bodySizeLimit: "40mb",
    },
    middlewareClientMaxBodySize: "40mb",
  },
  async headers() {
    return [
      {
        // A PRÉVIA DO PROJETO é a ÚNICA resposta que precisa viver dentro de um
        // iframe do PRÓPRIO app (a miniatura do portfólio, dono 11/10/2026).
        // `DENY` a bloquearia; `SAMEORIGIN` permite SÓ a mesma origem — o app, e
        // mais ninguém. Fica ANTES da regra geral e a regra geral a EXCLUI (abaixo),
        // para não haver dois X-Frame-Options na mesma resposta.
        source: "/api/arquiteto/projetos/:id/previa",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // tudo, EXCETO a prévia do projeto (que tem regra própria acima)
        source: "/((?!api/arquiteto/projetos/[^/]+/previa$).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Content-Type", value: "application/javascript; charset=utf-8" }],
      },
    ];
  },
};

export default nextConfig;
