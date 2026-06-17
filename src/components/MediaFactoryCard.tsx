"use client";

import { useState } from "react";
import { PipelineStageName } from "@/lib/media-factory/db";

interface Video {
  id: number;
  channel_id: number;
  title: string;
  current_stage: PipelineStageName;
  thumbnail_url: string | null;
  video_url: string | null;
  views: number;
  created_at: string;
  posted_at: string | null;
}

interface MediaFactoryCardProps {
  video: Video;
  stage: PipelineStageName;
}

export function MediaFactoryCard({ video, stage }: MediaFactoryCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const hasThumbnail = stage === "THUMB" && video.thumbnail_url;
  const hasAudio = stage === "MUSICA" && video.video_url;

  return (
    <>
      <article
        onClick={() => setModalOpen(true)}
        className="group relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-black/20 shadow-[0_0_24px_rgba(10,239,255,0.045)] transition-all duration-300 hover:border-cyan-300/40 hover:shadow-[0_0_32px_rgba(10,239,255,0.12)] cursor-pointer"
      >
        {hasThumbnail ? (
          <div className="relative h-28 w-full overflow-hidden">
            <img
              src={video.thumbnail_url!}
              alt={video.title}
              className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center bg-cyan-950/30">
            <span className="text-2xl opacity-30">
              {stage === "BUSCA" && "🔍"}
              {stage === "THUMB" && "🎨"}
              {stage === "MUSICA" && "🎵"}
              {stage === "ANIMACAO" && "🎬"}
              {stage === "VIDEO_PRONTO" && "📀"}
              {stage === "REVISAO" && "👀"}
              {stage === "POSTADO" && "🟢"}
            </span>
          </div>
        )}
        <div className="p-3">
          <p className="text-sm font-medium leading-5 text-cyan-50 line-clamp-2">
            {video.title}
          </p>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-300/40">
            <span>#{video.id}</span>
            <span>{video.views} views</span>
          </div>
          {hasAudio && (
            <audio
              controls
              className="mt-2 w-full h-8"
              preload="none"
              onClick={(e) => e.stopPropagation()}
            >
              <source src={video.video_url!} type="audio/mpeg" />
            </audio>
          )}
        </div>
      </article>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="max-w-2xl w-full rounded-3xl border border-cyan-300/20 bg-[#06101c] p-6 shadow-[0_0_60px_rgba(10,239,255,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold text-cyan-50 pr-4">{video.title}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-cyan-300/50 hover:text-cyan-100 text-xl"
              >
                ✕
              </button>
            </div>
            {hasThumbnail && (
              <img
                src={video.thumbnail_url!}
                alt={video.title}
                className="w-full rounded-2xl mb-4 object-cover max-h-80"
              />
            )}
            <div className="flex gap-4 text-xs uppercase tracking-[0.18em] text-cyan-300/50">
              <span>#{video.id}</span>
              <span>{stage}</span>
              <span>{video.views} views</span>
            </div>
            {hasAudio && (
              <audio controls className="mt-4 w-full" preload="none">
                <source src={video.video_url!} type="audio/mpeg" />
              </audio>
            )}
          </div>
        </div>
      )}
    </>
  );
}
