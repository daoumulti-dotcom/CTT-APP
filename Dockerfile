FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build \
    && mkdir -p /app/data /backups \
    && chown -R node:node /app /backups

USER node
EXPOSE 5000

CMD ["sh", "-c", "npx prisma db push && node server.js"]
