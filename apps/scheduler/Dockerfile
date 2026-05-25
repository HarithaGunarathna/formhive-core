# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025 Formhive Contributors

FROM node:20-alpine

WORKDIR /app

# Copy workspace and dependency manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/db/package.json packages/db/
COPY packages/events/package.json packages/events/
COPY apps/scheduler/package.json apps/scheduler/

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source code and tsconfig
COPY packages/db/src packages/db/src
COPY packages/db/tsconfig.json packages/db/
COPY packages/events/src packages/events/src
COPY packages/events/tsconfig.json packages/events/
COPY apps/scheduler/src apps/scheduler/src
COPY apps/scheduler/tsconfig.json apps/scheduler/

# Build
RUN pnpm --filter @formhive/scheduler... build

CMD ["node", "apps/scheduler/dist/index.js"]
