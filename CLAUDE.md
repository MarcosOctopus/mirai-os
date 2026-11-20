# MIRAI OS — Full Project Context

## Project Location
`/opt/data/mirai-app`

## Stack
- **Framework:** Next.js 15.5.19 (App Router)
- **3D Engine:** Three.js + @react-three/fiber + @react-three/drei
- **Build:** `npm run build`
- **Server:** `node node_modules/.bin/next start -p 3333`
- **Deploy URL:** app.miraitohope.com (Caddy reverse proxy)

## Vision
MIRAI OS is NOT a chatbot or dashboard. It is a **cognitive operating system** — the visual presence of an artificial intelligence named Mirai.

The initial screen should feel like an AI waiting to awaken:
- **Focus:** Orb 3D center (25-35% of screen)
- **Background:** Alive with particles, digital stars, holographic grid, ghost data, neural lines
- **Minimal:** Clock, subtle "toque para despertar" hint
- **No:** Cards, widgets, charts, progress bars, tables, technical text

## Orb 3D Architecture (5 Layers)
1. Core Energy — pulsating center
2. Neural Particles — 10,000+ fibonacci-distributed particle sphere
3. Orbital Rings — rotating rings at different speeds
4. Energy Flow — 2,000+ traveling particles
5. Holographic Field — translucent rotating field

## Orb States
- **idle:** Breathing, slow rotation, particles orbit gently
- **listening:** Bars react to mic, particles converge, brightness increases
- **thinking:** Rings accelerate 3x, neural connections appear, energy flows
- **speaking:** Concentric waves expand, orb vibrates with voice
- **executing:** Energy tunnel, intense processing
- **done:** White flash that fades

## Interactions
- **Tap orb** → Awaken (orb expands, rings accelerate, UI slides in)
- **First voice or text** → Also triggers awakening
- **After awake:** Chat overlay + ConsoleInput appear

## Components Already Built (may need redesign)
- `src/components/MiraiOrb3D.tsx` — 3D Three.js orb (need MORE particles: 12,000-20,000)
- `src/components/BackgroundCanvas.tsx` — particle field, grid, stars, ghost data
- `src/components/ConsoleInput.tsx` — terminal-style input bar
- `src/hooks/useVoice.ts` — voice/speech integration
- `src/lib/voice.ts` — TTS via ElevenLabs + browser fallback

## MyAPI Provider
Claude Code is configured to use MyAPI (api.myapi.world) with `claude-opus-4-8` model.
The API key is in `~/.claude/settings.json`.

## Audio Issues
- ElevenLabs TTS was working, then stopped
- Key is in `/opt/data/mirai-app/.credentials/elevenlabs.env`
- Should use ELEVENLABS_API_KEY for TTS
- Voice ID: `UPMmrmly8qbddSJ3ycdB`
- Fallback: browser SpeechSynthesis

## Key Configs
- `.mirai_key` — MyAPI key for the chat backend
- `.credentials/elevenlabs.env` — ElevenLabs key for TTS
- `src/app/api/chat/route.ts` — Chat streaming via MyAPI
- `src/app/api/tts/route.ts` — TTS proxy
- Globals: `src/app/globals.css` — all animations and styles

## Critical Design Rules
1. NO cards, NO widgets, NO progress bars, NO tables, NO Power BI look
2. Must look like Jarvis/Batcomputer/Command Center, not a SaaS dashboard
3. Background must never be static — always alive with subtle motion
4. Orb is the protagonist — everything else is secondary
5. The "awake" interaction is key: tap orb to awaken
6. Audio must work — speech + voice commands
7. Particles: minimum 10,000, preferably 15,000-20,000
8. Never empty/lonely — the screen must feel like an AI presence

## Previous Approaches That Didn't Work
- CSS orb with gradients (too simple, looked like a shiny ball)
- Dashboard with 6 panels (looked like Power BI)
- Cards and widgets (administrative look)
- Empty black background with single orb (too lonely)

## Organizações — porta do usuário (20/11/2026)
- `/organizacoes` é de TODOS (lista "as minhas" + criar). `/admin/organizacoes` continua só-dono (todas as empresas, credencial Saaso).
- `POST /api/organizacoes` cria: qualquer conta autenticada, teto de 20 orgs por conta; quem cria vira `admin` da org (`criarOrganizacao({clienteEmail})`).
- `PATCH /api/organizacoes` adiciona membro: aceito para dono da plataforma OU `admin`/`dono` DAQUELA org (403 fora disso; 409 se o e-mail já está em outra org).
- Escopo: a pessoa vê só as orgs dela; o dono vê todas (filtro no servidor).
- A rota está no catálogo de visibilidade (`/admin/visibilidade`) e nasce `publico`.

## Task
Redesign and rebuild the MIRAI OS from scratch. Use Three.js for the orb. Make it feel alive, cinematic, intelligent. The user should feel they're operating a real AI, not using a web app.
