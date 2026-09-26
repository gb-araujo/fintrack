# syntax=docker/dockerfile:1
# API FINTRACK — imagem de produção (Railway).
# Contexto de build = RAIZ do monorepo:  docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
WORKDIR /app
ENV CI=true

# ---------- dependências completas (para compilar) ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @fintrack/shared -w @fintrack/api --include-workspace-root --ignore-scripts

# ---------- build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @fintrack/shared && npm run build -w @fintrack/api

# ---------- apenas dependências de produção ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @fintrack/shared -w @fintrack/api --omit=dev --ignore-scripts \
  && npm cache clean --force

# ---------- runtime ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps --chown=node:node /app ./
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --chown=node:node database/migrations database/migrations

USER node
WORKDIR /app/apps/api
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations rodam no preDeployCommand do Railway (apps/api/railway.json), não no start.
CMD ["node", "dist/server.js"]
