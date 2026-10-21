# ==============================================================================
# FinPocket Backend API — Production Multi-Stage Dockerfile
# Stage 1: Build & Compile TypeScript
# Stage 2: Secure, Non-Root Minimal Production Runner
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. BUILDER STAGE
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install native compilation dependencies for sqlite3 / bcrypt
RUN apk add --no-cache python3 make g++

# Install all dependencies (including devDependencies for TypeScript build)
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy TypeScript source code and build production JavaScript bundle
COPY src ./src
RUN npm run build

# ------------------------------------------------------------------------------
# 2. RUNNER STAGE (Production)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Security: Install dumb-init for robust PID 1 signal forwarding and graceful shutdown
RUN apk add --no-cache dumb-init

# Security: Create non-root system user and group (UID 10001)
RUN addgroup -g 10001 -S finpocket && \
    adduser -u 10001 -S finpocket -G finpocket

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3001

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

# Create runtime directory for data/temp files and assign ownership to non-root user
RUN mkdir -p /app/data && \
    chown -R finpocket:finpocket /app

# Drop root privileges
USER finpocket

# Expose backend service port
EXPOSE 3001

# Built-in Container Health Check against /health/live endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/health/live || exit 1

# Signal forwarding via dumb-init for graceful shutdown on SIGTERM / SIGINT
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
