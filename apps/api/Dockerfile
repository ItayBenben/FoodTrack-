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
# the photo volume mounts here; a new named volume takes this ownership, so the app user can write photos
RUN mkdir -p /data/media && chown app:app /data/media && chmod 700 /data/media
USER app
EXPOSE 4000
CMD ["node", "dist/server.js"]
