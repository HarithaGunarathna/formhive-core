# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025 Formhive Contributors

FROM node:20-alpine

WORKDIR /app

# Copy workspace and dependency manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/events/package.json packages/events/
COPY apps/validator/package.json apps/validator/

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source code and tsconfig
COPY packages/db/src packages/db/src
COPY packages/db/tsconfig.json packages/db/
COPY packages/types/src packages/types/src
COPY packages/types/tsconfig.json packages/types/
COPY packages/events/src packages/events/src
COPY packages/events/tsconfig.json packages/events/
COPY apps/validator/src apps/validator/src
COPY apps/validator/tsconfig.json apps/validator/

# Build
RUN pnpm --filter @formhive/validator... build

CMD ["node", "apps/validator/dist/index.js"]
