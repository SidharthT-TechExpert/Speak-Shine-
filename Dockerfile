# syntax=docker/dockerfile:1

FROM node:22-slim AS frontend-deps

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN npm ci --no-audit --no-fund --prefer-offline

# =========================

FROM frontend-deps AS builder

WORKDIR /app

COPY frontend ./frontend

ENV VITE_API_URL=/api
ENV NODE_ENV=production

RUN cd frontend && npm run build

# =========================

FROM node:22-slim AS runner

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --omit=optional --no-audit --no-fund --prefer-offline && \
    npm cache clean --force

COPY api ./api
COPY backend ./backend
COPY models ./models
COPY scripts ./scripts
COPY --from=builder /app/frontend/dist ./frontend/dist

RUN mkdir -p tmp/uploads

HEALTHCHECK --interval=30s --timeout=10s \
CMD curl -f http://localhost:3001/api/health || exit 1

EXPOSE 3001

CMD ["node", "api/server.js"]
