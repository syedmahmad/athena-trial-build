# syntax=docker/dockerfile:1.7
#
# Athena Next.js production image (Northflank).
#
# The runner stage uses Microsoft's Playwright base image because the
# `/api/reports/pdf` route launches a headless Chromium to capture the
# /reports/print page as a PDF. The base image ships glibc + Chromium
# + all the system fonts/libs the browser needs — much simpler than
# bolting Chromium onto node:22-slim by hand. Image size adds ~450MB
# but the alternative is `playwright install-deps` running every cold
# start, which is slower and more fragile.
#
# The version pin (v1.59.1-jammy) MUST match the `playwright` npm
# package version in package.json — Playwright validates the runtime
# library against the browser binary and refuses to launch on mismatch.

# --- Base used for deps + build (Alpine is fine here; Chromium isn't
# launched during build) ---
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# Skip downloading the Chromium binary during pnpm install — we use the
# binary baked into the Playwright base image at runtime.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Cache the pnpm content-addressable store across builds (BuildKit cache
# mount). On an unchanged lockfile the store is already warm, so install
# is hardlink-only instead of re-downloading + extracting every package.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store --global && \
    pnpm install --frozen-lockfile

# --- Build ---
FROM base AS builder
WORKDIR /app
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLARITY_ID
ENV NEXT_PUBLIC_CLARITY_ID=$NEXT_PUBLIC_CLARITY_ID
ARG NEXT_PUBLIC_UMAMI_SRC
ENV NEXT_PUBLIC_UMAMI_SRC=$NEXT_PUBLIC_UMAMI_SRC
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_SUPABASE_URL=https://xyhkkzuomlzfqfkdyoor.supabase.co
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_8-B1tV0mH10iBA8AJtDvFA_g2DLFh6I
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Persist the Next.js build cache (.next/cache) across builds so webpack
# only recompiles modules that actually changed. This is the largest
# single win for repeat builds. The cache stays on the builder — the
# runtime image copies only .next/standalone + .next/static, never
# .next/cache, so nothing here bloats the final image.
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    pnpm build

# --- Production runner: Playwright base provides Chromium + system deps ---
FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS runner
WORKDIR /app
ENV NODE_ENV=production
# Tell Playwright where to find the pre-installed Chromium so it
# doesn't try to download one at first launch.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --create-home nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The Next.js standalone output bundles dependencies it traced from
# the server, but Playwright is loaded dynamically — bring its
# node_modules over explicitly so `import("playwright")` resolves at
# runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright-core ./node_modules/playwright-core

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
