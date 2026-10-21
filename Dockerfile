# BPMN Studio — static build served by Caddy.
# Railway detects this file automatically; it also runs with plain Docker:
#   docker build -t bpmn-studio . && docker run -p 8080:8080 bpmn-studio

# ---- build ----------------------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app

# install dependencies first (cached while package files are unchanged)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# type-check and build into /app/dist
RUN npm run build

# ---- serve ----------------------------------------------------------------------
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

# Caddy listens on $PORT (set by Railway); 8080 when PORT is not set
ENV PORT=8080
EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
