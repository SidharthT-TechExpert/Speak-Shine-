# syntax=docker/dockerfile:1

# =========================
# Dependencies Stage
# =========================
FROM node:22-slim AS deps

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files only for better cache
COPY package.json package-lock.json ./
COPY api/package.json api/package-lock.json* ./api/
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install dependencies
RUN npm ci --no-audit --no-fund --prefer-offline && \
    cd api && npm ci --no-audit --no-fund --prefer-offline && \
    cd ../frontend && npm ci --no-audit --no-fund --prefer-offline

# =========================
# Builder Stage
# =========================
FROM deps AS builder

WORKDIR /app

COPY . .

ENV VITE_API_URL=/api
ENV NODE_ENV=production

# Build frontend
RUN cd frontend && npm run build

# =========================
# Production Runner
# =========================
FROM node:22-slim AS runner

ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only production files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/api ./api
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/models ./models
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/frontend/dist ./frontend/dist

# Create temp upload directory
RUN mkdir -p tmp/uploads

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
CMD curl -f http://localhost:3001 || exit 1

EXPOSE 3001

CMD ["node", "api/server.js"]