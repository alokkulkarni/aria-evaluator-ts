# ── Build stage ───────────────────────────────────────────────────────────────
# No --platform flag here: the build stage runs on the host's native platform
# (linux/arm64 on Apple Silicon, linux/amd64 on x86).  This lets npm install
# the correct native esbuild/vite binary for the build host, avoiding the
# QEMU emulation crash that occurs when forcing linux/amd64 on ARM hardware.
# The compiled JS/CSS output is platform-agnostic and is copied into the
# linux/amd64 runtime stage below.
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY . .
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
# Pin to linux/amd64 for ECS Fargate (x86 task family).
# If you deploy to Fargate ARM (graviton), change to linux/arm64.
FROM --platform=linux/amd64 node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends awscli ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app
COPY infra/docker/ecs-entrypoint.sh /usr/local/bin/ecs-entrypoint.sh

RUN chmod +x /usr/local/bin/ecs-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/ecs-entrypoint.sh"]
