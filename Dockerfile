# Build stage: install deps and compile the Next.js standalone bundle.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.ts tsconfig.json next-env.d.ts ./
COPY src ./src
COPY public ./public
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# Fail the image build if NFT omitted @swc/helpers ESM (Node 22 module-sync).
# next.config outputFileTracingIncludes must keep this path present.
RUN test -f .next/standalone/node_modules/@swc/helpers/esm/_interop_require_default.js \
  || (echo "FATAL: standalone missing @swc/helpers esm/_interop_require_default.js" && exit 1)

# Runtime stage: only the standalone output, running as a non-root user.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output excludes public/ and .next/static by design — copy both.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
