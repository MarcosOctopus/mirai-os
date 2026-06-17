import { createChannel, createPipelineForChannel, createVideo, getChannelBySlug, getVideos, initDB } from "./db";

export function seedMediaFactory() {
  initDB();

  const channel = getChannelBySlug("atomic-news") ?? createChannel("Atomic News", "atomic-news");
  createPipelineForChannel(channel.id);

  const videos = getVideos(channel.id);
  if (videos.length === 0) {
    createVideo(channel.id, "Atomic News — briefing inicial");
    createVideo(channel.id, "O futuro da IA em 60 segundos");
    createVideo(channel.id, "Notícias do mundo tech com sarcasmo nuclear");
  }

  return channel;
}
