FROM node:20-slim

# Install ffmpeg once — Docker layer is cached by Railway
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (cached unless package.json changes)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

EXPOSE 3000

CMD ["node", "--max-old-space-size=512", "index.js"]
