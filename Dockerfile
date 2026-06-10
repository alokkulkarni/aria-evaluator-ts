# syntax=docker/dockerfile:1
# ── Build stage ───────────────────────────────────────────────────────────────
# Always build on the native builder architecture so Vite/esbuild can run
# without QEMU emulation crashes during cross-platform builds.
FROM --platform=$BUILDPLATFORM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY . .
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
# Runtime platform follows docker build --platform (set by Terraform module).
FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends awscli ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app
COPY infra/docker/ecs-entrypoint.sh /usr/local/bin/ecs-entrypoint.sh

RUN npm ci --omit=dev \
  && chmod +x /usr/local/bin/ecs-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/ecs-entrypoint.sh"]
