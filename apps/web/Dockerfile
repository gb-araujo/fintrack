# syntax=docker/dockerfile:1
# Web FINTRACK — build estático servido pelo Caddy (Railway).
# Contexto de build = RAIZ do monorepo:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.exemplo.com .

FROM node:24-alpine AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @fintrack/shared -w @fintrack/web --include-workspace-root --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# URL pública da API, embutida no bundle em tempo de build (não é segredo).
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @fintrack/shared && npm run build -w @fintrack/web

FROM caddy:2-alpine AS runtime
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 8080
