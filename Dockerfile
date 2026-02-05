# ----------------------------
# Stage 1: Build the app
# ----------------------------
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Use 'npm ci' for a strictly reproducible build
RUN npm ci

COPY . .

RUN npm run build

# ----------------------------
# Stage 2: Production Server
# ----------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Install serve globally
RUN npm install -g serve

# Create a non-root user (Best Practice for Security)
# The 'node' user already exists in the official image
USER node

# Copy files with correct ownership for the non-root user
COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["serve", "-s", "dist", "-l", "8080"]