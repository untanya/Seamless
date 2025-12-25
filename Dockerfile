# ---------- 1) Install deps avec Bun ----------
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app

# Bun crée un bun.lock (sans b)
COPY package.json bun.lock ./

# Installe les deps à partir du lock
RUN bun install --frozen-lockfile

# ---------- 2) Build Next avec Bun ----------
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

# Utilise ton script "build": "next build"
RUN bun run build

# ---------- 3) Runner minimal Node ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# User non-root pour la sécu
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# Fichiers nécessaires grâce au mode `output: "standalone"`
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
