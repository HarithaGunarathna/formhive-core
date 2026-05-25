# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025 Formhive Contributors

FROM node:20-alpine

WORKDIR /app

# Copy workspace and dependency manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/events/package.json packages/events/
COPY apps/notification/package.json apps/notification/

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source code and tsconfig
COPY packages/events/src packages/events/src
COPY packages/events/tsconfig.json packages/events/
COPY apps/notification/src apps/notification/src
COPY apps/notification/tsconfig.json apps/notification/

# Build
RUN pnpm --filter @formhive/notification... build

CMD ["node", "apps/notification/dist/index.js"]
