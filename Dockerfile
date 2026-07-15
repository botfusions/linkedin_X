FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY tsconfig.json ./
COPY agent.md ./
COPY src/ ./src/

# sharp SVG text (hava overlay'i) font render icin fontconfig + Roboto fontunu
# sistem genelinde kaydet. node:20-slim'de font/fontconfig yoksa sharp @font-face'i
# render edemez -> overlay texti bos cikar, hava görseli bilgisiz yayinlanir.
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig \
    && mkdir -p /usr/share/fonts/truetype/botfusions \
    && cp src/assets/Roboto-Bold.ttf /usr/share/fonts/truetype/botfusions/ \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Europe/Istanbul
ENV NODE_ENV=production

# Scheduler modunda calisir (cron: 08:00, 13:00, 16:30)
CMD ["npx", "tsx", "src/bootstrap.ts"]
