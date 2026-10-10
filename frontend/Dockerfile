# Multi-stage production build for the HR_App SPA. This image only ever
# serves static files on the internal Docker network — TLS termination
# and public routing happen one layer up, at the Caddy edge proxy (see
# the repo-root Caddyfile / docker-compose.prod.yml).

# ---- Stage 1: build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# VITE_API_BASE_URL=/api/v1 (see .env.example) is a relative path, so this
# same build works unchanged behind any domain — no per-environment
# rebuild needed.
RUN npm run build

# ---- Stage 2: runtime ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
