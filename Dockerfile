FROM node:18-slim AS builder
RUN apt-get update -y && apt-get install -y openssl
# Build step
WORKDIR /usr/src/app
COPY .env* ./


COPY package*.json ./
COPY ./src ./src
COPY ./prisma ./prisma
COPY tsconfig.json .

RUN npm install
RUN npx prisma generate
RUN npm run build

# Serve step
FROM node:18-slim AS runner
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/prisma ./prisma

#optional copy env file
COPY .env* ./

EXPOSE 3001
ENV NODE_ENV=production
CMD [ "npm", "run", "start" ]
