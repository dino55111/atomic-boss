# better-sqlite3 is a native addon. It ships prebuilt binaries for common
# platforms, but we keep a build toolchain in this stage as a fallback in
# case no prebuilt binary matches the target arch — it never ships in the
# final image.
FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app

CMD ["node", "src/index.js"]
