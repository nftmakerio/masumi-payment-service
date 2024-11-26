FROM node:18-alpine AS builder

# Build step
WORKDIR /usr/src/app

#optional copy env file
COPY .env .env

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

#optional copy env file
COPY .env .env

EXPOSE 3001
ENV NODE_ENV=production
CMD [ "npm", "run", "start" ]
