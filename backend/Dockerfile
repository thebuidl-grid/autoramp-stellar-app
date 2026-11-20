# syntax=docker/dockerfile:1

ARG NODE_VERSION=20-alpine

# ---- base: pnpm via corepack, version driven by package.json#packageManager ----
FROM node:${NODE_VERSION} AS base
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

# ---- deps: install full dependency tree + compile native modules (bcrypt) ----
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build: generate prisma client + compile TypeScript (swc) ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
# prisma.config.ts reads DATABASE_URL eagerly; only used to generate the client, never a real connection
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db" pnpm run generate
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

# ---- migrate: full deps (prisma CLI is a devDependency) for `prisma migrate deploy` ----
FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---- runtime: minimal image with only what's needed to run ----
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app

# openssl is required by the Prisma query engine on Alpine
RUN apk add --no-cache openssl \
  && addgroup -S app && adduser -S app -G app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

USER app

ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/main"]
