# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

# Build-time configuration for API/WS endpoints and auth cookie mode
ARG VITE_API_BASE
ARG VITE_WS_URL
ARG VITE_AUTH_COOKIES=1
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_AUTH_COOKIES=${VITE_AUTH_COOKIES}

# Ensure the env vars are available during the build command
RUN VITE_API_BASE=${VITE_API_BASE} \
    VITE_WS_URL=${VITE_WS_URL} \
    VITE_AUTH_COOKIES=${VITE_AUTH_COOKIES} \
    npm run build

FROM nginx:1.27-alpine

# Harden the default nginx config for single-page app hosting
COPY infra/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
