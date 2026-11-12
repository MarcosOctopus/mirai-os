import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // ONDE O BUILD ESCREVE (dono, 14/10/2026).
  //
  // Por que existe: `next build` reescreve o `.next` — e é DELE que o app NO AR
  // está servindo. Buildar na árvore viva derrubava o app por 30 a 122 segundos
  // (medido: 9 janelas de queda em um dia, a pior de 2 minutos), porque o
  // processo em uso perde os arquivos debaixo dos pés e o Cloudflare devolve 502.
  //
  // Com esta linha, a publicação builda num diretório SEPARADO
  // (`NEXT_DIST_DIR=.next-novo npm run build`) e só depois faz a TROCA ATÔMICA
  // (`mv`): o app no ar não é tocado durante o build e a janela cai para os
  // poucos segundos do reinício. Sem a variável, o comportamento é o de SEMPRE
  // (`.next`) — a receita antiga continua valendo.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // RAIZ DA VARREDURA DE ARQUIVOS DO BUILD (dono, 10/11/2026).
  //
  // Por que existe: com lockfile em mais de um lugar, o Next INFERE que a raiz do
  // projeto é o diretório acima e varre a árvore inteira para o "file tracing".
  // Medido nesta máquina: o build passou 31 min a 200% de CPU, escrevendo 450 KB e
  // lendo 38 MB — não era compilação, era CAMINHAR DIRETÓRIO (readdir não conta como
  // leitura, e por isso não aparecia em I/O). Sem esta linha, o Next avisa a cada
  // build: "set outputFileTracingRoot in your Next.js config, or consider removing
  // one of the lockfiles" — o aviso estava certo e foi ignorado por 9 builds.
  //
  // Aqui a raiz fica CRAVADA na pasta do app: o tracing só olha o que o app usa.
  outputFileTracingRoot: path.resolve(process.env.MIRAI_APP_DIR || "/opt/data/mirai-app"),

  // OTIMIZAÇÕES DE BUILD — só valem quando NEXT_BUILD_LEVE=1 (dono, 22/10/2026).
  //
  // Por que existe: o build do MIRAI OS consumia 16+ GB de RAM e oscilava por
  // ~35 min sem escrever nada (medido: worker do jest-worker entre 6 e 16 GB,
  // `.next-intel` parado em 96 KB). Três builds seguidos morreram com
  // "FATAL ERROR: Ineffective mark-compacts near heap limit".
  //
  // O que estas opções economizam:
  // - `unoptimized`: o otimizador de imagem do Next roda o sharp em TODAS as
  //   imagens estáticas do projeto (logo, capas, avatares, prints do Arquiteto).
  //   É o maior consumidor isolado de memória do build.
  // - sem source maps: ~30% menos I/O e memória no bundle de produção.
  // - sem profiling estático: desliga a análise que constrói o relatório de
  //   rota por rota (o único consumidor de tempo sem gerar artefato usado).
  //
  // ⚠️ NÃO muda o runtime: `unoptimized` só afeta o QUE o otimizador pré-gera;
  // a resposta em runtime é a mesma. As imagens passam a ser servidas sem a
  // variante otimizada — diferença visual mínima, funcional idêntica.
  ...(process.env.NEXT_BUILD_LEVE
    ? {
        images: { unoptimized: true },
        productionBrowserSourceMaps: false,
        experimental: {
          serverActions: { bodySizeLimit: "40mb" },
          middlewareClientMaxBodySize: "40mb",
        },
        webpack: (config: any) => {
          // 1 worker = uma compilação por vez. O paralelismo default é o que
          // multiplica o pico de memória (vários módulos grandes em RAM ao
          // mesmo tempo). Com 1 worker o pico cai para ~1/N e o build para de
          // oscilar — é a diferença entre terminar e morrer.
          config.plugins = (config.plugins || []).filter(
            (p: any) => !/ParallelWorkerPlugin/.test(p?.constructor?.name || ""),
          );
          return config;
        },
      }
    : {}),
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

    // BUILD EM THREAD PRÓPRIA = DESLIGADO (dono, 10/11/2026).
    //
    // Por que existe: com `webpackBuildWorker` ligado (padrão), o webpack roda numa
    // worker thread e o build TRAVA sem produzir saída — medido nesta máquina em 3
    // tentativas: 31 min a 200% de CPU escrevendo 450 KB e zero arquivo em .next-novo;
    // o trace parou em 385.627 bytes e não cresceu mais (0 byte em 20 s). O modo
    // anterior (sem a alavanca) travava diferente: 0% de CPU em futex_wait. Os dois
    // modos travavam — a fonte comum é esta opção.
    webpackBuildWorker: false,
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
