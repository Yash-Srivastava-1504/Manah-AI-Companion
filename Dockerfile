# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Run as non-root user
RUN addgroup -S manah && adduser -S manah -G manah

WORKDIR /app

# Copy built node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source
COPY --chown=manah:manah . .

# Create data directory for SQLite
RUN mkdir -p /app/data && chown manah:manah /app/data

USER manah

# Expose backend port
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Use dumb-init to handle zombie processes
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]