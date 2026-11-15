# --- build stage ---
FROM node:22-bookworm-slim AS build
WORKDIR /srv
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# --- runtime stage ---
FROM node:22-bookworm-slim
WORKDIR /srv
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /srv/dist ./dist
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "dist/index.js"]
