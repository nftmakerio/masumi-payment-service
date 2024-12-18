FROM node:18-alpine AS builder

# Build step
WORKDIR /usr/src/app
RUN apk add --no-cache openssl1.1-compat
COPY .env* ./.env || true

COPY package*.json ./
COPY ./src ./src
COPY ./prisma ./prisma
COPY tsconfig.json .

RUN npm install
RUN npx prisma generate
RUN npm run build

# Serve step
FROM node:18-alpine AS runner
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/prisma ./prisma
# Install OpenSSL 1.1
RUN apk add --no-cache openssl1.1-compat


#optional copy env file
COPY .env* ./.env || true

EXPOSE 3001
ENV NODE_ENV=production
CMD [ "npm", "run", "start" ]
