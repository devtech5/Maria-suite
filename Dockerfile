# Image de production de Maria Suite — serveur Next autonome (output: "standalone").
#
# Debian (glibc) et non Alpine : @node-rs/argon2 est un binaire natif, et sa
# variante musl est la moins éprouvée. Construire DANS l'image garantit que le
# binaire embarqué est celui de la plateforme qui l'exécute.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS dependances
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS construction
COPY --from=dependances /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm build:scripts

FROM node:22-bookworm-slim AS execution
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

# Utilisateur sans privilège ; /donnees/fichiers reçoit les pièces jointes
# (volume persistant, emporté par la sauvegarde).
RUN groupadd --system maria && useradd --system --gid maria maria \
  && mkdir -p /app/.next/cache /donnees/fichiers \
  && chown -R maria:maria /app /donnees

COPY --from=construction --chown=maria:maria /app/.next/standalone ./
COPY --from=construction --chown=maria:maria /app/.next/static ./.next/static
COPY --from=construction --chown=maria:maria /app/public ./public
# Lues au démarrage par MIGRATIONS_AU_DEMARRAGE=1.
COPY --from=construction --chown=maria:maria /app/drizzle ./drizzle
# Scripts d'exploitation empaquetés (esbuild), lancés depuis le terminal du
# conteneur : `node scripts/installer.cjs`. Seul @node-rs/argon2 reste
# externe, et le serveur autonome l'embarque déjà.
COPY --from=construction --chown=maria:maria /app/build/scripts ./scripts

USER maria
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
