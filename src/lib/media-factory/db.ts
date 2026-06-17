import type Database from "better-sqlite3";
import DatabaseConstructor from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

export const PIPELINE_STAGES = [
  "BUSCA",
  "THUMB",
  "MUSICA",
  "ANIMACAO",
  "VIDEO_PRONTO",
  "REVISAO",
  "POSTADO",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];
export type StageStatus = "pendente" | "em_progresso" | "concluido" | "erro";

export interface Channel {
  id: number;
  name: string;
  slug: string;
  platform: string;
  active: 0 | 1;
  created_at: string;
}

export interface PipelineStage {
  id: number;
  channel_id: number;
  stage_order: number;
  stage_name: PipelineStageName;
  status: StageStatus;
  updated_at: string;
}

export interface Video {
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

export interface VideoLog {
  id: number;
  video_id: number;
  stage: PipelineStageName;
  status: StageStatus;
  message: string;
  created_at: string;
}

export interface DashboardData {
  channel: Channel | null;
  totalVideos: number;
  postedVideos: number;
  pendingVideos: number;
  totalViews: number;
  nextPost: Video | null;
  stages: Array<PipelineStage & { video_count: number }>;
  recentLogs: VideoLog[];
}

const DB_PATH = process.env.MEDIA_FACTORY_DB_PATH || join(process.cwd(), "data", "media-factory.sqlite");
let db: ReturnType<typeof DatabaseConstructor> | null = null;

function now(): string {
  return new Date().toISOString();
}

function ensureStage(stage: string): asserts stage is PipelineStageName {
  if (!PIPELINE_STAGES.includes(stage as PipelineStageName)) {
    throw new Error(`Invalid pipeline stage: ${stage}`);
  }
}

function getDB(): ReturnType<typeof DatabaseConstructor> {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    db = new DatabaseConstructor(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function initDB(): ReturnType<typeof DatabaseConstructor> {
  const database = getDB();

  database.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'youtube',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      stage_order INTEGER NOT NULL,
      stage_name TEXT NOT NULL CHECK(stage_name IN ('BUSCA','THUMB','MUSICA','ANIMACAO','VIDEO_PRONTO','REVISAO','POSTADO')),
      status TEXT NOT NULL DEFAULT 'pendente',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      UNIQUE(channel_id, stage_name)
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      current_stage TEXT NOT NULL CHECK(current_stage IN ('BUSCA','THUMB','MUSICA','ANIMACAO','VIDEO_PRONTO','REVISAO','POSTADO')),
      thumbnail_url TEXT,
      video_url TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      posted_at TEXT,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('BUSCA','THUMB','MUSICA','ANIMACAO','VIDEO_PRONTO','REVISAO','POSTADO')),
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_channel ON pipeline_stages(channel_id, stage_order);
    CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id, current_stage);
    CREATE INDEX IF NOT EXISTS idx_logs_video ON video_logs(video_id, created_at);
  `);

  return database;
}

export function createPipelineForChannel(channelId: number): PipelineStage[] {
  const database = initDB();
  const stamp = now();
  const insert = database.prepare(`
    INSERT OR IGNORE INTO pipeline_stages (channel_id, stage_order, stage_name, status, updated_at)
    VALUES (?, ?, ?, 'pendente', ?)
  `);

  const tx = database.transaction(() => {
    PIPELINE_STAGES.forEach((stage, index) => insert.run(channelId, index + 1, stage, stamp));
  });
  tx();

  return getPipeline(channelId);
}

export function getChannels(): Channel[] {
  return initDB().prepare("SELECT * FROM channels ORDER BY created_at DESC").all() as Channel[];
}

export function createChannel(name: string, slug: string): Channel {
  const database = initDB();
  const cleanName = name.trim();
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanName || !cleanSlug) throw new Error("Name and slug are required");

  const existing = database.prepare("SELECT * FROM channels WHERE slug = ?").get(cleanSlug) as Channel | undefined;
  if (existing) return existing;

  const result = database.prepare(`
    INSERT INTO channels (name, slug, platform, active, created_at)
    VALUES (?, ?, 'youtube', 1, ?)
  `).run(cleanName, cleanSlug, now());

  createPipelineForChannel(Number(result.lastInsertRowid));
  return database.prepare("SELECT * FROM channels WHERE id = ?").get(result.lastInsertRowid) as Channel;
}

export function getPipeline(channelId: number): PipelineStage[] {
  return initDB()
    .prepare("SELECT * FROM pipeline_stages WHERE channel_id = ? ORDER BY stage_order ASC")
    .all(channelId) as PipelineStage[];
}

export function createVideo(channelId: number, title: string): Video {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Title is required");

  const database = initDB();
  const result = database.prepare(`
    INSERT INTO videos (channel_id, title, current_stage, views, created_at)
    VALUES (?, ?, 'BUSCA', 0, ?)
  `).run(channelId, cleanTitle, now());

  const video = database.prepare("SELECT * FROM videos WHERE id = ?").get(result.lastInsertRowid) as Video;
  database.prepare(`
    INSERT INTO video_logs (video_id, stage, status, message, created_at)
    VALUES (?, 'BUSCA', 'pendente', 'Vídeo criado no pipeline', ?)
  `).run(video.id, now());

  return video;
}

export function updateVideoStage(videoId: number, stage: PipelineStageName): Video {
  ensureStage(stage);
  const database = initDB();
  const stamp = now();
  const postedAt = stage === "POSTADO" ? stamp : null;

  const result = database.prepare(`
    UPDATE videos
    SET current_stage = ?, posted_at = COALESCE(?, posted_at)
    WHERE id = ?
  `).run(stage, postedAt, videoId);

  if (result.changes === 0) throw new Error(`Video not found: ${videoId}`);

  database.prepare(`
    INSERT INTO video_logs (video_id, stage, status, message, created_at)
    VALUES (?, ?, 'concluido', ?, ?)
  `).run(videoId, stage, `Etapa atualizada para ${stage}`, stamp);

  return database.prepare("SELECT * FROM videos WHERE id = ?").get(videoId) as Video;
}

export function getVideos(channelId: number): Video[] {
  return initDB()
    .prepare("SELECT * FROM videos WHERE channel_id = ? ORDER BY created_at DESC")
    .all(channelId) as Video[];
}

export function getDashboardData(channelId: number): DashboardData {
  const database = initDB();
  const channel = database.prepare("SELECT * FROM channels WHERE id = ?").get(channelId) as Channel | undefined;
  const totalVideos = (database.prepare("SELECT COUNT(*) AS count FROM videos WHERE channel_id = ?").get(channelId) as { count: number }).count;
  const postedVideos = (database.prepare("SELECT COUNT(*) AS count FROM videos WHERE channel_id = ? AND current_stage = 'POSTADO'").get(channelId) as { count: number }).count;
  const totalViews = (database.prepare("SELECT COALESCE(SUM(views), 0) AS total FROM videos WHERE channel_id = ?").get(channelId) as { total: number }).total;
  const nextPost = database.prepare(`
    SELECT * FROM videos
    WHERE channel_id = ? AND current_stage != 'POSTADO'
    ORDER BY created_at ASC
    LIMIT 1
  `).get(channelId) as Video | undefined;
  const stages = database.prepare(`
    SELECT ps.*, COUNT(v.id) AS video_count
    FROM pipeline_stages ps
    LEFT JOIN videos v ON v.channel_id = ps.channel_id AND v.current_stage = ps.stage_name
    WHERE ps.channel_id = ?
    GROUP BY ps.id
    ORDER BY ps.stage_order ASC
  `).all(channelId) as Array<PipelineStage & { video_count: number }>;
  const recentLogs = database.prepare(`
    SELECT vl.*
    FROM video_logs vl
    JOIN videos v ON v.id = vl.video_id
    WHERE v.channel_id = ?
    ORDER BY vl.created_at DESC
    LIMIT 10
  `).all(channelId) as VideoLog[];

  return {
    channel: channel ?? null,
    totalVideos,
    postedVideos,
    pendingVideos: totalVideos - postedVideos,
    totalViews,
    nextPost: nextPost ?? null,
    stages,
    recentLogs,
  };
}

export function getChannelBySlug(slug: string): Channel | null {
  return (initDB().prepare("SELECT * FROM channels WHERE slug = ?").get(slug) as Channel | undefined) ?? null;
}

export function addVideoLog(videoId: number, stage: PipelineStageName, status: StageStatus, message: string): VideoLog {
  ensureStage(stage);
  const database = initDB();
  const result = database.prepare(`
    INSERT INTO video_logs (video_id, stage, status, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(videoId, stage, status, message, now());
  return database.prepare("SELECT * FROM video_logs WHERE id = ?").get(result.lastInsertRowid) as VideoLog;
}
