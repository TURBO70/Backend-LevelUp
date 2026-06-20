# ─── Stage 1: Builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only package files first — Docker caches this layer
# so "npm install" doesn't rerun every time you change source code
COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

# Now copy source and compile
COPY src ./src
RUN npm run build
# At this point /app/dist contains compiled JS


# ─── Stage 2: Production ───────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./

# --omit=dev skips devDependencies (typescript, ts-node, nodemon, @types/*)
RUN npm install --omit=dev

# Copy ONLY the compiled output from the builder stage
# This is the key line — nothing else from "builder" comes along
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/app.js"]