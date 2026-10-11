FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /runner
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && node node_modules/@prisma/engines/scripts/postinstall.js && npm cache clean --force
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY certs/supabase-prod-ca-2021.crt ./certs/supabase-prod-ca-2021.crt
COPY scripts ./scripts
USER node
ENTRYPOINT ["node", "/runner/scripts/prisma-linux/entry.mjs"]
