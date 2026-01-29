# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Generate Prisma client
FROM deps AS prisma
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN bunx prisma generate

# Production image
FROM base AS runner

ENV NODE_ENV=production

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy dependencies and generated Prisma client
COPY --from=prisma /app/node_modules ./node_modules
COPY --from=prisma /app/prisma ./prisma

# Copy source code
COPY package.json ./
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY src ./src
COPY entrypoint.sh ./

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 appuser \
    && chmod +x entrypoint.sh
USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
