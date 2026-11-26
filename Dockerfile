# Stylo — one image: API + customer site (/) + back office (/admin/).
# Build:  docker build -t stylo .
# Run:    see deploy/docker-compose.yml (PostgreSQL + HTTPS with Caddy + daily backups).

# ---------------------------------------------------------------- build
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV EXPO_NO_TELEMETRY=1 CI=1

COPY api/package.json api/package-lock.json api/
COPY admin/package.json admin/package-lock.json admin/
COPY mobile/package.json mobile/package-lock.json mobile/
RUN npm --prefix api ci && npm --prefix admin ci && npm --prefix mobile ci

COPY . .
# Customer site = Expo web static export; it calls /v1 on its own origin.
RUN npm --prefix api run build \
 && npm --prefix admin run build \
 && npm --prefix mobile run export:web

# Production dependencies of the API only.
RUN cd api && npm ci --omit=dev

# ---------------------------------------------------------------- backup
# deploy/docker-compose.yml service `backup`: PostgreSQL 16 client tools (pg_dump/pg_restore of the
# server's version) + Node, running dist/scripts/backup.js daemon (daily backup of the database AND
# the photos, encrypted, copied off-site; weekly restore test). See docs/BACKUP.md.
FROM postgres:16-bookworm AS backup
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
WORKDIR /app/api
COPY --from=build /app/api/package.json package.json
COPY --from=build /app/api/node_modules node_modules
COPY --from=build /app/api/dist dist
COPY --from=build /app/database/migrations /app/database/migrations
ENV NODE_ENV=production BACKUP_DIR=/backups UPLOADS_DIR=/app/uploads
CMD ["node", "dist/scripts/backup.js", "daemon"]

# ---------------------------------------------------------------- runtime (default target)
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    CUSTOMER_WEB_DIR=/app/mobile/dist \
    ADMIN_WEB_DIR=/app/admin/dist \
    UPLOADS_DIR=/app/uploads

COPY --from=build /app/api/package.json api/package.json
COPY --from=build /app/api/node_modules api/node_modules
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/database/migrations database/migrations
COPY --from=build /app/admin/dist admin/dist
COPY --from=build /app/mobile/dist mobile/dist
# Uploaded photos (MEDIA_STORAGE=local): a volume in deploy/docker-compose.yml, owned by the app user.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node
WORKDIR /app/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply new migrations (forward-only, tracked in schema_migrations), then start.
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/server.js"]
