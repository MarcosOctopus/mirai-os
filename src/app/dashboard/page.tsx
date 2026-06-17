import Link from "next/link";
import { getChannels, getDashboardData } from "@/lib/media-factory/db";
import { seedMediaFactory } from "@/lib/media-factory/seed";
import { DashboardCharts } from "@/components/DashboardCharts";

interface DashboardPageProps {
  searchParams: Promise<{ channel?: string }>;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export default async function MediaFactoryDashboardPage({ searchParams }: DashboardPageProps) {
  seedMediaFactory();
  const params = await searchParams;
  const channels = getChannels();
  const selectedChannel = channels.find((channel) => String(channel.id) === params.channel) ?? channels[0];
  const dashboard = selectedChannel ? getDashboardData(selectedChannel.id) : null;

  const metrics = [
    { label: "Vídeos", value: dashboard?.totalVideos ?? 0, detail: "total em produção" },
    { label: "Pendentes", value: dashboard?.pendingVideos ?? 0, detail: "ainda não postados" },
    { label: "Postados", value: dashboard?.postedVideos ?? 0, detail: "publicados" },
    { label: "Views", value: dashboard?.totalViews ?? 0, detail: "soma do canal" },
  ];

  return (
    <main className="min-h-dvh overflow-y-auto bg-[#03040d] text-cyan-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(176,38,255,0.16),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(10,239,255,0.14),transparent_32%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-5 py-8">
        <header className="flex flex-col gap-5 border-b border-cyan-300/15 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-cyan-300/45">Media Factory // Dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold uppercase tracking-[0.2em] text-cyan-50 md:text-5xl">
              Métricas do canal
            </h1>
            <p className="mt-3 text-sm text-cyan-100/55">{selectedChannel?.name ?? "Nenhum canal"} em monitoramento operacional.</p>
          </div>
          <Link href={`/${selectedChannel ? `?channel=${selectedChannel.id}` : ""}`} className="rounded-full border border-cyan-300/25 px-5 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100/80">
            Voltar ao Kanban
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-3xl border border-cyan-300/15 bg-cyan-950/10 p-6 shadow-[inset_0_0_45px_rgba(10,239,255,0.04)]">
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/45">{metric.label}</p>
              <p className="mt-4 text-4xl font-semibold text-cyan-50">{formatNumber(metric.value)}</p>
              <p className="mt-2 text-xs text-cyan-100/45">{metric.detail}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-cyan-300/15 bg-black/20 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-50">Distribuição por etapa</h2>
            <div className="mt-6 space-y-4">
              {dashboard?.stages.map((stage) => (
                <div key={stage.id}>
                  <div className="mb-2 flex justify-between text-xs uppercase tracking-[0.18em] text-cyan-100/55">
                    <span>{stage.stage_name}</span>
                    <span>{stage.video_count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-cyan-950/60">
                    <div
                      className="h-full rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(10,239,255,0.55)]"
                      style={{ width: `${Math.min(100, stage.video_count * 22)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-purple-300/15 bg-purple-950/10 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-purple-50">Próximo post</h2>
            {dashboard?.nextPost ? (
              <div className="mt-6 rounded-2xl border border-purple-300/15 bg-black/20 p-5">
                {dashboard.nextPost.thumbnail_url && (
                  <img
                    src={dashboard.nextPost.thumbnail_url}
                    alt={dashboard.nextPost.title}
                    className="w-full rounded-xl mb-3 object-cover max-h-32"
                  />
                )}
                <p className="text-lg font-medium text-cyan-50">{dashboard.nextPost.title}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.22em] text-purple-200/55">Etapa atual: {dashboard.nextPost.current_stage}</p>
              </div>
            ) : (
              <p className="mt-6 text-sm leading-6 text-cyan-100/45">Nenhum vídeo pendente. A linha de produção está limpa.</p>
            )}

            <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-50/80">Logs recentes</h3>
            <div className="mt-4 space-y-3">
              {dashboard?.recentLogs.length ? (
                dashboard.recentLogs.map((log) => (
                  <div key={log.id} className="border-l border-cyan-300/25 pl-3 text-xs leading-5 text-cyan-100/55">
                    <p className="uppercase tracking-[0.18em] text-cyan-200/70">{log.stage} // {log.status}</p>
                    <p>{log.message}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-cyan-100/40">Sem logs registrados.</p>
              )}
            </div>
          </div>
        </section>

        <DashboardCharts stages={dashboard?.stages ?? []} totalVideos={dashboard?.totalVideos ?? 0} />
      </div>
    </main>
  );
}
