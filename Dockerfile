# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy workspace package definitions
COPY package.json package-lock.json* pnpm-workspace.yaml* turbo.json* ./
COPY packages/ ./packages/
COPY apps/backend/ ./apps/backend/

# Install dependencies across monorepo
RUN npm ci --no-audit --prefer-offline || npm install

# Build shared packages and NestJS backend
RUN npm run build --prefix packages/shared-types || true
RUN npm run build --prefix packages/validation-schemas || true
RUN npm run build --prefix apps/backend

# =========================
# Production Runner
# =========================
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/ ./packages/
COPY apps/backend/package.json ./apps/backend/package.json

# Install production dependencies
RUN npm ci --omit=dev --no-audit --prefer-offline || npm install --omit=dev

# Copy compiled backend output from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

EXPOSE 3001

CMD ["node", "apps/backend/dist/apps/backend/src/main.js"]
