# Debian-slim rather than Alpine on purpose: Prisma's query engine and sharp's
# native binaries both ship glibc builds by default. Alpine works only if you
# add the musl binaryTargets and rebuild sharp, which is a recurring source of
# "query engine binary not found" at runtime.
FROM node:22-slim AS base
# Prisma's engines need OpenSSL present; the slim image does not include it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# Installed inside the image so sharp and the Prisma engines match this
# platform. Copying a host node_modules in would break both.
RUN npm ci

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* is inlined into the client bundle at build time, so it has to
# be present here - setting it only as a Cloud Run runtime variable leaves it
# undefined in the browser.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# Cloud Run injects PORT and routes to it; hardcoding 3000 fails the health
# check with an opaque "container failed to start".
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# `output: standalone` traces only the runtime dependencies, but it does not
# copy the static assets or public/ - those must be placed by hand or the site
# renders unstyled.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Kept so `prisma migrate deploy` can be run as a one-off job against this
# same image, rather than on container start where concurrent instances race.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
