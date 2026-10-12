import type { Metadata } from "next";

import { CopiarTexto } from "@/components/arquiteto/CopiarTexto";
import { dominioPublicoDoProjeto } from "@/lib/arquiteto-projetos";
import { IP_DA_BORDA, conferirApontamento, normalizarDominio } from "@/lib/dominio-projetos";
import { verificarDominioToken } from "@/lib/dominio-token";

// PÁGINA DO CLIENTE (dono, 09/10/2026): "o do domínio tem que ter tudo para
// fazer essa integração — um processo rápido de explicar o que deve ser feito,
// ou de uma forma mais rápida… quando falo disso falo do domínio dele".
//
// Quem abre é o CLIENTE, que não tem conta aqui: nada de sessão, nada de menu,
// nada do conteúdo do site. O token assinado (`dominio-token.ts`) autoriza
// exatamente isto: ver o domínio pedido, o registro a criar e se o DNS já
// aponta. Sem token válido, a página não mostra nem o domínio.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conectar domínio",
  robots: { index: false, follow: false },
};

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#0b0b0d] px-5 py-10 text-zinc-200">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5">{children}</div>
    </main>
  );
}

function LinhaRegistro({ nome, valor }: { nome: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase tracking-wide text-zinc-500">{nome}</div>
        <div className="truncate font-mono text-[13px] text-zinc-100">{valor}</div>
      </div>
      <CopiarTexto
        texto={valor}
        rotulo="copiar"
        className="shrink-0 rounded-full border border-zinc-700 px-2.5 py-1 text-[10.5px] text-zinc-300 transition hover:border-zinc-500 hover:text-dash-fg"
      />
    </div>
  );
}

export default async function ConectarDominioPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { token } = await params;
  // `?v=` só serve para forçar uma consulta NOVA ao DNS (o botão "verificar de
  // novo" muda a URL). Sem ele, a página é sempre dinâmica de qualquer forma.
  await searchParams;

  const t = verificarDominioToken(token);
  if (!t) {
    return (
      <Moldura>
        <h1 className="text-[19px] font-semibold text-dash-fg">Este link não vale mais</h1>
        <p className="text-[13.5px] leading-relaxed text-zinc-400">
          O link de conexão expirou ou foi substituído. Peça um novo a quem te enviou — ele é gerado
          no painel do projeto, na hora.
        </p>
      </Moldura>
    );
  }

  const proj = dominioPublicoDoProjeto(t.projetoId);
  const dominioAtual = proj?.dominio ? normalizarDominio(proj.dominio) : "";
  if (!proj || !dominioAtual || dominioAtual !== normalizarDominio(t.dominio)) {
    return (
      <Moldura>
        <h1 className="text-[19px] font-semibold text-dash-fg">Este link não vale mais</h1>
        <p className="text-[13.5px] leading-relaxed text-zinc-400">
          O domínio deste projeto mudou depois que o link foi criado. Peça um link novo a quem te
          enviou.
        </p>
      </Moldura>
    );
  }

  const ap = await conferirApontamento(dominioAtual);
  const pronto = ap.estado === "apontando";
  const semResposta = ap.estado === "sem-resposta";
  // A ÚLTIMA MILHA: quando o serviço da borda já publicou, o cliente vê o fim da
  // linha — "já está no ar", com o endereço para clicar.
  const noAr = !!proj.pronto_em;

  return (
    <Moldura>
      <header className="flex flex-col gap-1">
        <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
          Conectar domínio
        </div>
        <h1 className="break-all text-[22px] font-semibold leading-tight text-dash-fg">
          {dominioAtual}
        </h1>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          Para o site do projeto <span className="text-zinc-200">{proj.titulo}</span> abrir neste
          endereço, falta apontar o domínio para o nosso servidor.
        </p>
      </header>

      <section
        className={
          "rounded-xl border px-4 py-3.5 " +
          (noAr
            ? "border-emerald-700/70 bg-emerald-950/40"
            : pronto
              ? "border-emerald-800/70 bg-emerald-950/30"
              : semResposta
                ? "border-zinc-800 bg-zinc-950/50"
                : "border-amber-800/70 bg-amber-950/25")
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-[15px]">{noAr || pronto ? "✅" : semResposta ? "⏳" : "👉"}</span>
          <span className="text-[13.5px] font-semibold text-dash-fg">
            {noAr
              ? "Está no ar"
              : pronto
                ? "O DNS já está apontando"
                : semResposta
                  ? "Não consegui consultar o DNS agora"
                  : "Falta criar o registro abaixo"}
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-300">
          {noAr ? (
            <>
              O site já abre em{" "}
              <a
                href={`https://${dominioAtual}`}
                className="font-medium text-dash-fg underline"
                rel="noreferrer"
              >
                {dominioAtual}
              </a>
              . Não precisa fazer mais nada.
            </>
          ) : pronto ? (
            "Tudo certo do seu lado. O certificado e o site entram no ar por aqui — pode levar alguns minutos. Não precisa fazer mais nada."
          ) : semResposta ? (
            "Foi uma falha de consulta, não um erro seu. Toque em “verificar de novo” daqui a pouco."
          ) : (
            "No painel onde o domínio foi registrado, procure por “DNS”, “Zona DNS” ou “Gerenciar DNS” e crie este registro:"
          )}
        </p>
      </section>

      {!pronto && (
        <section className="flex flex-col gap-2">
          <LinhaRegistro nome="Tipo · Nome · Valor" valor={`A · @ · ${IP_DA_BORDA}`} />
          <LinhaRegistro nome="Para o www funcionar também" valor={`A · www · ${IP_DA_BORDA}`} />
          <p className="px-1 text-[11.5px] leading-relaxed text-zinc-500">
            Se já existir um registro parecido (apontando para outro servidor), troque o valor. Não
            mexa em registros de e-mail (MX) — eles não têm nada a ver com isto.
          </p>
        </section>
      )}

      {/* O BOTÃO (dono, 09/10/2026): se o domínio está no Cloudflare, o cliente
          não precisa criar registro nenhum — autoriza e a gente cria. */}
      {!noAr && (
        <section className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3.5">
          <div className="text-[12.5px] font-semibold text-zinc-200">
            O domínio está no Cloudflare?
          </div>
          <p className="text-[12px] leading-relaxed text-zinc-400">
            Então não precisa criar registro à mão: autorize o acesso e a gente cria o registro A
            certinho (e deixa pronto para o certificado).
          </p>
          <a
            href={`/api/oauth/cloudflare/iniciar?t=${token}`}
            className="mt-0.5 inline-flex w-fit items-center gap-2 rounded-full bg-[#f6821f] px-4 py-2 text-[12.5px] font-semibold text-black transition hover:brightness-110"
          >
            Conectar com Cloudflare
          </a>
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Você autoriza só o necessário (ler os domínios e editar o DNS). Não dá acesso a nada
            além disso, e você pode revogar quando quiser.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3.5">
        <div className="text-[12.5px] font-semibold text-zinc-200">Como fazer, em 3 passos</div>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-[12.5px] leading-relaxed text-zinc-400">
          <li>Entre no painel onde o domínio está registrado (Registro.br, GoDaddy, Hostinger, Cloudflare…).</li>
          <li>Abra a área de DNS e crie o registro <span className="text-zinc-200">A</span> com o valor acima.</li>
          <li>Salve e volte aqui — a propagação leva de minutos a algumas horas.</li>
        </ol>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`?v=${Date.now()}`}
          className="rounded-full bg-dash-fg px-4 py-2 text-[12.5px] font-semibold text-dash-bg transition hover:opacity-90"
        >
          Verificar de novo
        </a>
        <span className="text-[11.5px] text-zinc-500">
          {ap.ips.length > 0 && !pronto
            ? `Hoje este domínio responde: ${ap.ips.slice(0, 3).join(", ")}`
            : "Pode fechar esta página e voltar depois."}
        </span>
      </div>

      <footer className="border-t border-zinc-900 pt-3 text-[11px] text-zinc-600">
        Este link é só para conectar o domínio — ele não dá acesso ao painel nem ao conteúdo do site.
      </footer>
    </Moldura>
  );
}
