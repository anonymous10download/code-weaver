# ----------------------------
# Stage 1: Build the app
# ----------------------------
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Use 'npm ci' for a strictly reproducible build
RUN npm ci

COPY . .

# Point the SPA at the same-origin reverse-proxied mermaid renderer (see
# nginx.conf + docker-compose.yml). Override at build time to use a different
# endpoint, e.g. `--build-arg VITE_MERMAID_IMG_BASE=https://mermaid.ink/img/`.
ARG VITE_MERMAID_IMG_BASE=/mermaid/img/
ENV VITE_MERMAID_IMG_BASE=${VITE_MERMAID_IMG_BASE}

RUN npm run build

# ----------------------------
# Stage 2: Production Server (nginx)
# ----------------------------
# Using nginx (unprivileged variant — runs as the `nginx` user, listens on
# 8080) so we can both serve the SPA and reverse-proxy `/mermaid/` to the
# self-hosted mermaid renderer container from a single origin.
FROM nginxinc/nginx-unprivileged:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
