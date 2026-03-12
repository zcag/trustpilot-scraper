FROM apify/actor-node:22 AS builder
COPY package*.json ./
RUN npm install --include=dev --audit=false
COPY . .
RUN npm run build

FROM apify/actor-node:22
COPY package*.json ./
RUN npm install --omit=dev --omit=optional --audit=false \
    && npm cache clean --force
COPY --from=builder /usr/src/app/dist ./dist
COPY .actor .actor
CMD ["node", "dist/main.js"]
