FROM node:20-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY extension/package.json extension/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm --workspace backend run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev --workspace backend

COPY --from=build /app/backend/dist backend/dist
COPY backend/db backend/db

EXPOSE 3000
CMD ["npm", "--workspace", "backend", "run", "start:all"]
