FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends clamav-daemon clamav-freshclam clamdscan qpdf ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs entrypoint.sh ./
RUN chmod +x /app/entrypoint.sh && mkdir -p /run/clamav && chown clamav:clamav /run/clamav
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
