FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY tsconfig.json ./
COPY agent.md ./
COPY src/ ./src/

ENV TZ=Europe/Istanbul
ENV NODE_ENV=production

# Scheduler modunda calisir (cron: 08:00, 13:00, 16:30)
CMD ["npx", "tsx", "src/scheduler.ts"]
