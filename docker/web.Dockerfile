# Web Vite (@erp/web) del monorepo ERP Codixia.
# Etapa 1: build estático con las variables VITE_* (se incrustan en el bundle).
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/plataforma/package.json apps/plataforma/
COPY packages/shared/package.json packages/shared/

RUN npm ci

COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY} \
    VITE_API_URL=${VITE_API_URL} \
    VITE_WS_URL=${VITE_WS_URL}

RUN npm run build -w @erp/web

# Etapa 2: servidor estático sin dependencias (apps/web/servidor.mjs).
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4173

COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/servidor.mjs ./servidor.mjs

EXPOSE 4173

CMD ["node", "servidor.mjs"]
