FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ linux-headers libusb-dev eudev-dev

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install --prefer-offline

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libusb eudev

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3030

CMD ["node", "server.js", "-p", "3030"]