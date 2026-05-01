# syntax=docker/dockerfile:1
FROM node:22-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Copy ONLY package files first so this layer is cached until deps change ──
COPY package.json package-lock.json ./
COPY api/package.json api/package-lock.json* ./api/
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install all deps in one cached layer (including dev deps for build)
RUN npm ci --no-audit --no-fund --prefer-offline && \
    cd api && npm install --no-audit --no-fund --prefer-offline && \
    cd ../frontend && npm ci --no-audit --no-fund --prefer-offline

# ── Build stage ───────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN cd frontend && NODE_ENV=production npm run build && ls -la dist/

# ── Final image — only what's needed to run ───────────────────────────────────
FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend deps + source
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/api ./api
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/models ./models
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db.js ./db.js
COPY --from=builder /app/redis.js ./redis.js
COPY --from=builder /app/r2.js ./r2.js
COPY --from=builder /app/package.json ./package.json

# Copy built frontend only (no src, no node_modules)
COPY --from=builder /app/frontend/dist ./frontend/dist

# Temp upload dir
RUN mkdir -p tmp/uploads

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "api/server.js"]
