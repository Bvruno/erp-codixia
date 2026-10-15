# API Hono (@erp/api) del monorepo ERP Codixia.
# Node 22 + tsx (el contrato compartido @erp/shared se transpila al vuelo).
FROM node:22-alpine

WORKDIR /app

# Solo los package.json de los workspaces: cachea la instalación.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/plataforma/package.json apps/plataforma/
COPY packages/shared/package.json packages/shared/

RUN npm ci

# Código necesario para la API.
COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /app/apps/api

ENV NODE_ENV=production
EXPOSE 8787

CMD ["npx", "tsx", "src/index.ts"]
