# syntax=docker/dockerfile:1
# mastra-learning-platform: the API serving the built web app on one origin (L72).
# Build:  docker build -t mlp .
# Run:    see compose.yaml and docs/DEPLOYMENT-CONFIG.md (secrets come from files, never from the image).

FROM node:24-bookworm-slim AS build
WORKDIR /app
# Whole workspace: every package.json is needed for npm ci, and the lab sources are read at run time
# (Source tab). .dockerignore keeps .env, .data, node_modules and test output out of the context, and
# npm run deploy:azure builds from a git archive of the commit (tracked files only).
COPY . .
# Defence in depth: local secrets and data must never end up in an image, whatever the build context was.
RUN rm -rf secrets .data .env .env.local \
 && npm ci --no-audit --no-fund \
 && npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && rm -rf e2e test-results playwright-report course-prompts openspec .github

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    MLP_DATA_DIR=/data \
    WEB_DIST_DIR=/app/apps/web/dist \
    AUTH_PROVIDER=password
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
# Liveness only; orchestrators should route traffic on readiness (GET /api/ready).
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/api/dist/server.js"]
