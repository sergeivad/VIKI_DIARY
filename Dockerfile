FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

WORKDIR /app

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate
RUN npm run build

FROM node:22-alpine AS miniapp-builder

WORKDIR /app/miniapp

COPY miniapp/package.json miniapp/package-lock.json ./
RUN npm ci

COPY miniapp/ ./
RUN npm run build

FROM node:22-alpine AS runner

RUN apk add --no-cache ffmpeg

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=miniapp-builder /app/miniapp/dist ./miniapp/dist
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts/entrypoint.sh ./scripts/entrypoint.sh

RUN chmod +x ./scripts/entrypoint.sh

EXPOSE 3000

CMD ["./scripts/entrypoint.sh"]
