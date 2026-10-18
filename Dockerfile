FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY .env.example ./
RUN mkdir -p /app/data && chown -R node:node /app

USER node
VOLUME ["/app/data"]
EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/index.js"]
