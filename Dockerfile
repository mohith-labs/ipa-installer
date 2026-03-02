# ============ Stage 1: Build ============
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Copy source code and config
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ src/

# Build TypeScript
RUN npm run build

# ============ Stage 2: Production ============
FROM node:20-slim AS production

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built output from builder stage
COPY --from=builder /app/dist ./dist

# Copy static frontend assets
COPY public/ public/

# Create uploads directory
RUN mkdir -p uploads

# Default environment variables
ENV PORT=3000
ENV UPLOAD_DIR=./uploads
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
