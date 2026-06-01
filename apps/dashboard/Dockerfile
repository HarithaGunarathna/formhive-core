# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025 Formhive Contributors

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace manifests so pnpm can resolve the workspace graph
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/types/package.json packages/types/
COPY apps/dashboard/package.json apps/dashboard/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/types/src packages/types/src
COPY packages/types/tsconfig.json packages/types/
COPY apps/dashboard/src apps/dashboard/src
COPY apps/dashboard/index.html apps/dashboard/
COPY apps/dashboard/vite.config.ts apps/dashboard/
COPY apps/dashboard/tsconfig.json apps/dashboard/

# VITE_API_URL is embedded at build time; the nginx proxy makes /api work at runtime
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm --filter @formhive/dashboard exec vite build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
