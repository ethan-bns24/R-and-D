# -----------------------------------------------------------------------------
# Stage 1: deps
# Install Node dependencies with a lockfile for reproducible builds.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# -----------------------------------------------------------------------------
# Stage 2: builder
# Build the React (Vite) app into static files under /app/dist.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: runtime
# Serve the built static assets with Nginx.
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
