FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./server.js
COPY public ./public

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=4768
ENV DATA_DIR=/data

EXPOSE 4768

CMD ["node", "server.js"]
