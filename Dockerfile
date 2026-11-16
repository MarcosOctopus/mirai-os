# MIRAI OS — build reprodutível para o Coolify (D2)
# Motivo: elimina a causa do incidente de 16/11 (build manual no diretório
# compartilhado: EACCES por dono root, OOM no heap padrão, .next divergente do
# processo em memória). Aqui o build acontece em imagem limpa, com heap alto,
# e o artefato é imutável.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
# heap alto: o build do Next 15 passa de 4 GB (foi a causa do OOM)
ENV NODE_OPTIONS=--max-old-space-size=8192 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# next.config.ts é lido em runtime pelo next start
COPY --from=build /app/next.config.ts ./next.config.ts
RUN useradd -m -u 10001 mirai && chown -R mirai:mirai /app
USER mirai
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start", "-p", "3000"]
