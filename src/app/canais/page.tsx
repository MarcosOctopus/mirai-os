import Link from "next/link";
import { getChannels, getPipeline, getVideos, PIPELINE_STAGES, PipelineStageName } from "@/lib/media-factory/db";
import { seedMediaFactory } from "@/lib/media-factory/seed";
import { MediaFactoryCard } from "@/components/MediaFactoryCard";
import Sidebar from "@/components/mdfactory/Sidebar";
import TopBar from "@/components/mdfactory/TopBar";

interface CanaisPageProps {
  searchParams: Promise<{ channel?: string }>;
}

const stageLabels: Record<PipelineStageName, string> = {
  BUSCA: "Busca",
  THUMB: "Thumb",
  MUSICA: "Música",
  ANIMACAO: "Animação",
  VIDEO_PRONTO: "Vídeo pronto",
  REVISAO: "Revisão",
  POSTADO: "Postado",
};

const stageEmojis: Record<PipelineStageName, string> = {
  BUSCA: "🔍",
  THUMB: "🎨",
  MUSICA: "🎵",
  ANIMACAO: "🎬",
  VIDEO_PRONTO: "📀",
  REVISAO: "👀",
  POSTADO: "🟢",
};

export default async function CanaisPage({ searchParams }: CanaisPageProps) {
  seedMediaFactory();
  const params = await searchParams;
  const channels = getChannels();
  const selectedChannel = channels.find((ch) => String(ch.id) === params.channel) ?? channels[0];
  const pipeline = selectedChannel ? getPipeline(selectedChannel.id) : [];
  const videos = selectedChannel ? getVideos(selectedChannel.id) : [];

  return (
    <div
      className="flex h-dvh overflow-hidden"
      style={{
        backgroundColor: "#131313",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* ─── SIDEBAR ─── */}
      <Sidebar channels={channels} activeHref="/canais" />

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />

        <main className="flex-1 overflow-y-auto" style={{ padding: "32px 36px" }}>
          <div className="flex flex-col gap-6 max-w-[1600px]">
            {/* Header */}
            <header className="flex flex-col gap-5 border-b border-cyan-300/15 pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.5em]" style={{ color: "#616775" }}>
                  Media Factory
                </p>
                <h1 className="mt-3 text-3xl font-semibold uppercase tracking-[0.22em] md:text-5xl" style={{ color: "#FFFFFF" }}>
                  Pipeline de Produção
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: "#C2C2C2" }}>
                  Status em tempo real dos vídeos em produção no ecossistema. {videos.length} vídeos no total.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <form>
                  <select
                    name="channel"
                    defaultValue={selectedChannel?.id}
                    className="rounded-lg px-4 py-2.5 text-sm outline-none"
                    style={{
                      backgroundColor: "#19171C",
                      color: "#FFFFFF",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {channels.map((channel) => (
                      <option className="bg-[#19171C]" key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="ml-2 rounded-lg px-4 py-2.5 text-xs uppercase tracking-[0.2em]"
                    style={{
                      backgroundColor: "#F23529",
                      color: "#FFFFFF",
                      border: "none",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    Abrir
                  </button>
                </form>
                <Link
                  href={`/dashboard${selectedChannel ? `?channel=${selectedChannel.id}` : ""}`}
                  className="rounded-lg px-4 py-2.5 text-xs uppercase tracking-[0.2em]"
                  style={{
                    backgroundColor: "rgba(242, 53, 41, 0.15)",
                    color: "#FFFFFF",
                    border: "1px solid rgba(242, 53, 41, 0.3)",
                    fontFamily: "'Inter', sans-serif",
                    textDecoration: "none",
                  }}
                >
                  Dashboard
                </Link>
              </div>
            </header>

            {/* Kanban Pipeline */}
            <section
              className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory"
              style={{ scrollbarWidth: "thin" }}
            >
              {PIPELINE_STAGES.map((stage) => {
                const stageInfo = pipeline.find((item) => item.stage_name === stage);
                const stageVideos = videos.filter((video) => video.current_stage === stage);

                return (
                  <div
                    key={stage}
                    className="min-w-[280px] w-[320px] flex-shrink-0 snap-start rounded-xl p-4"
                    style={{
                      backgroundColor: "#19171C",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{stageEmojis[stage]}</span>
                        <div>
                          <h2 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: "#FFFFFF" }}>
                            {stageLabels[stage]}
                          </h2>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.24em]" style={{ color: "#616775" }}>
                            {stageInfo?.status ?? "pendente"}
                          </p>
                        </div>
                      </div>
                      <span
                        className="grid h-8 w-8 place-items-center rounded-full text-xs"
                        style={{
                          backgroundColor: "rgba(255,255,255,0.06)",
                          color: "#C2C2C2",
                        }}
                      >
                        {stageVideos.length}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {stageVideos.length === 0 ? (
                        <div
                          className="rounded-xl border border-dashed p-4 text-xs leading-5"
                          style={{
                            borderColor: "rgba(255,255,255,0.08)",
                            color: "#616775",
                          }}
                        >
                          Aguardando sinal dos agentes.
                        </div>
                      ) : (
                        stageVideos.map((video) => (
                          <MediaFactoryCard key={video.id} video={video} stage={stage} />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
