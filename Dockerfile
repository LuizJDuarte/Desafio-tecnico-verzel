# Imagem única da aplicação: a API NestJS serve o front React já compilado (mesma origem, sem CORS).
# Três estágios: build (tudo), dependências de produção só da API e a imagem final enxuta.

ARG NODE_IMAGE=node:22-bookworm-slim

# 1) Build: instala todas as dependências e compila o pacote compartilhado, a API e o front.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
# Os package.json vêm antes do código para o cache do npm ci sobreviver a mudanças no código.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build

# 2) Só as dependências de produção da API (sem React, Vite, Jest, TypeScript...).
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts --workspace=@arremate/api

# 3) Imagem final: roda como usuário sem privilégios.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node packages/shared/package.json packages/shared/
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --chown=node:node apps/api/package.json apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
# As migrations rodam na inicialização; com SEED_DEMO_DATA=true a seed roda se o banco estiver vazio.
CMD ["node", "apps/api/dist/main.js"]
