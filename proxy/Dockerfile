# Apocentro proxy — blind forwarder to the Session network.
# Deployable on any container host (Render, Fly, Railway, a VPS, etc.).
FROM oven/bun:1

WORKDIR /app

# Install dependencies first (patches/ is needed by the patch-package postinstall).
COPY package.json bun.lockb* ./
COPY patches ./patches
RUN bun install

# App source
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
