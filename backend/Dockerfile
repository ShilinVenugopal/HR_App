# Multi-stage production build for the HR_App API.
# Debian-slim (not Alpine) — avoids Prisma's musl/OpenSSL engine
# mismatches that Alpine images are notorious for.

# ---- Stage 1: build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma's engine binaries need libssl at both `prisma generate` (this
# stage) and `prisma migrate deploy` (runtime stage) time — the bare
# bookworm-slim image doesn't include it, which makes Prisma silently
# fall back to a guessed OpenSSL version and fail with an opaque
# "Schema engine error".
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies now that the build artifacts (dist/) exist — the
# generated Prisma client (node_modules/.prisma) survives this prune since
# it lives inside node_modules, not in package.json's dependency list.
RUN npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system appgroup && useradd --system --create-home --gid appgroup appuser

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# prisma/ (schema + migrations) is needed at runtime for `prisma migrate
# deploy`, which runs as this container's entrypoint on every start.
COPY --from=build /app/prisma ./prisma
# `npm run seed` executes prisma/seed.ts directly via tsx (not the
# compiled dist/) and seed.ts imports several helpers from ../src/ by
# relative path — so src/ has to exist at runtime for the one-time
# `docker compose exec backend npm run seed` step to work.
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY package.json ./

RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app
USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# `prisma migrate deploy` only applies pending migrations (idempotent) —
# safe to run on every container start, so a fresh deploy and a restart
# of an already-up-to-date DB behave identically.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
