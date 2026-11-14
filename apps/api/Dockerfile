FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @foodtrack/api... && pnpm --filter @foodtrack/api build

FROM node:22-alpine
WORKDIR /repo/apps/api
ENV NODE_ENV=production
RUN corepack enable && addgroup -S app && adduser -S app -G app
COPY --from=build /repo /repo
COPY config /repo/config
COPY apps/api/migrations /repo/apps/api/migrations
USER app
EXPOSE 4000
CMD ["node", "dist/server.js"]
