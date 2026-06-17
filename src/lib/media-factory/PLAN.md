# Media Factory — Plano de Construção

## Stack
- Next.js 15 (já rodando em localhost:3333)
- SQLite via better-sqlite3
- Tailwind CSS (já instalado)

## O que construir

### 1. Banco de dados: src/lib/media-factory/db.ts
Tabelas:
- `channels`: id, name, slug, platform, created_at, active
- `pipeline_stages`: id, channel_id, stage_order, stage_name (BUSCA/THUMB/MUSICA/ANIMACAO/VIDEO_PRONTO/REVISAO/POSTADO), status, updated_at
- `videos`: id, channel_id, title, current_stage, created_at, posted_at
- `video_logs`: id, video_id, stage, status, message, created_at

### 2. API endpoints: src/app/api/media-factory/*
- GET /api/media-factory/channels — lista canais
- POST /api/media-factory/channels — cria canal
- GET /api/media-factory/channels/[id]/pipeline — status pipeline do canal
- GET /api/media-factory/channels/[id]/videos — vídeos do canal
- GET /api/media-factory/channels/[id]/dashboard — métricas (views, vídeos, próximo post)
- PATCH /api/media-factory/videos/[id]/stage — atualiza etapa de um vídeo
- POST /api/media-factory/webhook — endpoint pra agentes reportarem status

### 3. Páginas: src/app/media-factory/
- /media-factory — Kanban principal (com dropdown de canais)
- /media-factory/dashboard — Métricas do canal selecionado

### 4. Integration: src/lib/media-factory/integration.ts
Funções exportadas pra agentes/crons usarem:
- reportStatus(channelSlug, stage, videoTitle, status, message)
- getNextVideo(channelSlug) — próximo vídeo pendente
