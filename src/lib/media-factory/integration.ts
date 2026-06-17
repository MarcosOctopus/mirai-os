import {
  addVideoLog,
  createVideo,
  getChannelBySlug,
  getVideos,
  initDB,
  PipelineStageName,
  StageStatus,
  updateVideoStage,
} from "./db";
import { seedMediaFactory } from "./seed";

export interface ReportStatusResult {
  channelSlug: string;
  videoId: number;
  stage: PipelineStageName;
  status: StageStatus;
  message: string;
}

export function reportStatus(
  channelSlug: string,
  stage: PipelineStageName,
  videoTitle: string,
  status: StageStatus,
  message: string,
): ReportStatusResult {
  initDB();
  seedMediaFactory();

  const channel = getChannelBySlug(channelSlug);
  if (!channel) throw new Error(`Channel not found: ${channelSlug}`);

  const cleanTitle = videoTitle.trim();
  if (!cleanTitle) throw new Error("videoTitle is required");

  const existingVideo = getVideos(channel.id).find((video) => video.title.toLowerCase() === cleanTitle.toLowerCase());
  const video = existingVideo ?? createVideo(channel.id, cleanTitle);

  if (status === "concluido") {
    updateVideoStage(video.id, stage);
  } else {
    addVideoLog(video.id, stage, status, message || `Status ${status} em ${stage}`);
  }

  return {
    channelSlug,
    videoId: video.id,
    stage,
    status,
    message,
  };
}

export function getPendingVideos(channelSlug: string) {
  initDB();
  seedMediaFactory();

  const channel = getChannelBySlug(channelSlug);
  if (!channel) throw new Error(`Channel not found: ${channelSlug}`);

  return getVideos(channel.id).filter((video) => video.current_stage !== "POSTADO");
}
